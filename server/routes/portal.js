// The client portal (and availability, which it books from): /api/v1/portal, /push, /availability.
// Moved out of server.js; helpers that still live there are handed over when
// it mounts this router (see "Area routers" near the end of server.js).
const express = require("express");
const { asyncHandler } = require("../http");
const pool = require("../db");
const bcrypt = require("bcrypt");

module.exports = function portalRouter({
  authenticateToken,
  safeUUID,
}) {
  const router = express.Router();

  // Resolves a staff member's effective working-hours window for one date —
  // same version-resolution rule as assertStaffAvailable above, extracted so
  // the availability endpoint can reuse it without re-deriving it. Staff who
  // never enabled a personal schedule fall back to the shop's general opening
  // hours (slot_min_time/slot_max_time), same as how their calendar column
  // behaves today when working_hours_enabled is false.
  const getEffectiveWorkingHoursForDate = async (client, staffId, shopId, date) => {
    const staffRow = await client.query(
      `SELECT working_hours_enabled FROM staff WHERE id = $1 AND shop_id = $2`,
      [staffId, shopId],
    );
    if (!staffRow.rows[0]) return null;
    if (!staffRow.rows[0].working_hours_enabled) {
      const shopRow = await client.query(
        `SELECT slot_min_time, slot_max_time FROM shops WHERE id = $1`,
        [shopId],
      );
      const shop = shopRow.rows[0];
      if (!shop?.slot_min_time || !shop?.slot_max_time) return null;
      return { start_time: shop.slot_min_time, end_time: shop.slot_max_time };
    }

    const versionRow = await client.query(
      `SELECT MAX(effective_from) AS latest FROM staff_working_hours
       WHERE staff_id = $1 AND effective_from <= $2::date`,
      [staffId, date],
    );
    const latestVersion = versionRow.rows[0]?.latest;
    if (!latestVersion) return null;

    const dayRow = await client.query(
      `SELECT start_time, end_time FROM staff_working_hours
       WHERE staff_id = $1 AND effective_from = $2
         AND day_of_week = EXTRACT(DOW FROM $3::date)
       LIMIT 1`,
      [staffId, latestVersion, date],
    );
    return dayRow.rows[0] || null;
  };

  router.put("/portal/profile", authenticateToken, asyncHandler(async (req, res) => {
    if (req.user.role !== "client") {
      return res.status(403).json({ error: "Clients only" });
    }
    const { first_name, last_name, email, phone } = req.body;
    if (!first_name?.trim() || !last_name?.trim()) {
      return res
        .status(400)
        .json({ error: "First name and last name are required" });
    }
    await pool.query(
      `UPDATE clients SET first_name = $1, last_name = $2, email = $3, phone = $4 WHERE id = $5 AND shop_id = $6`,
      [
        first_name,
        last_name,
        email || null,
        phone || null,
        req.user.clientId,
        req.shopId,
      ],
    );
    res.json({ success: true });
  }, { log: "Portal profile update error:" }));

  router.put("/portal/password", authenticateToken, asyncHandler(async (req, res) => {
    if (req.user.role !== "client") {
      return res.status(403).json({ error: "Clients only" });
    }
    const { currentPassword, newPassword } = req.body;
    if (!newPassword || newPassword.length < 6) {
      return res
        .status(400)
        .json({ error: "New password must be at least 6 characters" });
    }
    const { rows } = await pool.query(
      "SELECT password FROM users WHERE id = $1",
      [req.user.userId],
    );
    if (rows.length === 0)
      return res.status(404).json({ error: "User not found" });
    const match = await bcrypt.compare(currentPassword, rows[0].password);
    if (!match)
      return res.status(400).json({ error: "Current password is incorrect" });
    const hashed = await bcrypt.hash(newPassword, 10);
    await pool.query("UPDATE users SET password = $1 WHERE id = $2", [
      hashed,
      req.user.userId,
    ]);
    res.json({ success: true });
  }, { log: "Portal password change error:" }));

  router.post(
    "/portal/appointments/:id/cancel",
    authenticateToken,
    asyncHandler(async (req, res) => {
      if (req.user.role !== "client") {
        return res.status(403).json({ error: "Clients only" });
      }
      const { id } = req.params;
      const check = await pool.query(
        `SELECT id FROM appointments WHERE id = $1 AND client_id = $2 AND shop_id = $3 AND status NOT IN ('cancelled', 'completed')`,
        [id, req.user.clientId, req.shopId],
      );
      if (check.rows.length === 0) {
        return res
          .status(404)
          .json({ error: "Appointment not found or cannot be cancelled" });
      }
      await pool.query(
        `UPDATE appointments SET status = 'cancelled' WHERE id = $1`,
        [id],
      );
      // Restore stock for any product sales on the cancelled appointment
      await pool.query(
        `UPDATE product_inventory pi
         SET stock_quantity = pi.stock_quantity + ps.quantity
         FROM product_sales ps
         WHERE ps.inventory_id = pi.id AND ps.appointment_id = $1`,
        [id],
      );
      await pool.query("DELETE FROM product_sales WHERE appointment_id = $1", [
        id,
      ]);
      res.json({ success: true });
    }, { log: "Portal appointment cancel error:" }),
  );

  router.post(
    "/portal/appointments/:id/confirm",
    authenticateToken,
    asyncHandler(async (req, res) => {
      if (req.user.role !== "client") {
        return res.status(403).json({ error: "Clients only" });
      }
      const { id } = req.params;
      const check = await pool.query(
        `SELECT id FROM appointments
         WHERE id = $1 AND client_id = $2 AND shop_id = $3
           AND status NOT IN ('cancelled', 'completed')
           AND payment_status != 'paid'`,
        [id, req.user.clientId, req.shopId],
      );
      if (check.rows.length === 0) {
        return res
          .status(404)
          .json({ error: "Appointment not found or cannot be confirmed" });
      }
      await pool.query(
        `UPDATE appointments SET status = 'confirmed' WHERE id = $1`,
        [id],
      );
      res.json({ success: true });
    }, { log: "Portal appointment confirm error:" }),
  );

  router.put("/portal/notifications", authenticateToken, asyncHandler(async (req, res) => {
    if (req.user.role !== "client") {
      return res.status(403).json({ error: "Clients only" });
    }
    const { receive_emails } = req.body;
    await pool.query(
      `UPDATE clients SET receive_emails = $1 WHERE id = $2 AND shop_id = $3`,
      [!!receive_emails, req.user.clientId, req.shopId],
    );
    res.json({ success: true });
  }, { log: "Portal notifications update error:" }));

  // --- Client self-booking: read-only, field-allowlisted service/staff lists ---
  // Kept separate from the admin-facing services/staff endpoints so the
  // bookable_online / is_active filters never affect what staff/admin see.
  router.get("/portal/services", authenticateToken, asyncHandler(async (req, res) => {
    if (req.user.role !== "client") {
      return res.status(403).json({ error: "Clients only" });
    }
    const shopRes = await pool.query(
      "SELECT self_booking_enabled FROM shops WHERE id = $1",
      [req.shopId],
    );
    if (!shopRes.rows[0]?.self_booking_enabled) {
      return res.status(404).json({ error: "self_booking_disabled" });
    }
    const { rows } = await pool.query(
      `SELECT s.id, s.name, s.duration_minutes, s.price, s.category, s.color_code
       FROM services s
       LEFT JOIN service_categories sc ON sc.shop_id = s.shop_id AND sc.name = s.category
       WHERE s.shop_id = $1 AND s.is_active = true AND s.bookable_online = true
       ORDER BY COALESCE(sc.sort_order, 999999), s.sort_order, s.name`,
      [req.shopId],
    );
    res.json(rows);
  }, { log: "Portal services list error:" }));

  router.get("/portal/staff", authenticateToken, asyncHandler(async (req, res) => {
    if (req.user.role !== "client") {
      return res.status(403).json({ error: "Clients only" });
    }
    const { service_id } = req.query;
    const validServiceId = safeUUID(service_id);
    if (!validServiceId) {
      return res.status(400).json({ error: "service_id is required" });
    }
    const shopRes = await pool.query(
      "SELECT self_booking_enabled FROM shops WHERE id = $1",
      [req.shopId],
    );
    if (!shopRes.rows[0]?.self_booking_enabled) {
      return res.status(404).json({ error: "self_booking_disabled" });
    }
    const serviceRes = await pool.query(
      "SELECT id FROM services WHERE id = $1 AND shop_id = $2 AND is_active = true AND bookable_online = true",
      [validServiceId, req.shopId],
    );
    if (!serviceRes.rows[0]) {
      return res.status(404).json({ error: "service_not_bookable" });
    }
    // Empty mapping in staff_services means "eligible for every service" —
    // same convention already used for the staff/admin booking picker.
    const { rows } = await pool.query(
      `SELECT s.id, s.name, s.photo_url, s.specialty
       FROM staff s
       WHERE s.shop_id = $1
         AND s.is_active = true
         AND s.visible_in_calendar = true
         AND (
           NOT EXISTS (SELECT 1 FROM staff_services ss WHERE ss.staff_id = s.id)
           OR EXISTS (
             SELECT 1 FROM staff_services ss
             WHERE ss.staff_id = s.id AND ss.service_id = $2
           )
         )
       ORDER BY s.sort_order, s.name`,
      [req.shopId, validServiceId],
    );
    res.json(rows);
  }, { log: "Portal staff list error:" }));

  router.get("/push/vapid-public-key", authenticateToken, (req, res) => {
    res.json({ publicKey: process.env.VAPID_PUBLIC_KEY || null });
  });

  router.get("/portal/notifications", authenticateToken, asyncHandler(async (req, res) => {
    if (req.user.role !== "client") {
      return res.status(403).json({ error: "Clients only" });
    }
    const { rows } = await pool.query(
      `SELECT id, type, title, body, url, read_at, created_at
       FROM notification_deliveries WHERE client_id = $1
       ORDER BY created_at DESC LIMIT 50`,
      [req.user.clientId],
    );
    const unreadCount = rows.filter((r) => !r.read_at).length;
    res.json({ items: rows, unread_count: unreadCount });
  }, { log: "Portal notifications list error:" }));

  router.put(
    "/portal/notifications/read-all",
    authenticateToken,
    asyncHandler(async (req, res) => {
      if (req.user.role !== "client") {
        return res.status(403).json({ error: "Clients only" });
      }
      await pool.query(
        `UPDATE notification_deliveries SET read_at = NOW()
         WHERE client_id = $1 AND read_at IS NULL`,
        [req.user.clientId],
      );
      res.json({ success: true });
    }, { log: "Mark all notifications read error:" }),
  );

  router.put(
    "/portal/notifications/:id/read",
    authenticateToken,
    asyncHandler(async (req, res) => {
      if (req.user.role !== "client") {
        return res.status(403).json({ error: "Clients only" });
      }
      await pool.query(
        `UPDATE notification_deliveries SET read_at = NOW()
         WHERE id = $1 AND client_id = $2 AND read_at IS NULL`,
        [req.params.id, req.user.clientId],
      );
      res.json({ success: true });
    }, { log: "Mark notification read error:" }),
  );

  router.post(
    "/portal/push-subscription",
    authenticateToken,
    asyncHandler(async (req, res) => {
      if (req.user.role !== "client") {
        return res.status(403).json({ error: "Clients only" });
      }
      const { endpoint, keys } = req.body;
      if (!endpoint || !keys?.p256dh || !keys?.auth) {
        return res.status(400).json({ error: "Invalid subscription" });
      }
      await pool.query(
        `INSERT INTO push_subscriptions (client_id, shop_id, endpoint, p256dh, auth, user_agent)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (endpoint) DO UPDATE SET
           client_id = EXCLUDED.client_id,
           shop_id = EXCLUDED.shop_id,
           p256dh = EXCLUDED.p256dh,
           auth = EXCLUDED.auth,
           user_agent = EXCLUDED.user_agent`,
        [
          req.user.clientId,
          req.shopId,
          endpoint,
          keys.p256dh,
          keys.auth,
          req.headers["user-agent"] || null,
        ],
      );
      res.json({ success: true });
    }, { log: "Push subscription save error:" }),
  );

  router.delete(
    "/portal/push-subscription",
    authenticateToken,
    asyncHandler(async (req, res) => {
      if (req.user.role !== "client") {
        return res.status(403).json({ error: "Clients only" });
      }
      const { endpoint } = req.body;
      if (!endpoint) return res.status(400).json({ error: "endpoint is required" });
      await pool.query(
        "DELETE FROM push_subscriptions WHERE endpoint = $1 AND client_id = $2",
        [endpoint, req.user.clientId],
      );
      res.json({ success: true });
    }, { log: "Push subscription delete error:" }),
  );

  // Available start-time slots for one staff member/service/date — used by the
  // client self-booking wizard. Role-agnostic at the route level (staff/admin
  // could reuse it later), but a client caller additionally requires
  // self_booking_enabled + bookable_online, and never sees past-dated slots.
  router.get("/availability", authenticateToken, asyncHandler(async (req, res) => {
    const { service_id, staff_id, date } = req.query;
    const validServiceId = safeUUID(service_id);
    const validStaffId = safeUUID(staff_id);
    if (!validServiceId || !validStaffId || !date) {
      return res
        .status(400)
        .json({ error: "service_id, staff_id and date are required" });
    }
    if (req.user.role === "client") {
      const shopRes = await pool.query(
        "SELECT self_booking_enabled FROM shops WHERE id = $1",
        [req.shopId],
      );
      if (!shopRes.rows[0]?.self_booking_enabled) {
        return res.status(404).json({ error: "self_booking_disabled" });
      }
    }

    const serviceRes = await pool.query(
      req.user.role === "client"
        ? `SELECT duration_minutes FROM services
           WHERE id = $1 AND shop_id = $2 AND is_active = true AND bookable_online = true`
        : `SELECT duration_minutes FROM services WHERE id = $1 AND shop_id = $2`,
      [validServiceId, req.shopId],
    );
    const service = serviceRes.rows[0];
    if (!service) {
      return res.status(404).json({ error: "service_not_found" });
    }
    const durationMinutes = service.duration_minutes || 60;

    const window = await getEffectiveWorkingHoursForDate(
      pool,
      validStaffId,
      req.shopId,
      date,
    );
    if (!window) {
      return res.json({
        date,
        service_id: validServiceId,
        staff_id: validStaffId,
        duration_minutes: durationMinutes,
        slots: [],
      });
    }

    const busyRes = await pool.query(
      `SELECT aps.start_time,
              (aps.start_time + (COALESCE(aps.duration_override, s.duration_minutes, 60) || ' minutes')::interval) AS end_time
       FROM appointment_services aps
       JOIN appointments a ON a.id = aps.appointment_id
       JOIN services s ON s.id = aps.service_id
       WHERE aps.staff_id = $1 AND a.shop_id = $2 AND a.status != 'cancelled'
         AND aps.start_time::date = $3::date`,
      [validStaffId, req.shopId, date],
    );
    const timeOffRes = await pool.query(
      `SELECT start_date, start_time, end_time, type FROM staff_time_off
       WHERE staff_id = $1 AND shop_id = $2
         AND (
           (type = 'leave' AND $3::date BETWEEN start_date AND end_date)
           OR (type = 'break' AND start_date = $3::date)
         )`,
      [validStaffId, req.shopId, date],
    );

    const dayBase = new Date(`${date}T00:00:00`);
    const busyIntervals = busyRes.rows.map((r) => ({
      start: new Date(r.start_time).getTime(),
      end: new Date(r.end_time).getTime(),
    }));
    for (const row of timeOffRes.rows) {
      if (row.type === "leave") {
        busyIntervals.push({ start: -Infinity, end: Infinity });
      } else {
        const [sh, sm] = row.start_time.split(":").map(Number);
        const [eh, em] = row.end_time.split(":").map(Number);
        const start = new Date(dayBase);
        start.setHours(sh, sm, 0, 0);
        const end = new Date(dayBase);
        end.setHours(eh, em, 0, 0);
        busyIntervals.push({ start: start.getTime(), end: end.getTime() });
      }
    }

    const [winStartH, winStartM] = window.start_time.split(":").map(Number);
    const [winEndH, winEndM] = window.end_time.split(":").map(Number);
    const windowStart = new Date(dayBase);
    windowStart.setHours(winStartH, winStartM, 0, 0);
    const windowEnd = new Date(dayBase);
    windowEnd.setHours(winEndH, winEndM, 0, 0);

    const slots = [];
    const stepMs = 15 * 60 * 1000;
    const durationMs = durationMinutes * 60 * 1000;
    const now = Date.now();
    for (
      let t = windowStart.getTime();
      t + durationMs <= windowEnd.getTime();
      t += stepMs
    ) {
      if (req.user.role === "client" && t < now) continue;
      const candidateEnd = t + durationMs;
      const overlaps = busyIntervals.some(
        (b) => t < b.end && candidateEnd > b.start,
      );
      if (!overlaps) slots.push(new Date(t).toISOString());
    }

    res.json({
      date,
      service_id: validServiceId,
      staff_id: validStaffId,
      duration_minutes: durationMinutes,
      slots,
    });
  }, { log: "Availability error:" }));

  return router;
};
