// Staff, their time off and working hours: /api/v1/staff, /time-off, /working-hours.
// Moved out of server.js; helpers that still live there are handed over when
// it mounts this router (see "Area routers" near the end of server.js).
const express = require("express");
const { HttpError, asyncHandler, withTransaction } = require("../http");
const pool = require("../db");
const bcrypt = require("bcrypt");
const { passwordProblem, safeUUID } = require("../domain/common");
const { DATE_YYYYMMDD, rangesProblem, bookingsOutsideWeek, bookingsOutsideDate } = require("../domain/staffSchedule");

module.exports = function staffRouter({
  notForStaff,
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
          json_agg(ss.service_id ORDER BY ss.sort_order, ss.service_id) FILTER (WHERE ss.service_id IS NOT NULL),
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
      username,
      password,
      visible_in_calendar,
      capacity,
    } = req.body;
    // Checked before anything is saved: a refused password leaves no staff member behind.
    if (username && password && passwordProblem(password)) return res.status(400).json({ error: passwordProblem(password) });
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
        for (const [position, svcId] of service_ids.entries()) {
          await client.query(
            `INSERT INTO staff_services (staff_id, service_id, sort_order) VALUES ($1, $2, $3)`,
            [id, svcId, position],
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

  // Create a leave or break — warns about conflicting appointments unless force=true.
  // `replaces_id`: the block being edited (moved, or given to another staff
  // member). The new one is saved and the old one removed together, so an
  // edit never leaves both behind, nor neither.
  router.post("/staff/:id/time-off", authenticateToken, notForClients, notForStaff, asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { type, start_date, end_date, start_time, end_time, reason, force } = req.body;
    const replacesId = req.body.replaces_id == null ? null : safeUUID(req.body.replaces_id);
    if (req.body.replaces_id != null && !replacesId) return res.status(400).json({ error: "Invalid replaces_id" });

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

    const saved = await withTransaction(async (client) => {
      const { rows } = await client.query(
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
      // Already removed meanwhile (another screen): the edit still saves.
      if (replacesId) await client.query("DELETE FROM staff_time_off WHERE id = $1 AND shop_id = $2", [replacesId, req.shopId]);
      return rows[0];
    });
    res.json(saved);
  }));

  router.delete("/staff/:id/time-off/:timeOffId", authenticateToken, notForClients, notForStaff, asyncHandler(async (req, res) => {
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
    // Three kinds of entries in one list (the screens and their offline copy
    // read one list): a weekly schedule's shifts (day_of_week, start_time,
    // end_time, effective_from); { kind: "version", effective_from } for every
    // weekly schedule, so one with no working days still counts; and
    // { kind: "day", date, ranges } for a date with its own hours.
    const [rows, versions, days] = await Promise.all([
      pool.query(
        `SELECT staff_id, day_of_week, start_time, end_time, effective_from::text AS effective_from
         FROM staff_working_hours WHERE shop_id = $1`,
        [req.shopId],
      ),
      pool.query(
        `SELECT staff_id, 'version' AS kind, effective_from::text AS effective_from
         FROM staff_schedule_versions WHERE shop_id = $1`,
        [req.shopId],
      ),
      pool.query(
        `SELECT staff_id, 'day' AS kind, date::text AS date, ranges
         FROM staff_schedule_days WHERE shop_id = $1`,
        [req.shopId],
      ),
    ]);
    res.json([...rows.rows, ...versions.rows, ...days.rows]);
  }));

  const currentWeekMonday = async () =>
    (await pool.query(
      `SELECT (CURRENT_DATE - ((EXTRACT(DOW FROM CURRENT_DATE)::int + 6) % 7))::text AS monday`,
    )).rows[0].monday;
  const staffInShop = async (id, shopId) =>
    (await pool.query(`SELECT 1 FROM staff WHERE id = $1 AND shop_id = $2`, [id, shopId])).rows.length > 0;

  // Saves a weekly schedule from its Monday on (until the next one): replaces
  // one starting that Monday, leaves the others and the dates with their own
  // hours alone. No days is a week off, every week from then on. Bookings it
  // would leave outside are listed first (409 conflicts_found) unless
  // force=true. enabled=false removes every schedule the staff member has,
  // so they're no longer restricted.
  router.post("/staff/:id/working-hours", authenticateToken, notForClients, notForStaff, asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { enabled, effective_from, schedule, force } = req.body;

    if (typeof enabled !== "boolean") {
      return res.status(400).json({ error: "enabled must be a boolean" });
    }

    const proposed = [];
    if (enabled) {
      if (!DATE_YYYYMMDD.test(effective_from || "")) {
        return res.status(400).json({ error: "effective_from must be YYYY-MM-DD" });
      }
      if (new Date(`${effective_from}T12:00:00Z`).getUTCDay() !== 1) {
        return res.status(400).json({ error: "effective_from must be a Monday" });
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
        const problem = rangesProblem(day.ranges);
        if (problem) return res.status(400).json({ error: problem, day_of_week: dow });
        for (const r of day.ranges) proposed.push({ day_of_week: dow, start_time: r.start_time, end_time: r.end_time });
      }
    }
    if (!(await staffInShop(id, req.shopId))) {
      return res.status(404).json({ error: "Staff member not found" });
    }
    if (enabled && effective_from < (await currentWeekMonday())) {
      return res.status(400).json({ error: "effective_from cannot be before the current week" });
    }
    if (enabled && force !== true) {
      const conflicts = await bookingsOutsideWeek(pool, id, req.shopId, effective_from, proposed);
      if (conflicts.length > 0) return res.status(409).json({ error: "conflicts_found", conflicts });
    }

    await withTransaction(async (client) => {
      if (!enabled) {
        // Every schedule this staff member has, past and future.
        await client.query(`DELETE FROM staff_working_hours WHERE staff_id = $1`, [id]);
        await client.query(`DELETE FROM staff_schedule_versions WHERE staff_id = $1`, [id]);
        await client.query(`DELETE FROM staff_schedule_days WHERE staff_id = $1`, [id]);
      } else {
        await client.query(`DELETE FROM staff_working_hours WHERE staff_id = $1 AND effective_from = $2::date`, [id, effective_from]);
        await client.query(
          `INSERT INTO staff_schedule_versions (staff_id, shop_id, effective_from) VALUES ($1, $2, $3)
           ON CONFLICT (staff_id, effective_from) DO NOTHING`,
          [id, req.shopId, effective_from],
        );
        for (const r of proposed) {
          await client.query(
            `INSERT INTO staff_working_hours (staff_id, shop_id, day_of_week, start_time, end_time, effective_from)
             VALUES ($1, $2, $3, $4, $5, $6)`,
            [id, req.shopId, r.day_of_week, r.start_time, r.end_time, effective_from],
          );
        }
      }
      await client.query(`UPDATE staff SET working_hours_enabled = $1 WHERE id = $2 AND shop_id = $3`, [enabled, id, req.shopId]);
    });

    res.json({ success: true, enabled, effective_from: enabled ? effective_from : null, schedule: proposed });
  }));

  // Removes the weekly schedule starting that Monday: the one before it
  // applies again from then. No check: it only ever loosens a restriction.
  router.delete("/staff/:id/working-hours/:effective_from", authenticateToken, notForClients, notForStaff, asyncHandler(async (req, res) => {
    const { effective_from } = req.params;
    if (!DATE_YYYYMMDD.test(effective_from)) {
      return res.status(400).json({ error: "effective_from must be YYYY-MM-DD" });
    }
    if (effective_from < (await currentWeekMonday())) {
      return res.status(400).json({ error: "effective_from cannot be before the current week" });
    }
    const cleared = await withTransaction(async (client) => {
      const { rowCount } = await client.query(
        `DELETE FROM staff_working_hours WHERE staff_id = $1 AND shop_id = $2 AND effective_from = $3::date`,
        [req.params.id, req.shopId, effective_from],
      );
      const version = await client.query(
        `DELETE FROM staff_schedule_versions WHERE staff_id = $1 AND shop_id = $2 AND effective_from = $3::date`,
        [req.params.id, req.shopId, effective_from],
      );
      return rowCount + version.rowCount;
    });
    res.json({ success: true, cleared });
  }));

  // One date's own hours, for that date only: ranges [{ start_time, end_time }],
  // none for a day off. Bookings it would leave outside are listed first
  // (409 conflicts_found) unless force=true. Turns the staff member's
  // schedule on (dates without their own hours follow the weekly schedule,
  // or aren't restricted if there's none).
  router.put("/staff/:id/days/:date", authenticateToken, notForClients, notForStaff, asyncHandler(async (req, res) => {
    const { id, date } = req.params;
    const { ranges, force } = req.body;
    if (!DATE_YYYYMMDD.test(date)) return res.status(400).json({ error: "date must be YYYY-MM-DD" });
    const problem = rangesProblem(ranges);
    if (problem) return res.status(400).json({ error: problem });
    if ((await pool.query(`SELECT $1::date < CURRENT_DATE AS past`, [date])).rows[0].past) {
      return res.status(400).json({ error: "date cannot be in the past" });
    }
    if (!(await staffInShop(id, req.shopId))) return res.status(404).json({ error: "Staff member not found" });
    const shifts = ranges.map((r) => ({ start_time: r.start_time, end_time: r.end_time })).sort((a, b) => (a.start_time > b.start_time ? 1 : -1));
    if (force !== true) {
      const conflicts = await bookingsOutsideDate(pool, id, req.shopId, date, shifts);
      if (conflicts.length > 0) return res.status(409).json({ error: "conflicts_found", conflicts });
    }
    await withTransaction(async (client) => {
      await client.query(
        `INSERT INTO staff_schedule_days (staff_id, shop_id, date, ranges) VALUES ($1, $2, $3, $4)
         ON CONFLICT (staff_id, date) DO UPDATE SET ranges = EXCLUDED.ranges`,
        [id, req.shopId, date, JSON.stringify(shifts)],
      );
      await client.query(`UPDATE staff SET working_hours_enabled = true WHERE id = $1 AND shop_id = $2`, [id, req.shopId]);
    });
    res.json({ success: true, date, ranges: shifts });
  }));

  // Back to the weekly schedule for that date.
  router.delete("/staff/:id/days/:date", authenticateToken, notForClients, notForStaff, asyncHandler(async (req, res) => {
    const { id, date } = req.params;
    if (!DATE_YYYYMMDD.test(date)) return res.status(400).json({ error: "date must be YYYY-MM-DD" });
    const { rowCount } = await pool.query(
      `DELETE FROM staff_schedule_days WHERE staff_id = $1 AND shop_id = $2 AND date = $3::date`,
      [id, req.shopId, date],
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
    if (passwordProblem(password)) return res.status(400).json({ error: passwordProblem(password) });

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
    authenticateToken, notForClients, requireShopAdminAccess,
    dbFileUpload.single("photo"),
    asyncHandler(async (req, res) => {
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

  router.delete("/staff/:id/photo", authenticateToken, notForClients, requireShopAdminAccess, asyncHandler(async (req, res) => {
    await pool.query(
      `UPDATE staff SET photo_url = NULL WHERE id = $1 AND shop_id = $2`,
      [req.params.id, req.shopId],
    );
    res.json({ success: true });
  }, { log: "Error deleting staff photo:" }));

  return router;
};
