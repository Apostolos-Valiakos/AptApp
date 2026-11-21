// The waitlist the front desk keeps (admins too): /api/v1/waitlist.
const express = require("express");
const { asyncHandler } = require("../http");
const pool = require("../db");
const { ENTRY_SELECT, matchesForSlot, freeTimes, freedSlots, dismissFreed, bookableEntryIds } = require("../domain/waitlist");

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

module.exports = function waitlistRouter({ authenticateToken, requireShopAdminAccess, safeUUID }) {
  const router = express.Router();
  const guard = [authenticateToken, requireShopAdminAccess];

  // An entry as the screens send it: { problem } or the values to save.
  const readEntry = async (body, shopId) => {
    const clientId = safeUUID(body.client_id);
    if (!clientId) return { problem: "client_id is required" };
    const client = await pool.query("SELECT 1 FROM clients WHERE id = $1 AND shop_id = $2", [clientId, shopId]);
    if (!client.rows.length) return { problem: "client not found" };
    const serviceId = body.service_id ? safeUUID(body.service_id) : null;
    if (body.service_id && !serviceId) return { problem: "invalid service_id" };
    const staffId = body.staff_id ? safeUUID(body.staff_id) : null;
    if (body.staff_id && !staffId) return { problem: "invalid staff_id" };
    if (!DATE.test(body.date_from || "") || !DATE.test(body.date_to || "")) return { problem: "date_from and date_to are required" };
    if (body.date_to < body.date_from) return { problem: "date_to must not be before date_from" };
    const days = Array.isArray(body.days) ? [...new Set(body.days)] : [];
    if (days.some((d) => !Number.isInteger(d) || d < 0 || d > 6)) return { problem: "days must be 0 to 6" };
    const timeFrom = body.time_from || null;
    const timeTo = body.time_to || null;
    if ((timeFrom && !TIME.test(timeFrom)) || (timeTo && !TIME.test(timeTo))) return { problem: "times must be HH:MM" };
    if (timeFrom && timeTo && timeTo <= timeFrom) return { problem: "time_to must be after time_from" };
    return {
      values: [clientId, serviceId, staffId, body.date_from, body.date_to, days, timeFrom, timeTo, String(body.note || "").trim().slice(0, 500) || null],
    };
  };
  const entryById = async (id, shopId) =>
    (await pool.query(`${ENTRY_SELECT} WHERE w.id = $1 AND w.shop_id = $2`, [id, shopId])).rows[0];

  // Who's waiting (their last date not passed); ?all=1 also lists the ones
  // whose dates have passed.
  router.get("/waitlist", ...guard, asyncHandler(async (req, res) => {
    const { rows } = await pool.query(
      `${ENTRY_SELECT}
       WHERE w.shop_id = $1 AND w.status = 'waiting' ${req.query.all ? "" : "AND w.date_to >= CURRENT_DATE"}
       ORDER BY w.date_from, w.created_at`,
      [req.shopId],
    );
    res.json(rows);
  }));

  // The waiting entries a free slot suits: ?staff_id=…&start=…&end=… (ISO).
  router.get("/waitlist/matches", ...guard, asyncHandler(async (req, res) => {
    const staffId = safeUUID(req.query.staff_id);
    const start = new Date(req.query.start);
    const end = new Date(req.query.end);
    if (!staffId || Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end <= start) {
      return res.status(400).json({ error: "staff_id, start and end are required" });
    }
    res.json(await matchesForSlot(pool, req.shopId, { staffId, start: start.toISOString(), end: end.toISOString() }));
  }));

  // The waiting entries that can be booked now (the waitlist button's number).
  router.get("/waitlist/bookable", ...guard, asyncHandler(async (req, res) => {
    res.json(await bookableEntryIds(pool, req.shopId));
  }));

  // Times freed by cancellations that suit someone waiting, and dismissing one.
  router.get("/waitlist/freed", ...guard, asyncHandler(async (req, res) => {
    res.json(await freedSlots(pool, req.shopId));
  }));
  router.delete("/waitlist/freed/:id", ...guard, asyncHandler(async (req, res) => {
    const id = safeUUID(req.params.id);
    if (!id) return res.status(400).json({ error: "invalid_id" });
    if (!(await dismissFreed(pool, req.shopId, id, String(req.user.userId || "") || null))) {
      return res.status(404).json({ error: "Not found" });
    }
    res.json({ success: true });
  }));

  // When an entry can be booked (see freeTimes in domain/waitlist.js);
  // ?after=YYYY-MM-DD continues where the last answer's `next` said.
  router.get("/waitlist/:id/free-times", ...guard, asyncHandler(async (req, res) => {
    const id = safeUUID(req.params.id);
    if (!id) return res.status(400).json({ error: "invalid_id" });
    if (req.query.after && !DATE.test(req.query.after)) return res.status(400).json({ error: "after must be YYYY-MM-DD" });
    const entry = await entryById(id, req.shopId);
    if (!entry) return res.status(404).json({ error: "Not found" });
    res.json(await freeTimes(pool, req.shopId, entry, { after: req.query.after || null }));
  }));

  router.post("/waitlist", ...guard, asyncHandler(async (req, res) => {
    const entry = await readEntry(req.body, req.shopId);
    if (entry.problem) return res.status(400).json({ error: entry.problem });
    const { rows } = await pool.query(
      `INSERT INTO waitlist_entries
         (shop_id, client_id, service_id, staff_id, date_from, date_to, days, time_from, time_to, note, created_by_user_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) RETURNING id`,
      [req.shopId, ...entry.values, String(req.user.userId || "") || null],
    );
    res.json(await entryById(rows[0].id, req.shopId));
  }));

  router.put("/waitlist/:id", ...guard, asyncHandler(async (req, res) => {
    const id = safeUUID(req.params.id);
    if (!id) return res.status(400).json({ error: "invalid_id" });
    const entry = await readEntry(req.body, req.shopId);
    if (entry.problem) return res.status(400).json({ error: entry.problem });
    const { rowCount } = await pool.query(
      `UPDATE waitlist_entries
       SET client_id = $3, service_id = $4, staff_id = $5, date_from = $6, date_to = $7, days = $8,
           time_from = $9, time_to = $10, note = $11, updated_at = NOW()
       WHERE id = $1 AND shop_id = $2 AND status = 'waiting'`,
      [id, req.shopId, ...entry.values],
    );
    if (!rowCount) return res.status(404).json({ error: "Not found" });
    res.json(await entryById(id, req.shopId));
  }));

  // Off the list (kept as removed).
  router.delete("/waitlist/:id", ...guard, asyncHandler(async (req, res) => {
    const id = safeUUID(req.params.id);
    if (!id) return res.status(400).json({ error: "invalid_id" });
    const { rowCount } = await pool.query(
      `UPDATE waitlist_entries SET status = 'removed', updated_at = NOW() WHERE id = $1 AND shop_id = $2 AND status = 'waiting'`,
      [id, req.shopId],
    );
    if (!rowCount) return res.status(404).json({ error: "Not found" });
    res.json({ success: true });
  }));

  return router;
};
