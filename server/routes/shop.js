// The shop's own settings, opening hours and broadcasts: /api/v1/shop, /shop-hours, /broadcasts.
// Moved out of server.js; helpers that still live there are handed over when
// it mounts this router (see "Area routers" near the end of server.js).
const express = require("express");
const { asyncHandler, withTransaction } = require("../http");
const pool = require("../db");
const jwt = require("jsonwebtoken");
const { sendPushToShop, recordNotificationForShop } = require("../pushService");

module.exports = function shopRouter({
  authenticateToken,
  forceLogoutCache,
  io,
  notForClients,
  requireAnalyticsAccess,
  requireShopAdminAccess,
  TIME_HHMM,
}) {
  const router = express.Router();

  router.get("/shop", authenticateToken, asyncHandler(async (req, res) => {
    // 2. Add the WHERE clause with the $1 placeholder
    const { rows } = await pool.query(
      `SELECT *
       FROM shops
       WHERE id = $1`, // <--- crucial fix
      [req.shopId],
    );

    // 3. Handle case where shop isn't found
    if (rows.length === 0) {
      return res.status(404).json({ message: "Shop not found" });
    }

    // 5. Send the first item (since ID is unique), not the whole array
    res.json(rows[0]);
  }, { log: "Error fetching shop:" }));

  // PUT: Update Shop Theme Color
  router.put("/shop/theme", authenticateToken, requireShopAdminAccess, asyncHandler(async (req, res) => {
    const { primaryColor } = req.body;

    // Basic Hex Validation (7 characters, starts with #)
    if (!primaryColor || !/^#[0-9A-F]{6}$/i.test(primaryColor)) {
      return res.status(400).json({ error: "Invalid hex color format" });
    }
    const { rowCount } = await pool.query(
      `UPDATE shops
       SET primary_color = $1 
       WHERE id = $2`,
      [primaryColor, req.shopId],
    );

    if (rowCount === 0) {
      return res.status(404).json({ message: "Shop not found" });
    }

    res.json({ message: "Theme updated successfully", primaryColor });
  }, { log: "Error updating theme:" }));

  // Force-logout every user in this shop (revokes all previously-issued tokens
  // on their next request). The calling admin is transparently re-issued a
  // fresh token so their own session survives.
  router.post("/shop/force-logout", authenticateToken, notForClients, asyncHandler(async (req, res) => {
    if (req.user.role !== "super_admin") {
      return res.status(403).json({ error: "Super admins only" });
    }
    // Truncated to whole seconds to match JWT `iat` granularity — otherwise the
    // admin's own token, re-issued a few milliseconds later in this same
    // request, could land in the same second but "before" a sub-second NOW()
    // and get spuriously rejected as revoked.
    const { rows } = await pool.query(
      `UPDATE shops SET force_logout_at = date_trunc('second', NOW())
       WHERE id = $1 RETURNING force_logout_at`,
      [req.shopId],
    );
    if (rows.length === 0) {
      return res.status(404).json({ error: "Shop not found" });
    }

    forceLogoutCache.set(req.shopId, new Date(rows[0].force_logout_at).getTime());

    // Re-issue the calling admin a fresh token (new iat) so their own session
    // survives the revocation that just invalidated everyone else's.
    const freshToken = jwt.sign(
      {
        userId: req.user.userId,
        username: req.user.username,
        role: req.user.role,
        shopId: req.user.shopId,
        staffId: req.user.staffId,
        clientId: req.user.clientId,
      },
      process.env.JWT_SECRET,
      { expiresIn: "24h" },
    );

    // Immediate effect for anyone currently connected; the revocation above
    // guarantees it for everyone else on their next request regardless.
    io.to(`shop:${req.shopId}`).emit("force:logout");

    res.json({ token: freshToken });
  }, { log: "Error forcing shop logout:" }));

  router.put("/shop/services", authenticateToken, requireShopAdminAccess, asyncHandler(async (req, res) => {
    const { ergotherapia, physiotherapia, logotherapia } = req.body;

    // Validation: Ensure all fields are present and are booleans
    // We check for 'undefined' because 'false' is a falsy value in JS
    if (
      typeof ergotherapia === "undefined" ||
      typeof physiotherapia === "undefined" ||
      typeof logotherapia === "undefined"
    ) {
      return res.status(400).json({ error: "Missing therapy service data" });
    }
    const { rowCount } = await pool.query(
      `UPDATE shops
       SET ergotherapia = $1, 
           physiotherapia = $2, 
           logotherapia = $3
       WHERE id = $4`,
      [ergotherapia, physiotherapia, logotherapia, req.shopId],
    );

    if (rowCount === 0) {
      return res.status(404).json({ message: "Shop not found" });
    }

    res.json({
      message: "Services updated successfully",
      services: { ergotherapia, physiotherapia, logotherapia },
    });
  }, { log: "Error updating shop services:" }));

  router.put("/shop/reply-email", authenticateToken, requireShopAdminAccess, asyncHandler(async (req, res) => {
    const { reply_email } = req.body;
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (reply_email && !emailRegex.test(reply_email)) {
      return res.status(400).json({ error: "Invalid email format" });
    }
    await pool.query(`UPDATE shops SET reply_email = $1 WHERE id = $2`, [
      reply_email || null,
      req.shopId,
    ]);
    res.json({ success: true, reply_email: reply_email || null });
  }, { log: "Error updating reply email:" }));

  router.put("/shop/contact", authenticateToken, requireShopAdminAccess, asyncHandler(async (req, res) => {
    const { phone, address, website } = req.body;
    if (
      website &&
      !website.startsWith("http://") &&
      !website.startsWith("https://")
    ) {
      return res
        .status(400)
        .json({ error: "Website must start with http:// or https://" });
    }
    await pool.query(
      `UPDATE shops SET phone = $1, address = $2, website = $3 WHERE id = $4`,
      [phone || null, address || null, website || null, req.shopId],
    );
    res.json({ success: true });
  }, { log: "Error updating shop contact:" }));

  // Toggles the client self-booking portal on/off for the shop. Off by default
  // (see startup DDL) — admin/super_admin only, since it changes what a client
  // JWT is allowed to do (see sanitizeClientBookingPayload).
  router.put(
    "/shop/self-booking",
    authenticateToken,
    requireAnalyticsAccess,
    asyncHandler(async (req, res) => {
      const { self_booking_enabled } = req.body;
      await pool.query(
        `UPDATE shops SET self_booking_enabled = $1 WHERE id = $2`,
        [!!self_booking_enabled, req.shopId],
      );
      res.json({ success: true });
    }, { log: "Error updating self-booking setting:" }),
  );

  router.put(
    "/shop/calendar-settings",
    authenticateToken, requireShopAdminAccess,
    asyncHandler(async (req, res) => {
      const {
        slot_min_time,
        slot_max_time,
        show_weekends,
        reminder_hours_before,
      } = req.body;
      const timePattern = /^\d{2}:\d{2}$/;
      if (!timePattern.test(slot_min_time) || !timePattern.test(slot_max_time)) {
        return res.status(400).json({
          error: "slot_min_time and slot_max_time must be in HH:MM format",
        });
      }
      const hours = parseInt(reminder_hours_before, 10);
      if (!Number.isInteger(hours) || hours < 1 || hours > 72) {
        return res.status(400).json({
          error: "reminder_hours_before must be an integer between 1 and 72",
        });
      }
      await pool.query(
        `UPDATE shops SET slot_min_time = $1, slot_max_time = $2, show_weekends = $3, reminder_hours_before = $4 WHERE id = $5`,
        [slot_min_time, slot_max_time, !!show_weekends, hours, req.shopId],
      );
      res.json({ success: true });
    }, { log: "Error updating calendar settings:" }),
  );

  // Per-day-of-week shop operating hours — a small, deliberately unversioned
  // reference table (unlike staff_working_hours, the shop's own hours aren't
  // expected to need a historical record). Distinct from shops.slot_min_time/
  // slot_max_time, which stay the calendar's fixed rendering viewport bounds
  // (one flat range FullCalendar needs regardless of day) and are untouched by
  // this. A day with no row here means the shop is closed that day.
  router.get("/shop-hours", authenticateToken, notForClients, asyncHandler(async (req, res) => {
    const { rows } = await pool.query(
      `SELECT day_of_week, start_time, end_time FROM shop_hours WHERE shop_id = $1 ORDER BY day_of_week`,
      [req.shopId],
    );
    res.json(rows);
  }));

  router.put("/shop-hours", authenticateToken, requireAnalyticsAccess, asyncHandler(async (req, res) => {
    const { days } = req.body;
    if (!Array.isArray(days)) {
      return res.status(400).json({ error: "days must be an array" });
    }
    const seenDays = new Set();
    for (const day of days) {
      const dow = day?.day_of_week;
      if (!Number.isInteger(dow) || dow < 0 || dow > 6) {
        return res.status(400).json({ error: "day_of_week must be an integer between 0 and 6" });
      }
      if (seenDays.has(dow)) {
        return res.status(400).json({ error: "duplicate day_of_week", day_of_week: dow });
      }
      seenDays.add(dow);
      if (!TIME_HHMM.test(day.start_time) || !TIME_HHMM.test(day.end_time)) {
        return res.status(400).json({ error: "start_time/end_time must be HH:MM", day_of_week: dow });
      }
      if (day.end_time <= day.start_time) {
        return res.status(400).json({ error: "end_time must be after start_time", day_of_week: dow });
      }
    }
    const answer = await withTransaction(async (client) => {
      await client.query(`DELETE FROM shop_hours WHERE shop_id = $1`, [req.shopId]);
      for (const day of days) {
        await client.query(
          `INSERT INTO shop_hours (shop_id, day_of_week, start_time, end_time) VALUES ($1, $2, $3, $4)`,
          [req.shopId, day.day_of_week, day.start_time, day.end_time],
        );
      }
      return { success: true, days };
    });
    res.json(answer);
  }));

  // Admin-authored broadcast (promos, announcements) — immediately fanned out
  // to every push subscription for the shop. No per-recipient delivery ledger,
  // same "fire and forget" simplicity as the existing email reminder job.
  router.post(
    "/broadcasts",
    authenticateToken,
    requireAnalyticsAccess,
    asyncHandler(async (req, res) => {
      const { title, body } = req.body;
      if (!title?.trim() || !body?.trim()) {
        return res.status(400).json({ error: "Title and body are required" });
      }
      const recipientCount = await sendPushToShop(req.shopId, {
        title: title.trim(),
        body: body.trim(),
        url: "/portal/home",
      });
      // Every active client gets the in-app history entry, regardless of
      // whether they have push enabled — recipientCount above (OS push
      // delivery) and this (in-app visibility) are intentionally separate.
      await recordNotificationForShop(req.shopId, {
        type: "broadcast",
        title: title.trim(),
        body: body.trim(),
        url: "/portal/home",
      });
      const { rows } = await pool.query(
        `INSERT INTO broadcast_messages (shop_id, title, body, sent_by_user_id, recipient_count)
         VALUES ($1, $2, $3, $4, $5) RETURNING id, created_at`,
        [req.shopId, title.trim(), body.trim(), req.user.userId, recipientCount],
      );
      res.json({ success: true, id: rows[0].id, recipient_count: recipientCount });
    }, { log: "Broadcast send error:" }),
  );

  router.get(
    "/broadcasts",
    authenticateToken,
    requireAnalyticsAccess,
    asyncHandler(async (req, res) => {
      const { rows } = await pool.query(
        `SELECT id, title, body, recipient_count, created_at
         FROM broadcast_messages WHERE shop_id = $1
         ORDER BY created_at DESC LIMIT 3`,
        [req.shopId],
      );
      res.json(rows);
    }, { log: "Broadcast list error:" }),
  );

  return router;
};
