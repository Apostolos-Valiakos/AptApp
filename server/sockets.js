// The live connection (socket.io): its login check, and what happens on it —
// shop rooms, chat, typing, and the cash/card filter broadcasts.
const { isSessionToken } = require("./middleware/auth");
const jwt = require("jsonwebtoken");
const pool = require("./db");

module.exports = function attachSockets(io, { cardFilterCache, cashFilterCache }) {
  // Socket.IO Authentication Middleware
  io.use((socket, next) => {
    const token = socket.handshake.auth.token;
    if (!token) return next(new Error("Authentication error"));

    jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
      if (err || !isSessionToken(user)) return next(new Error("Authentication error"));
      socket.user = user;
      next();
    });
  });

  // Socket.IO Connection Handler
  io.on("connection", async (socket) => {
    socket.join(`shop:${socket.user.shopId}`);

    // Sync this (re)connecting socket to the shop's current cash/card-filter
    // state. A live broadcast only reaches sockets connected at the exact
    // moment it fires — anyone who was mid-reconnect otherwise stays stuck on
    // stale state (visible cash appointments that should be hidden, or vice
    // versa) until someone happens to toggle it again. Checked fresh on every
    // connection rather than only at login, since a release can also be
    // missed while disconnected.
    try {
      const shopId = socket.user.shopId;
      if (shopId) {
        const shopRes = await pool.query(
          `SELECT force_hide_cash, force_hide_cash_locked_by FROM shops WHERE id = $1`,
          [shopId],
        );
        const hardLocked = !!shopRes.rows[0]?.force_hide_cash;
        if (hardLocked) {
          socket.emit("cash:filter:set", {
            hidden: true,
            lockedBy: shopRes.rows[0]?.force_hide_cash_locked_by || null,
          });
        } else {
          socket.emit("cash:lock:released");
          if (cashFilterCache.has(shopId)) {
            socket.emit("cash:filter:set", { hidden: cashFilterCache.get(shopId), lockedBy: null });
          }
        }
        if (cardFilterCache.has(shopId)) {
          socket.emit("card:filter:set", { hidden: cardFilterCache.get(shopId) });
        }
      }
    } catch (err) {
      console.error("Failed to sync filter state on connect:", err);
    }

    socket.on("channel:join", ({ channelId }) => {
      socket.join(`channel:${channelId}`);
    });

    socket.on("chat:message", async (data) => {
      const {
        channelId,
        content,
        messageType,
        fileName,
        fileSize,
        fileType,
        fileBase64, // The base64 string from the upload route
      } = data;

      try {
        // Convert base64 back to Buffer for Postgres BYTEA
        const binaryData = fileBase64 ? Buffer.from(fileBase64, "base64") : null;

        const result = await pool.query(
          `INSERT INTO chat_messages (
      channel_id, user_id, content, message_type, 
      file_name, file_size, file_type, file_blob, created_at
    )
    VALUES ($1, $2, pgp_sym_encrypt($3, $9), $4, $5, $6, $7, $8, NOW())
    RETURNING id, channel_id, user_id, 
              pgp_sym_decrypt(content::bytea, $9) as content, 
              message_type, file_name, file_size, file_type, created_at`,
          [
            channelId,
            socket.user.userId,
            content, // $3: Plain text content to be encrypted
            messageType || "text",
            fileName || null,
            fileSize || null,
            fileType || null,
            binaryData,
            process.env.MESSAGE_ENCRYPTION_KEY, // $9: The Key
          ],
        );

        const message = result.rows[0];

        const userResult = await pool.query(
          `SELECT u.id, u.username, s.name as staff_name 
           FROM users u LEFT JOIN staff s ON u.staff_id = s.id 
           WHERE u.id = $1`,
          [socket.user.userId],
        );

        const messageWithUser = {
          ...message,
          user: userResult.rows[0],
          read_by: [],
          // IMPORTANT: We don't broadcast the huge BLOB over socket.
          // We broadcast the ID, and frontend uses the /file/:id route to see it.
        };

        io.to(`channel:${channelId}`).emit("chat:message", messageWithUser);

        await pool.query(
          `UPDATE chat_channels SET updated_at = NOW() WHERE id = $1`,
          [channelId],
        );
      } catch (err) {
        console.error("Socket Message Error:", err);
        socket.emit("chat:error", { error: "Failed to save message" });
      }
    });

    socket.on("chat:typing", ({ channelId, isTyping }) => {
      socket.to(`channel:${channelId}`).emit("chat:typing", {
        userId: socket.user.userId,
        isTyping,
      });
    });
    // server.js - Inside io.on("connection", (socket) => { ... })

    socket.on("chat:read:bulk", async ({ channelId, messageIds }) => {
      if (!messageIds || messageIds.length === 0) return;

      const client = await pool.connect();
      try {
        await client.query("BEGIN");

        // 1. Insert receipts for all provided IDs
        for (const msgId of messageIds) {
          await client.query(
            `INSERT INTO message_read_receipts (message_id, user_id, read_at)
           VALUES ($1, $2, NOW())
           ON CONFLICT (message_id, user_id) DO NOTHING`,
            [msgId, socket.user.userId],
          );
        }

        // 2. Update the last_read_at for the channel member
        await client.query(
          `UPDATE channel_members 
         SET last_read_at = NOW() 
         WHERE channel_id = $1 AND user_id = $2`,
          [channelId, socket.user.userId],
        );

        await client.query("COMMIT");

        // 3. Notify everyone in the channel that these messages were read
        io.to(`channel:${channelId}`).emit("messages:read:bulk:update", {
          messageIds,
          userId: socket.user.userId,
          channelId,
        });
      } catch (err) {
        await client.query("ROLLBACK");
        console.error("Bulk read error:", err);
      } finally {
        client.release();
      }
    });
    socket.on("chat:read", async ({ channelId, messageId }) => {
      try {
        await pool.query(
          `INSERT INTO message_read_receipts (message_id, user_id, read_at)
           VALUES ($1, $2, NOW())
           ON CONFLICT (message_id, user_id) DO UPDATE SET read_at = NOW()`,
          [messageId, socket.user.userId],
        );

        await pool.query(
          `UPDATE channel_members 
           SET last_read_at = NOW() 
           WHERE channel_id = $1 AND user_id = $2`,
          [channelId, socket.user.userId],
        );

        io.to(`channel:${channelId}`).emit("chat:read", {
          messageId,
          userId: socket.user.userId,
        });
      } catch (err) {
        console.error("Error marking as read:", err);
      }
    });

    // Remote cash-filter broadcast — super_admin only
    socket.on("cash:filter:broadcast", ({ hidden }) => {
      if (socket.user.role !== "super_admin") return;
      cashFilterCache.set(socket.user.shopId, !!hidden);
      io.to(`shop:${socket.user.shopId}`).emit("cash:filter:set", {
        hidden: !!hidden,
      });
    });

    // Remote card-filter broadcast — super_admin only, independent of cash
    socket.on("card:filter:broadcast", ({ hidden }) => {
      if (socket.user.role !== "super_admin") return;
      cardFilterCache.set(socket.user.shopId, !!hidden);
      io.to(`shop:${socket.user.shopId}`).emit("card:filter:set", {
        hidden: !!hidden,
      });
    });

    socket.on("disconnect", () => {
      console.log(`User disconnected: ${socket.user.userId}`);
    });
  });
};
