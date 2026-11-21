// The client portal (and availability, which it books from): /api/v1/portal, /push, /availability.
// Moved out of server.js; helpers that still live there are handed over when
// it mounts this router (see "Area routers" near the end of server.js).
const express = require("express");
const { upperName, passwordProblem } = require("../domain/common");
const { asyncHandler } = require("../http");
const pool = require("../db");
const bcrypt = require("bcrypt");
const { freeStartTimes } = require("../domain/availability");

module.exports = function portalRouter({
  authenticateToken,
  safeUUID,
  onlyClients,
}) {
  const router = express.Router();


  router.put("/portal/profile", authenticateToken, onlyClients, asyncHandler(async (req, res) => {
    const { first_name, last_name, email, phone } = req.body;
    if (!first_name?.trim() || !last_name?.trim()) {
      return res
        .status(400)
        .json({ error: "First name and last name are required" });
    }
    await pool.query(
      `UPDATE clients SET first_name = $1, last_name = $2, email = $3, phone = $4 WHERE id = $5 AND shop_id = $6`,
      [
        upperName(first_name),
        upperName(last_name),
        email || null,
        phone || null,
        req.user.clientId,
        req.shopId,
      ],
    );
    res.json({ success: true });
  }, { log: "Portal profile update error:" }));

  router.put("/portal/password", authenticateToken, onlyClients, asyncHandler(async (req, res) => {
    const { currentPassword, newPassword } = req.body;
    if (passwordProblem(newPassword)) return res.status(400).json({ error: passwordProblem(newPassword) });
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
    onlyClients,
    asyncHandler(async (req, res) => {
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
    onlyClients,
    asyncHandler(async (req, res) => {
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

  router.put("/portal/notifications", authenticateToken, onlyClients, asyncHandler(async (req, res) => {
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
  router.get("/portal/services", authenticateToken, onlyClients, asyncHandler(async (req, res) => {
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

  router.get("/portal/staff", authenticateToken, onlyClients, asyncHandler(async (req, res) => {
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

  router.get("/portal/notifications", authenticateToken, onlyClients, asyncHandler(async (req, res) => {
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
    onlyClients,
    asyncHandler(async (req, res) => {
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
    onlyClients,
    asyncHandler(async (req, res) => {
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
    onlyClients,
    asyncHandler(async (req, res) => {
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
    onlyClients,
    asyncHandler(async (req, res) => {
      const { endpoint } = req.body;
      if (!endpoint) return res.status(400).json({ error: "endpoint is required" });
      await pool.query(
        "DELETE FROM push_subscriptions WHERE endpoint = $1 AND client_id = $2",
        [endpoint, req.user.clientId],
      );
      res.json({ success: true });
    }, { log: "Push subscription delete error:" }),
  );

  // The client's own upcoming, still-active bookings, with the service and
  // staff ids the AI assistant needs to cancel or move them.
  router.get("/portal/appointments/upcoming", authenticateToken, onlyClients, asyncHandler(async (req, res) => {
    const { rows } = await pool.query(
      `SELECT a.id, a.status,
              (SELECT MIN(start_time) FROM appointment_services WHERE appointment_id = a.id) AS start_time,
              COALESCE((
                SELECT json_agg(json_build_object(
                  'service_id', aps.service_id,
                  'service_name', s.name,
                  'staff_id', aps.staff_id,
                  'staff_name', st.name,
                  'start_time', aps.start_time,
                  'duration_minutes', COALESCE(NULLIF(aps.duration_override, 0), s.duration_minutes, 60)
                ) ORDER BY aps.start_time)
                FROM appointment_services aps
                LEFT JOIN services s ON s.id = aps.service_id
                LEFT JOIN staff st ON st.id = aps.staff_id
                WHERE aps.appointment_id = a.id
              ), '[]') AS services
       FROM appointments a
       WHERE a.client_id = $1 AND a.shop_id = $2
         AND a.status NOT IN ('cancelled', 'completed', 'no-show', 'no_show')
         AND COALESCE(a.is_block, false) = false
         AND (SELECT MIN(start_time) FROM appointment_services WHERE appointment_id = a.id) > NOW()
       ORDER BY 3`,
      [req.user.clientId, req.shopId],
    );
    res.json(rows);
  }, { log: "Portal upcoming appointments error:" }));

  // Moves a client's own single-service booking to another free time
  // (optionally another staff member who does the service), by the same rules
  // as booking it: self-booking on, a time /availability would offer.
  // Bookings with several services are left to the shop.
  router.post("/portal/appointments/:id/reschedule", authenticateToken, onlyClients, asyncHandler(async (req, res) => {
    const id = safeUUID(req.params.id);
    const start = new Date(req.body.start_time);
    if (!id || !req.body.start_time || isNaN(start.getTime())) {
      return res.status(400).json({ error: "start_time is required" });
    }
    if (start.getTime() <= Date.now()) return res.status(422).json({ error: "past_time" });
    const shopRes = await pool.query("SELECT self_booking_enabled FROM shops WHERE id = $1", [req.shopId]);
    if (!shopRes.rows[0]?.self_booking_enabled) return res.status(404).json({ error: "self_booking_disabled" });
    const apptRes = await pool.query(
      `SELECT id FROM appointments
       WHERE id = $1 AND client_id = $2 AND shop_id = $3
         AND status NOT IN ('cancelled', 'completed', 'no-show', 'no_show')
         AND COALESCE(is_block, false) = false`,
      [id, req.user.clientId, req.shopId],
    );
    if (!apptRes.rows.length) return res.status(404).json({ error: "Appointment not found or cannot be rescheduled" });
    const svcRes = await pool.query(
      `SELECT aps.id, aps.service_id, aps.staff_id, aps.start_time,
              COALESCE(NULLIF(aps.duration_override, 0), s.duration_minutes, 60) AS duration
       FROM appointment_services aps
       JOIN services s ON s.id = aps.service_id
       WHERE aps.appointment_id = $1`,
      [id],
    );
    if (svcRes.rows.length !== 1) return res.status(422).json({ error: "multi_service" });
    const row = svcRes.rows[0];
    if (new Date(row.start_time).getTime() <= Date.now()) return res.status(422).json({ error: "already_started" });
    const staffId = (req.body.staff_id && safeUUID(req.body.staff_id)) || row.staff_id;
    if (String(staffId) !== String(row.staff_id)) {
      const staffRes = await pool.query(
        `SELECT 1 FROM staff s
         WHERE s.id = $1 AND s.shop_id = $2 AND s.is_active = true AND s.visible_in_calendar = true
           AND (
             NOT EXISTS (SELECT 1 FROM staff_services ss WHERE ss.staff_id = s.id)
             OR EXISTS (SELECT 1 FROM staff_services ss WHERE ss.staff_id = s.id AND ss.service_id = $3)
           )`,
        [staffId, req.shopId, row.service_id],
      );
      if (!staffRes.rows.length) return res.status(422).json({ error: "staff_not_available" });
    }
    // The requested start's calendar date in shop time (the server runs in it).
    const date = `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, "0")}-${String(start.getDate()).padStart(2, "0")}`;
    const slots = await freeStartTimes(pool, {
      shopId: req.shopId,
      staffId,
      date,
      durationMinutes: Number(row.duration),
      skipPast: true,
      excludeAppointmentId: id,
    });
    if (!slots.includes(start.toISOString())) return res.status(409).json({ error: "slot_unavailable" });
    await pool.query("UPDATE appointment_services SET start_time = $1, staff_id = $2 WHERE id = $3", [start.toISOString(), staffId, row.id]);
    // Its reminders (email and push) are due again for the new time.
    await pool.query(
      "UPDATE appointments SET email_reminder_sent = false, push_reminder_sent = false, updated_at = NOW() WHERE id = $1",
      [id],
    );
    res.json({ success: true });
  }, { log: "Portal appointment reschedule error:" }));

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

    const slots = await freeStartTimes(pool, {
      shopId: req.shopId,
      staffId: validStaffId,
      date,
      durationMinutes,
      skipPast: req.user.role === "client",
    });

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
