// The client list (search, pages, export), the walk-in client, and creating, changing and deleting a client.
const express = require("express");
const { HttpError, asyncHandler, withTransaction } = require("../../http");
const { upperName, getVisibilityClause } = require("../../domain/common");
const { clientsWithPhone } = require("../../domain/phones");

module.exports = function listRouter({
  notForStaff,
  authenticateToken,
  checkIdempotency,
  pool,
  requireShopAdminAccess,
  saveIdempotency,
  walkInClientRow,
  notForClients,
}) {
  const router = express.Router();

  const PAST_VISIT = "a.status NOT IN ('cancelled', 'no-show', 'no-response') AND f.first_start <= NOW()";
  // A client row with empty EOPPY / non-EOPPY breakdowns rather than none.
  const withBreakdowns = (row) => ({
    ...row,
    eoppy_breakdown: row.eoppy_breakdown || { total: 0, services: {} },
    non_eoppy_breakdown: row.non_eoppy_breakdown || { total: 0, services: {} },
  });
  // A portal login reads only its own card (/:id/full): this list carries
  // every client's contact details and the shop's notes on them.
  router.get("/", authenticateToken, notForClients, asyncHandler(async (req, res) => {
    const { slim, search, limit, offset, id } = req.query;
    // Slim mode: lightweight list for dropdowns (scheduler, booking dialog).
    // With `search` + `limit` it becomes a fast autocomplete lookup instead of
    // shipping the entire client table (used by the Gift Cards client picker).
    // With `id` it's an exact single-row lookup (used to re-hydrate the booking
    // dialog's already-selected client without loading the full client list).
    if (slim === "true") {
      const slimParams = [req.shopId];
      let slimSearchClause = "";
      if (id) {
        slimParams.push(id);
        slimSearchClause = ` AND id = $${slimParams.length}`;
      } else if (search) {
        slimParams.push(`%${String(search).trim()}%`);
        slimSearchClause = ` AND (first_name || ' ' || last_name ILIKE $${slimParams.length}
          OR email ILIKE $${slimParams.length}
          OR REPLACE(phone, ' ', '') ILIKE REPLACE($${slimParams.length}, ' ', ''))`;
      }
      const slimLimitClause = limit
        ? ` LIMIT ${Math.min(parseInt(limit) || 10, 50)}`
        : "";

      const { rows } = await pool.query(
        `SELECT id, first_name, last_name,
                first_name || ' ' || last_name as full_name,
                email, phone, outstanding_balance, custom_fields, notes,
                (id = (SELECT walk_in_client_id FROM shops WHERE id = $1)) AS is_walk_in
         FROM active_clients WHERE shop_id = $1 ${slimSearchClause}
         ORDER BY NULLIF(TRIM(last_name), '') NULLS LAST, first_name
         ${slimLimitClause}`,
        slimParams,
      );
      return res.json(rows);
    }

    const params = [req.shopId];
    let searchClause = "";
    if (search) {
      params.push(`%${String(search).trim()}%`);
      searchClause = ` AND (c.first_name || ' ' || c.last_name ILIKE $${params.length}
        OR c.email ILIKE $${params.length}
        OR REPLACE(c.phone, ' ', '') ILIKE REPLACE($${params.length}, ' ', ''))`;
    }

    const heavyColumns = `
        c.*,
        c.first_name || ' ' || c.last_name as full_name,

        -- EOPPY Breakdown
        (SELECT jsonb_build_object(
            'total', COALESCE(SUM(s_inner.count_per_service), 0),
            'services', COALESCE(jsonb_object_agg(s_inner.service_name, s_inner.count_per_service), '{}'::jsonb)
          )
         FROM (
           SELECT s.name as service_name, COUNT(aps.id) as count_per_service
           FROM appointments a
           JOIN appointment_services aps ON a.id = aps.appointment_id
           JOIN services s ON aps.service_id = s.id
           WHERE a.client_id = c.id AND a.is_eoppy = true
           GROUP BY s.name
         ) s_inner
        ) as eoppy_breakdown,

        -- Non-EOPPY Breakdown
        (SELECT jsonb_build_object(
            'total', COALESCE(SUM(s_inner.count_per_service), 0),
            'services', COALESCE(jsonb_object_agg(s_inner.service_name, s_inner.count_per_service), '{}'::jsonb)
          )
         FROM (
           SELECT s.name as service_name, COUNT(aps.id) as count_per_service
           FROM appointments a
           JOIN appointment_services aps ON a.id = aps.appointment_id
           JOIN services s ON aps.service_id = s.id
           WHERE a.client_id = c.id AND (a.is_eoppy = false OR a.is_eoppy IS NULL)
           GROUP BY s.name
         ) s_inner
        ) as non_eoppy_breakdown`;

    // Paged mode: server-side search + pagination, heavy aggregates only for the page
    if (limit !== undefined) {
      const pageSize = Math.min(parseInt(limit) || 50, 200);
      const pageOffset = parseInt(offset) || 0;

      const countRes = await pool.query(
        `SELECT COUNT(*) as total FROM active_clients c WHERE c.shop_id = $1 ${searchClause}`,
        params,
      );

      const pagedParams = [...params, pageSize, pageOffset];
      const { rows } = await pool.query(
        `SELECT ${heavyColumns}
         FROM active_clients c
         WHERE c.shop_id = $1 ${searchClause}
         ORDER BY NULLIF(TRIM(c.last_name), '') NULLS LAST, c.first_name
         LIMIT $${pagedParams.length - 1} OFFSET $${pagedParams.length}`,
        pagedParams,
      );

      const data = rows.map(withBreakdowns);

      return res.json({
        total: parseInt(countRes.rows[0].total),
        clients: data,
      });
    }

    // Legacy mode: full list with aggregates (backward compatible)
    const { rows } = await pool.query(
      `SELECT ${heavyColumns}
       FROM active_clients c
       WHERE c.shop_id = $1 ${searchClause}
       ORDER BY NULLIF(TRIM(c.last_name), '') NULLS LAST, c.first_name`,
      params,
    );

    const data = rows.map(withBreakdowns);

    return res.json(data);
  }, { log: "Clients fetch error:", message: "Internal Server Error" }));
  // Every client of the shop, for the Excel export on the Clients page. Visits
  // and no-shows are counted from the appointments the caller may see (the
  // stored no_show_count and total_sales are never updated). The shop's walk-in
  // placeholder isn't a real client, so it stays out.
  router.get("/export", authenticateToken, requireShopAdminAccess, asyncHandler(async (req, res) => {
    const visibility = getVisibilityClause(req.user, "a");
    const { rows } = await pool.query(
      `SELECT c.first_name, c.last_name, c.email, c.phone,
              to_char(c.date_of_birth, 'YYYY-MM-DD') AS date_of_birth,
              c.outstanding_balance, c.notes, c.custom_fields,
              c.ergotherapia, c.physiotherapia, c.logotherapia, c.receive_emails,
              COALESCE(v.visits, 0)::int AS visits,
              to_char(v.last_visit, 'YYYY-MM-DD') AS last_visit,
              COALESCE(v.no_shows, 0)::int AS no_shows
       FROM active_clients c
       LEFT JOIN (
         SELECT a.client_id,
                COUNT(*) FILTER (WHERE ${PAST_VISIT}) AS visits,
                MAX(f.first_start) FILTER (WHERE ${PAST_VISIT}) AS last_visit,
                COUNT(*) FILTER (WHERE a.status = 'no-show') AS no_shows
         FROM appointments a
         JOIN (
           SELECT appointment_id, MIN(start_time) AS first_start
           FROM appointment_services GROUP BY appointment_id
         ) f ON f.appointment_id = a.id
         WHERE a.shop_id = $1 AND a.is_block = false ${visibility}
         GROUP BY a.client_id
       ) v ON v.client_id = c.id
       WHERE c.shop_id = $1
         AND c.id IS DISTINCT FROM (SELECT walk_in_client_id FROM shops WHERE id = $1)
       ORDER BY NULLIF(TRIM(c.last_name), '') NULLS LAST, c.first_name`,
      [req.shopId],
    );
    res.json(rows);
  }));
  // Get-or-create this shop's single walk-in client — used to pre-select a
  // client on a brand-new, blank appointment (save fast, attribute later).
  // Guarded by a row lock on the shop so two concurrent first-uses can't each
  // create their own walk-in client.
  router.get("/walk-in", authenticateToken, notForClients, asyncHandler(async (req, res) => {
    const { status, body } = await withTransaction(async (client) => {
      const shopRes = await client.query(
        "SELECT walk_in_client_id FROM shops WHERE id = $1 FOR UPDATE",
        [req.shopId],
      );
      let walkInId = shopRes.rows[0]?.walk_in_client_id;

      if (walkInId) {
        const existing = await client.query(
          "SELECT id, first_name, last_name, phone, email, outstanding_balance FROM clients WHERE id = $1",
          [walkInId],
        );
        if (existing.rows[0]) {
          const c = existing.rows[0];
          return { status: 200, body: { ...c, full_name: `${c.first_name} ${c.last_name}`.trim(), is_walk_in: true } };
        }
        // Referenced client was deleted — fall through and create a fresh one.
      }

      const created = await client.query(
        `INSERT INTO clients (first_name, last_name, shop_id)
         VALUES ('Walk', 'in', $1) RETURNING id, first_name, last_name, phone, email, outstanding_balance`,
        [req.shopId],
      );
      const c = created.rows[0];
      await client.query("UPDATE shops SET walk_in_client_id = $1 WHERE id = $2", [c.id, req.shopId]);
      return { status: 200, body: { ...c, full_name: `${c.first_name} ${c.last_name}`.trim(), is_walk_in: true } };
    });
    res.status(status).json(body);
  }));
  // Clients who already have this phone (any way of writing it), for the new
  // client dialogs: they offer to use one of them instead of a duplicate.
  router.get("/by-phone", authenticateToken, notForClients, asyncHandler(async (req, res) => {
    res.json(await clientsWithPhone(pool, req.shopId, req.query.phone));
  }));

  router.post("/", authenticateToken, notForStaff, notForClients, asyncHandler(async (req, res) => {
    const {
      first_name,
      last_name,
      email,
      phone,
      notes,
      custom_fields = [],
      ergotherapia,
      physiotherapia,
      logotherapia,
      date_of_birth,
      allow_same_phone,
    } = req.body;

    if (!first_name?.trim() || !last_name?.trim()) {
      return res
        .status(400)
        .json({ error: "First name and last name are required" });
    }

    // Idempotent like bookings: a client created offline is replayed by the
    // sync queue with the same key, so a retry can't create a duplicate.
    const idempotencyKey = req.headers["idempotency-key"] || null;
    const { status, body } = await withTransaction(async (db) => {
      const cached = await checkIdempotency(db, idempotencyKey, req.shopId);
      if (cached) {
        return { status: cached.response_status, body: cached.response_body };
      }
      // A client with this phone already: they're offered instead, unless the
      // screen says a new one is meant (a family member on the same phone).
      if (allow_same_phone !== true) {
        const matches = await clientsWithPhone(db, req.shopId, phone);
        if (matches.length > 0) return { status: 409, body: { error: "phone_exists", matches } };
      }
      const { rows } = await db.query(
        `INSERT INTO clients (first_name, last_name, email, phone, notes, custom_fields, shop_id, ergotherapia, physiotherapia, logotherapia, date_of_birth) 
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) 
         RETURNING *`,
        [
          upperName(first_name),
          upperName(last_name),
          email,
          phone,
          notes,
          JSON.stringify(custom_fields),
          req.shopId,
          ergotherapia,
          physiotherapia,
          logotherapia,
          date_of_birth || null,
        ],
      );
      rows[0].full_name = `${rows[0].first_name} ${rows[0].last_name}`;
      const responseBody = { success: true, client: rows[0] };
      await saveIdempotency(db, idempotencyKey, req.shopId, 200, responseBody);
      return { status: 200, body: responseBody };
    });
    res.status(status).json(body);
  }));
  // Only the client's notes, as the booking dialog edits them: the full
  // update above needs every field, which that dialog doesn't load.
  router.put("/:id/notes", authenticateToken, notForStaff, notForClients, asyncHandler(async (req, res) => {
    const notes = req.body?.notes;
    if (notes != null && typeof notes !== "string") throw new HttpError(400, "notes must be text");
    const { rowCount } = await pool.query(
      "UPDATE clients SET notes = $1 WHERE id = $2 AND shop_id = $3",
      [notes ? notes.trim() : null, req.params.id, req.shopId],
    );
    if (!rowCount) throw new HttpError(404, "Client not found");
    res.json({ success: true, notes: notes ? notes.trim() : null });
  }, { message: "Update failed" }));
  router.put("/:id", authenticateToken, notForStaff, asyncHandler(async (req, res) => {
    const { id } = req.params;
    const {
      first_name,
      last_name,
      email,
      phone,
      notes,
      custom_fields = [],
      ergotherapia,
      physiotherapia,
      logotherapia,
      date_of_birth,
    } = req.body;

    // The shop's walk-in client stands for "no specific client": renaming it
    // turns every future walk-in booking into that person's (it happened
    // once in production). Its name, phone and email can't be changed, by
    // anyone; the rest (notes, custom fields) stays editable.
    const walkIn = await walkInClientRow(pool, id, req.shopId);
    if (walkIn) {
      const same = (a, b) => String(a ?? "").trim() === String(b ?? "").trim();
      const changed = !same(first_name, walkIn.first_name) || !same(last_name, walkIn.last_name)
        || !same(email, walkIn.email) || !same(phone, walkIn.phone);
      if (changed) return res.status(409).json({ error: "walk_in_locked" });
    }
    await pool.query(
      `UPDATE clients 
       SET first_name=$1, last_name=$2, email=$3, phone=$4, notes=$5, custom_fields=$6,
           ergotherapia=$7, physiotherapia=$8, logotherapia=$9, date_of_birth=$10
       WHERE id=$11 AND shop_id=$12`,
      [
        // The walk-in client's name stays exactly as it is (see above).
        walkIn ? first_name : upperName(first_name),
        walkIn ? last_name : upperName(last_name),
        email,
        phone,
        notes,
        JSON.stringify(custom_fields),
        !!ergotherapia,
        !!physiotherapia,
        !!logotherapia,
        date_of_birth || null,
        id,
        req.shopId,
      ],
    );
    res.json({ success: true });
  }, { message: "Update failed" }));
  router.delete("/:id", authenticateToken, notForStaff, asyncHandler(async (req, res) => {
    const { id } = req.params;
    // We don't DELETE anymore, we just mark them
    await pool.query("UPDATE clients SET is_deleted = TRUE WHERE id = $1", [
      id,
    ]);
    res.json({ success: true, message: "Client archived" });
  }, { message: "Failed to archive client" }));

  return router;
};
