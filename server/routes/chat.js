// Staff chat: /api/v1/chat.
// Moved out of server.js; helpers that still live there are handed over when
// it mounts this router (see "Area routers" near the end of server.js).
const express = require("express");
const { asyncHandler, withTransaction } = require("../http");
const pool = require("../db");

module.exports = function chatRouter({
  authenticateToken,
  fileUpload,
  notForClients,
}) {
  const router = express.Router();

  // Get all channels for user's shop
  router.get("/chat/channels", authenticateToken, notForClients, asyncHandler(async (req, res) => {
    const { rows } = await pool.query(
      `SELECT c.*, 
        (SELECT COUNT(*) FROM channel_members WHERE channel_id = c.id) as member_count,
        (SELECT COUNT(*) 
         FROM chat_messages m 
         LEFT JOIN message_read_receipts r ON m.id = r.message_id AND r.user_id = $1
         WHERE m.channel_id = c.id 
         AND m.created_at > COALESCE((SELECT last_read_at FROM channel_members WHERE channel_id = c.id AND user_id = $1), '1970-01-01')
         AND r.id IS NULL
         AND m.user_id != $1
        ) as unread_count
       FROM chat_channels c
       JOIN channel_members cm ON c.id = cm.channel_id
       WHERE cm.user_id = $1 AND c.shop_id = $2
       ORDER BY c.updated_at DESC`,
      [req.user.userId, req.shopId],
    );
    res.json(rows);
  }, { log: "Error fetching channels:" }));

  // Create new channel
  router.post("/chat/channels", authenticateToken, notForClients, asyncHandler(async (req, res) => {
    const { name, description, memberIds = [] } = req.body;
    const answer = await withTransaction(async (client) => {
      const channelResult = await client.query(
        `INSERT INTO chat_channels (shop_id, name, description, created_by)
         VALUES ($1, $2, $3, $4) RETURNING *`,
        [req.shopId, name, description, req.user.userId],
      );

      const channel = channelResult.rows[0];

      await client.query(
        `INSERT INTO channel_members (channel_id, user_id) VALUES ($1, $2)`,
        [channel.id, req.user.userId],
      );

      for (const userId of memberIds) {
        if (userId !== req.user.userId) {
          await client.query(
            `INSERT INTO channel_members (channel_id, user_id) VALUES ($1, $2)`,
            [channel.id, userId],
          );
        }
      }

      return channel;
    });
    res.json(answer);
  }, { log: "Error creating channel:", message: "Failed to create channel" }));

  // Get messages for a channel
  router.get(
    "/chat/channels/:channelId/messages",
    authenticateToken, notForClients,
    asyncHandler(async (req, res) => {
      const { channelId } = req.params;
      const { limit = 100, before } = req.query;
      const memberCheck = await pool.query(
        `SELECT 1 FROM channel_members WHERE channel_id = $1 AND user_id = $2`,
        [channelId, req.user.userId],
      );

      if (memberCheck.rows.length === 0) {
        return res.status(403).json({ error: "Not a member of this channel" });
      }

      let query = `
  SELECT m.id, m.channel_id, m.user_id, m.message_type,
    -- Decrypt the content here
    pgp_sym_decrypt(m.content::bytea, $1) as content,
    m.file_name, m.file_size, m.file_type, m.created_at,
    json_build_object(
      'id', u.id,
      'username', u.username,
      'staff_name', s.name
    ) as user,
    COALESCE(
      json_agg(
        json_build_object('user_id', r.user_id, 'read_at', r.read_at)
      ) FILTER (WHERE r.id IS NOT NULL),
      '[]'
    ) as read_by
  FROM chat_messages m
  JOIN users u ON m.user_id = u.id
  LEFT JOIN staff s ON u.staff_id = s.id
  LEFT JOIN message_read_receipts r ON m.id = r.message_id
  WHERE m.channel_id = $2
`;

      // Update params to include the key first
      const params = [process.env.MESSAGE_ENCRYPTION_KEY, channelId];

      if (before) {
        params.push(before);
        query += ` AND m.created_at < $${params.length}`;
      }

      query += ` GROUP BY m.id, u.id, u.username, s.name
           ORDER BY m.created_at DESC
           LIMIT $${params.length + 1}`;
      params.push(limit);

      const { rows } = await pool.query(query, params);

      res.json(rows.reverse());
    }, { log: "Error fetching messages:" }),
  );

  // Get all shop users for adding to channels
  router.get("/chat/shop-users", authenticateToken, notForClients, asyncHandler(async (req, res) => {
    const { rows } = await pool.query(
      `SELECT u.id, u.username, s.name as staff_name
       FROM users u
       LEFT JOIN staff s ON u.staff_id = s.id
       WHERE u.shop_id = $1
       ORDER BY s.name, u.username`,
      [req.shopId],
    );
    res.json(rows);
  }, { log: "Error fetching shop users:" }));

  router.post(
    "/chat/upload",
    authenticateToken, notForClients,
    fileUpload.single("file"),
    (req, res) => {
      if (!req.file) return res.status(400).json({ error: "No file uploaded" });

      try {
        // Correctly handle Greek/Special characters in filename
        const originalName = Buffer.from(
          req.file.originalname,
          "latin1",
        ).toString("utf8");

        // We return the base64 for the frontend "Optimistic" UI
        const base64Data = req.file.buffer.toString("base64");

        res.json({
          url: `data:${req.file.mimetype};base64,${base64Data}`,
          name: originalName,
          size: req.file.size,
          type: req.file.mimetype,
          // We pass the base64 string so the frontend can send it back via Socket.IO
          base64: base64Data,
        });
      } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Upload processing failed" });
      }
    },
  );

  router.get("/chat/file/:messageId", authenticateToken, notForClients, async (req, res) => {
    try {
      const { messageId } = req.params;
      const { rows } = await pool.query(
        "SELECT file_blob, file_type, file_name FROM chat_messages WHERE id = $1",
        [messageId],
      );

      if (rows.length === 0 || !rows[0].file_blob) {
        return res.status(404).json({ error: "File not found" });
      }

      const { file_blob, file_type, file_name } = rows[0];

      // Handle filename with special characters for download
      const encodedName = encodeURIComponent(file_name);

      res.setHeader("Content-Type", file_type || "application/octet-stream");
      res.setHeader(
        "Content-Disposition",
        `inline; filename*=UTF-8''${encodedName}`,
      );
      res.send(file_blob);
    } catch (err) {
      console.error(err);
      res.status(500).send("Error retrieving file");
    }
  });

  // Get channel members
  router.get(
    "/chat/channels/:channelId/members",
    authenticateToken, notForClients,
    asyncHandler(async (req, res) => {
      const { rows } = await pool.query(
        `SELECT u.id, u.username, s.name as staff_name, cm.joined_at, cm.last_read_at
       FROM channel_members cm
       JOIN users u ON cm.user_id = u.id
       LEFT JOIN staff s ON u.staff_id = s.id
       WHERE cm.channel_id = $1
       ORDER BY s.name, u.username`,
        [req.params.channelId],
      );
      res.json(rows);
    }),
  );

  // Add member to channel
  router.post(
    "/chat/channels/:channelId/members",
    authenticateToken, notForClients,
    asyncHandler(async (req, res) => {
      const { userId } = req.body;
      await pool.query(
        `INSERT INTO channel_members (channel_id, user_id)
       VALUES ($1, $2)
       ON CONFLICT (channel_id, user_id) DO NOTHING`,
        [req.params.channelId, userId],
      );
      res.json({ success: true });
    }),
  );

  return router;
};
