// Staff, their time off and working hours: /api/v1/staff, /time-off, /working-hours.
// Moved out of server.js; helpers that still live there are handed over when
// it mounts this router (see "Area routers" near the end of server.js).
const express = require("express");
const { HttpError, asyncHandler, withTransaction } = require("../http");
const pool = require("../db");
const bcrypt = require("bcrypt");

module.exports = function staffRouter({
  io,
  revokeUserSessions,
  authenticateToken,
  dbFileUpload,
  notForClients,
  requireShopAdminAccess,
  TIME_HHMM,
}) {
  const router = express.Router();

  // Places at the same time from the staff form: 1–50, or null when not sent
  // (an older screen), which keeps what's stored.
  const placesInput = (value) => {
    const n = parseInt(value, 10);
    return Number.isFinite(n) ? Math.min(50, Math.max(1, n)) : null;
  };

  router.get("/staff", authenticateToken, notForClients, asyncHandler(async (req, res) => {
    const { rows } = await pool.query(
      `
      SELECT
        st.id, st.name, st.color_code, st.hourly_rate, st.is_active,
        st.email, st.phone, st.specialty, st.shop_id, st.sort_order,
        st.visible_in_calendar, st.working_hours_enabled, st.capacity,
        COALESCE(
          json_agg(ss.service_id) FILTER (WHERE ss.service_id IS NOT NULL),
          '[]'
        ) as service_ids
      FROM staff st
      LEFT JOIN staff_services ss ON st.id = ss.staff_id
      WHERE st.is_active = true
      AND st.shop_id = $1
      GROUP BY st.id
      ORDER BY st.name
    `,
      [req.shopId],
    );
    res.json(rows);
  }));

  router.post("/staff", authenticateToken, requireShopAdminAccess, asyncHandler(async (req, res) => {
    const {
      first_name,
      last_name,
      email,
      phone,
      role,
      color,
      username,
      password,
      visible_in_calendar,
      capacity,
    } = req.body;
    const name = first_name + " " + last_name;
    const answer = await withTransaction(async (client) => {
      const staffRes = await client.query(
        "INSERT INTO staff (name, email, phone, shop_id, visible_in_calendar, capacity) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id",
        [name, email, phone, req.shopId, visible_in_calendar ?? true, placesInput(capacity) ?? 1],
      );
      const staffId = staffRes.rows[0].id;

      // 2. Create User Entry (with Hashed Password)
      if (username && password) {
        // HASH THE PASSWORD HERE
        const hashedPassword = await bcrypt.hash(password, 12);

        await client.query(
          "INSERT INTO users (username, password, role, staff_id, shop_id) VALUES ($1, $2, $3, $4, $5)",
          [username, hashedPassword, role || "staff", staffId, req.shopId],
        );
      }

      return { success: true, id: staffId };
    });
    res.json(answer);
  }));

  // server.js
  router.post("/staff/reorder", authenticateToken, notForClients, asyncHandler(async (req, res) => {
    const { orders } = req.body; // Expects [{id: 1, sort_order: 0}, {id: 2, sort_order: 1}]

    await withTransaction(async (client) => {
      for (const item of orders) {
        await client.query("UPDATE public.staff SET sort_order = $1 WHERE id = $2 AND shop_id = $3", [
          item.sort_order,
          item.id,
          req.shopId,
        ]);
      }
    });
    res.json({ success: true, message: "Staff order updated successfully" });
  }, { message: "Failed to reorder staff" }));

  router.put("/staff/:id", authenticateToken, requireShopAdminAccess, asyncHandler(async (req, res) => {
    const { id } = req.params;
    const {
      first_name,
      last_name,
      email,
      phone,
      hourly_rate,
      specialty,
      service_ids = [],
      visible_in_calendar,
      capacity,
    } = req.body;
    const answer = await withTransaction(async (client) => {
      const fullName = `${first_name} ${last_name}`.trim();

      await client.query(
        `UPDATE staff
         SET name = $1, email = $2, phone = $3, hourly_rate = $4, specialty = $5, visible_in_calendar = $6,
             capacity = COALESCE($9, capacity)
         WHERE id = $7 AND shop_id = $8`,
        [fullName, email, phone, hourly_rate, specialty, visible_in_calendar ?? true, id, req.shopId, placesInput(capacity)],
      );

      await client.query(`DELETE FROM staff_services WHERE staff_id = $1`, [id]);

      if (service_ids.length > 0) {
        for (const svcId of service_ids) {
          await client.query(
            `INSERT INTO staff_services (staff_id, service_id) VALUES ($1, $2)`,
            [id, svcId],
          );
        }
      }

      return { success: true };
    });
    res.json(answer);
  }, { message: "Failed to update staff" }));

  // Removing a staff member ends their login as well. Admins can be on the
  // calendar too: removing them from it leaves their account alone.
  router.delete("/staff/:id", authenticateToken, requireShopAdminAccess, asyncHandler(async (req, res) => {
    const revoked = await withTransaction(async (client) => {
      await client.query(
        "UPDATE staff SET is_active = false WHERE id = $1 AND shop_id = $2",
        [req.params.id, req.shopId],
      );
      const { rows } = await client.query(
        `UPDATE users SET is_active = false, sessions_revoked_at = NOW()
         WHERE staff_id = $1 AND shop_id = $2 AND role NOT IN ('admin', 'super_admin')
         RETURNING id, sessions_revoked_at`,
        [req.params.id, req.shopId],
      );
      return rows;
    });
    for (const user of revoked) revokeUserSessions(io, user.id, user.sessions_revoked_at);
    res.json({ success: true });
  }));

  // All time-off entries for the shop (used to render calendar background blocks)
  router.get("/time-off", authenticateToken, notForClients, asyncHandler(async (req, res) => {
    const { rows } = await pool.query(
      `SELECT id, staff_id, type, start_date, end_date, start_time, end_time, reason
       FROM staff_time_off WHERE shop_id = $1
       ORDER BY start_date DESC`,
      [req.shopId],
    );
    res.json(rows);
  }));

  // Time-off entries for a single staff member (used by the Staff page dialog)
  router.get("/staff/:id/time-off", authenticateToken, notForClients, asyncHandler(async (req, res) => {
    const { rows } = await pool.query(
      `SELECT id, type, start_date, end_date, start_time, end_time, reason, created_at
       FROM staff_time_off WHERE staff_id = $1 AND shop_id = $2
       ORDER BY start_date DESC`,
      [req.params.id, req.shopId],
    );
    res.json(rows);
  }));

  // Create a leave or break — warns about conflicting appointments unless force=true
  router.post("/staff/:id/time-off", authenticateToken, notForClients, asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { type, start_date, end_date, start_time, end_time, reason, force } = req.body;

    if (!type || !["leave", "break"].includes(type)) {
      return res.status(400).json({ error: "type must be 'leave' or 'break'" });
    }
    if (!start_date || !end_date) {
      return res.status(400).json({ error: "start_date and end_date are required" });
    }
    if (type === "break" && (!start_time || !end_time)) {
      return res.status(400).json({ error: "start_time and end_time are required for a break" });
    }
    const staffCheck = await pool.query(
      `SELECT id FROM staff WHERE id = $1 AND shop_id = $2`,
      [id, req.shopId],
    );
    if (staffCheck.rows.length === 0) {
      return res.status(404).json({ error: "Staff member not found" });
    }

    // Find appointments that would conflict with this time-off window
    let conflictQuery;
    let conflictParams;
    if (type === "leave") {
      conflictQuery = `
        SELECT a.id, aps.start_time, s.name as service_name,
               c.first_name || ' ' || c.last_name as client_name
        FROM appointment_services aps
        JOIN appointments a ON a.id = aps.appointment_id
        LEFT JOIN services s ON s.id = aps.service_id
        LEFT JOIN clients c ON c.id = a.client_id
        WHERE aps.staff_id = $1 AND a.shop_id = $2 AND a.status != 'cancelled'
          AND aps.start_time::date BETWEEN $3::date AND $4::date
        ORDER BY aps.start_time`;
      conflictParams = [id, req.shopId, start_date, end_date];
    } else {
      conflictQuery = `
        SELECT a.id, aps.start_time, s.name as service_name,
               c.first_name || ' ' || c.last_name as client_name
        FROM appointment_services aps
        JOIN appointments a ON a.id = aps.appointment_id
        LEFT JOIN services s ON s.id = aps.service_id
        LEFT JOIN clients c ON c.id = a.client_id
        WHERE aps.staff_id = $1 AND a.shop_id = $2 AND a.status != 'cancelled'
          AND aps.start_time::date = $3::date
          AND aps.start_time < ($3::date + $5::time)
          AND (aps.start_time + (COALESCE(aps.duration_override, 60) || ' minutes')::interval) > ($3::date + $4::time)
        ORDER BY aps.start_time`;
      conflictParams = [id, req.shopId, start_date, start_time, end_time];
    }

    const conflicts = await pool.query(conflictQuery, conflictParams);

    if (conflicts.rows.length > 0 && force !== true) {
      return res.status(409).json({
        error: "conflicts_found",
        conflicts: conflicts.rows,
      });
    }

    const { rows } = await pool.query(
      `INSERT INTO staff_time_off
         (staff_id, shop_id, type, start_date, end_date, start_time, end_time, reason)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING *`,
      [
        id,
        req.shopId,
        type,
        start_date,
        end_date,
        type === "break" ? start_time : null,
        type === "break" ? end_time : null,
        reason || null,
      ],
    );
    res.json(rows[0]);
  }));

  router.delete("/staff/:id/time-off/:timeOffId", authenticateToken, notForClients, asyncHandler(async (req, res) => {
    const { rowCount } = await pool.query(
      `DELETE FROM staff_time_off WHERE id = $1 AND staff_id = $2 AND shop_id = $3`,
      [req.params.timeOffId, req.params.id, req.shopId],
    );
    if (rowCount === 0) return res.status(404).json({ error: "Not found" });
    res.json({ success: true });
  }));

  // Shop-wide working hours — one shot fetch for the calendar (day-view resource
  // visibility + off-hours shading), mirrors the shop-wide /api/v1/time-off.
  // Returns EVERY version (past/current/upcoming) unfiltered — the client
  // resolves whichever one applies to the currently-displayed calendar date
  // itself (see client/src/utils/staffAvailability.ts's getWorkingRangesForDate),
  // so a single fetch here covers navigating to any past or future week without
  // a new date-scoped endpoint. The ::text cast avoids a known bug: pg parses
  // DATE into a local-midnight JS Date, which serializes to JSON in UTC and can
  // silently shift the date by a day depending on timezone.
  router.get("/working-hours", authenticateToken, notForClients, asyncHandler(async (req, res) => {
    const { rows } = await pool.query(
      `SELECT staff_id, day_of_week, start_time, end_time, effective_from::text AS effective_from
       FROM staff_working_hours WHERE shop_id = $1`,
      [req.shopId],
    );
    res.json(rows);
  }));

  const DATE_YYYYMMDD = /^\d{4}-\d{2}-\d{2}$/;

  // Saves exactly ONE effective-dated version — either "current" (effective_from
  // = today) or "upcoming" (effective_from in the future); which one is decided
  // entirely by the submitted date, not a separate flag. Warns about
  // appointments on/after this version's effective_from that it would no
  // longer cover (same conflicts_found/force pattern as staff_time_off) unless
  // force=true — appointments before effective_from are governed by whatever
  // version applies there instead, untouched by this save. enabled=false always
  // clears everything (current AND any staged upcoming version) with no
  // conflict check, since disabling can only ever loosen restrictions.
  router.post("/staff/:id/working-hours", authenticateToken, notForClients, asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { enabled, effective_from, schedule, force } = req.body;

    if (typeof enabled !== "boolean") {
      return res.status(400).json({ error: "enabled must be a boolean" });
    }

    let proposed = [];
    if (enabled) {
      if (!DATE_YYYYMMDD.test(effective_from || "")) {
        return res.status(400).json({ error: "effective_from must be YYYY-MM-DD" });
      }
      if (!Array.isArray(schedule)) {
        return res.status(400).json({ error: "schedule must be an array" });
      }
      const seenDays = new Set();
      for (const day of schedule) {
        const dow = day?.day_of_week;
        if (!Number.isInteger(dow) || dow < 0 || dow > 6) {
          return res.status(400).json({ error: "day_of_week must be an integer between 0 and 6" });
        }
        if (seenDays.has(dow)) {
          return res.status(400).json({ error: "duplicate day_of_week in schedule", day_of_week: dow });
        }
        seenDays.add(dow);
        if (!Array.isArray(day.ranges) || day.ranges.length === 0) {
          return res.status(400).json({ error: "each day must have at least one range", day_of_week: dow });
        }
        const sorted = [...day.ranges].sort((a, b) => (a.start_time > b.start_time ? 1 : -1));
        for (let i = 0; i < sorted.length; i++) {
          const r = sorted[i];
          if (!TIME_HHMM.test(r.start_time) || !TIME_HHMM.test(r.end_time)) {
            return res.status(400).json({ error: "start_time/end_time must be HH:MM", day_of_week: dow });
          }
          if (r.end_time <= r.start_time) {
            return res.status(400).json({ error: "end_time must be after start_time", day_of_week: dow });
          }
          if (i > 0 && r.start_time < sorted[i - 1].end_time) {
            return res.status(400).json({ error: "overlapping_ranges", day_of_week: dow });
          }
          proposed.push({ day_of_week: dow, start_time: r.start_time, end_time: r.end_time });
        }
      }
    }
    const staffCheck = await pool.query(
      `SELECT id FROM staff WHERE id = $1 AND shop_id = $2`,
      [id, req.shopId],
    );
    if (staffCheck.rows.length === 0) {
      return res.status(404).json({ error: "Staff member not found" });
    }

    if (enabled) {
      // Server's CURRENT_DATE (not Node's clock) is authoritative — matches
      // the timezone convention every other date/time check in this guard uses.
      // The floor is the Monday of the CURRENT week, not today — the week
      // containing today straddles past and future days whenever today isn't
      // itself a Monday, and that week must stay editable (see
      // client/src/utils/staffAvailability.ts's mondayOf for the same
      // computation on the client).
      const mondayRow = await pool.query(
        `SELECT (CURRENT_DATE - ((EXTRACT(DOW FROM CURRENT_DATE)::int + 6) % 7))::text AS monday`,
      );
      const currentWeekMonday = mondayRow.rows[0].monday;
      if (effective_from < currentWeekMonday) {
        return res.status(400).json({ error: "effective_from cannot be before the current week" });
      }
    }

    if (enabled && force !== true) {
      // Each effective_from is its own independent version now (any number of
      // past/future weeks can each have their own saved pattern) — the only
      // relevant bound is whichever version comes immediately after the one
      // being saved, regardless of whether that's today, this week, or any
      // future week.
      const upcomingRow = await pool.query(
        `SELECT MIN(effective_from)::text AS ef FROM staff_working_hours
         WHERE staff_id = $1 AND effective_from > $2::date`,
        [id, effective_from],
      );
      const upperBound = upcomingRow.rows[0]?.ef || null;

      const conflicts = await pool.query(
        `
        WITH proposed(day_of_week, start_time, end_time) AS (
          SELECT * FROM json_to_recordset($4::json) AS x(day_of_week int, start_time time, end_time time)
        )
        SELECT a.id, aps.start_time, s.name AS service_name,
               c.first_name || ' ' || c.last_name AS client_name
        FROM appointment_services aps
        JOIN appointments a ON a.id = aps.appointment_id
        LEFT JOIN services s ON s.id = aps.service_id
        LEFT JOIN clients c ON c.id = a.client_id
        WHERE aps.staff_id = $1 AND a.shop_id = $2
          AND a.status != 'cancelled' AND COALESCE(a.is_block, false) = false
          AND aps.start_time >= GREATEST($3::date, CURRENT_DATE)
          AND ($5::date IS NULL OR aps.start_time < $5::date)
          AND NOT EXISTS (
            SELECT 1 FROM proposed p
            WHERE p.day_of_week = EXTRACT(DOW FROM aps.start_time)
              AND aps.start_time::time >= p.start_time
              AND (aps.start_time + (COALESCE(aps.duration_override, 60) || ' minutes')::interval)::time <= p.end_time
              AND (aps.start_time + (COALESCE(aps.duration_override, 60) || ' minutes')::interval)::date = aps.start_time::date
          )
        ORDER BY aps.start_time`,
        [id, req.shopId, effective_from, JSON.stringify(proposed), upperBound],
      );
      if (conflicts.rows.length > 0) {
        return res.status(409).json({ error: "conflicts_found", conflicts: conflicts.rows });
      }
    }

    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      if (!enabled) {
        // Disabling wipes every version this staff member has, past and future.
        await client.query(`DELETE FROM staff_working_hours WHERE staff_id = $1`, [id]);
      } else {
        // Upsert-by-exact-effective_from — only the one version being saved
        // is touched. Every other past/future version (each its own
        // independently-saved week) is left alone.
        await client.query(
          `DELETE FROM staff_working_hours WHERE staff_id = $1 AND effective_from = $2::date`,
          [id, effective_from],
        );
      }
      if (enabled) {
        for (const r of proposed) {
          await client.query(
            `INSERT INTO staff_working_hours (staff_id, shop_id, day_of_week, start_time, end_time, effective_from)
             VALUES ($1, $2, $3, $4, $5, $6)`,
            [id, req.shopId, r.day_of_week, r.start_time, r.end_time, effective_from],
          );
        }
      }
      await client.query(`UPDATE staff SET working_hours_enabled = $1 WHERE id = $2 AND shop_id = $3`, [
        enabled,
        id,
        req.shopId,
      ]);
      await client.query("COMMIT");
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }

    res.json({ success: true, enabled, effective_from: enabled ? effective_from : null, schedule: proposed });
  }));

  // Deletes one specific week's version outright, falling through to whichever
  // version precedes it (not the same as saving an empty schedule for it, which
  // would mean "day off every day starting then"). No conflict check needed:
  // clearing a version only ever loosens a restriction, same reasoning as
  // enabled=false above.
  router.delete("/staff/:id/working-hours/:effective_from", authenticateToken, notForClients, asyncHandler(async (req, res) => {
    const { effective_from } = req.params;
    if (!DATE_YYYYMMDD.test(effective_from)) {
      return res.status(400).json({ error: "effective_from must be YYYY-MM-DD" });
    }
    const mondayRow = await pool.query(
      `SELECT (CURRENT_DATE - ((EXTRACT(DOW FROM CURRENT_DATE)::int + 6) % 7))::text AS monday`,
    );
    if (effective_from < mondayRow.rows[0].monday) {
      return res.status(400).json({ error: "effective_from cannot be before the current week" });
    }
    const { rowCount } = await pool.query(
      `DELETE FROM staff_working_hours WHERE staff_id = $1 AND shop_id = $2 AND effective_from = $3::date`,
      [req.params.id, req.shopId, effective_from],
    );
    res.json({ success: true, cleared: rowCount });
  }));

  // Create Staff Login
  const STAFF_LOGIN_ROLES = ["staff", "frontdesk"];

  router.post("/staff/:id/login", authenticateToken, requireShopAdminAccess, asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { username, password, role } = req.body;

    if (!username || !password)
      return res.status(400).json({ error: "Username and password required" });

    if (role && !STAFF_LOGIN_ROLES.includes(role)) {
      return res.status(400).json({ error: "Invalid role" });
    }

    const answer = await withTransaction(async (client) => {
      const checkUser = await client.query(
        "SELECT id FROM users WHERE username = $1",
        [username],
      );
      if (checkUser.rows.length > 0) {
        throw new HttpError(400, { error: "Username already taken" });
      }

      const hashedPassword = await bcrypt.hash(password, 12);

      await client.query(
        `INSERT INTO users (username, password, shop_id, staff_id, role)
         VALUES ($1, $2, $3, $4, $5)`,
        [username, hashedPassword, req.shopId, id, role || "staff"],
      );

      return { success: true };
    });
    res.json(answer);
  }, { message: "Failed to create login" }));

  router.post(
    "/staff/:id/photo",
    authenticateToken, notForClients,
    dbFileUpload.single("photo"),
    asyncHandler(async (req, res) => {
      if (req.user.role !== "admin" && req.user.role !== "super_admin" && req.user.role !== "frontdesk") {
        return res.status(403).json({ error: "Admins only" });
      }
      if (!req.file) return res.status(400).json({ error: "No file uploaded" });
      if (!req.file.mimetype.startsWith("image/")) {
        return res.status(400).json({ error: "File must be an image" });
      }
      const dataUrl = `data:${req.file.mimetype};base64,${req.file.buffer.toString("base64")}`;
      await pool.query(
        `UPDATE staff SET photo_url = $1 WHERE id = $2 AND shop_id = $3`,
        [dataUrl, req.params.id, req.shopId],
      );
      res.json({ success: true, photo_url: dataUrl });
    }, { log: "Error uploading staff photo:" }),
  );

  router.delete("/staff/:id/photo", authenticateToken, notForClients, asyncHandler(async (req, res) => {
    if (req.user.role !== "admin" && req.user.role !== "super_admin" && req.user.role !== "frontdesk") {
      return res.status(403).json({ error: "Admins only" });
    }
    await pool.query(
      `UPDATE staff SET photo_url = NULL WHERE id = $1 AND shop_id = $2`,
      [req.params.id, req.shopId],
    );
    res.json({ success: true });
  }, { log: "Error deleting staff photo:" }));

  return router;
};
