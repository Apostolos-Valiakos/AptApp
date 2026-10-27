// Clients routes (/api/v1/clients*), moved out of server.js unchanged.
// Helpers that still live in server.js are handed over when it mounts this
// router (see "Area routers" near the end of server.js).
const express = require("express");
const { HttpError, asyncHandler, withTransaction } = require("../http");
const jwt = require("jsonwebtoken");
const path = require("path");

module.exports = function clientsRouter({
  authenticateToken,
  canSellExtras,
  checkIdempotency,
  clientInShop,
  dbFileUpload,
  hexToRgba,
  loadClientPackages,
  pool,
  recalculateClientBalance,
  requireShopAdminAccess,
  safeUUID,
  saveIdempotency,
  walkInClientRow,
}) {
  const router = express.Router();

  router.get("/", authenticateToken, async (req, res) => {
    const { slim, search, limit, offset, id } = req.query;
    try {
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
                  email, phone, outstanding_balance, custom_fields,
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

        const data = rows.map((row) => ({
          ...row,
          eoppy_breakdown: row.eoppy_breakdown || { total: 0, services: {} },
          non_eoppy_breakdown: row.non_eoppy_breakdown || {
            total: 0,
            services: {},
          },
        }));

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

      const data = rows.map((row) => ({
        ...row,
        eoppy_breakdown: row.eoppy_breakdown || { total: 0, services: {} },
        non_eoppy_breakdown: row.non_eoppy_breakdown || {
          total: 0,
          services: {},
        },
      }));

      return res.json(data);
    } catch (err) {
      console.error("Clients fetch error:", err);
      if (!res.headersSent) {
        return res.status(500).json({ error: "Internal Server Error" });
      }
    }
  });

  // Get-or-create this shop's single walk-in client — used to pre-select a
  // client on a brand-new, blank appointment (save fast, attribute later).
  // Guarded by a row lock on the shop so two concurrent first-uses can't each
  // create their own walk-in client.
  router.get("/walk-in", authenticateToken, asyncHandler(async (req, res) => {
    if (req.user.role === "client") return res.status(403).json({ error: "Forbidden" });
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

  router.post("/", authenticateToken, asyncHandler(async (req, res) => {
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
      const { rows } = await db.query(
        `INSERT INTO clients (first_name, last_name, email, phone, notes, custom_fields, shop_id, ergotherapia, physiotherapia, logotherapia, date_of_birth) 
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) 
         RETURNING *`,
        [
          first_name,
          last_name,
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

  router.put("/:id", authenticateToken, asyncHandler(async (req, res) => {
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
        first_name,
        last_name,
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

  router.delete("/:id", authenticateToken, asyncHandler(async (req, res) => {
    const { id } = req.params;
    // We don't DELETE anymore, we just mark them
    await pool.query("UPDATE clients SET is_deleted = TRUE WHERE id = $1", [
      id,
    ]);
    res.json({ success: true, message: "Client archived" });
  }, { message: "Failed to archive client" }));

  router.get("/:id/balance", authenticateToken, asyncHandler(async (req, res) => {
    if (req.user.role === "client") return res.status(403).json({ error: "Forbidden" });
    const id = safeUUID(req.params.id);
    if (!id) return res.status(400).json({ error: "Invalid id" });
    if (!(await clientInShop(pool, id, req.shopId))) return res.status(404).json({ error: "Not found" });
    res.json({ balance: await recalculateClientBalance(pool, id) });
  }));

  router.get("/:id/debts", authenticateToken, requireShopAdminAccess, asyncHandler(async (req, res) => {
    const id = safeUUID(req.params.id);
    if (!id) return res.status(400).json({ error: "Invalid id" });
    const { rows } = await pool.query(
      `SELECT d.id, d.amount::float AS amount, to_char(d.debt_date, 'YYYY-MM-DD') AS debt_date, d.note,
              GREATEST(0, d.amount - COALESCE((SELECT SUM(t.amount) FROM transactions t WHERE t.client_debt_id = d.id), 0))::float AS remaining
       FROM client_debts d
       WHERE d.client_id = $1 AND d.shop_id = $2
       ORDER BY d.debt_date DESC, d.created_at DESC`,
      [id, req.shopId],
    );
    res.json(rows);
  }, { log: "List client debts error:" }));

  router.post("/:id/debts", authenticateToken, requireShopAdminAccess, asyncHandler(async (req, res) => {
    const id = safeUUID(req.params.id);
    const amount = Math.round(Number(req.body.amount) * 100) / 100;
    const date = String(req.body.debt_date || "");
    const note = String(req.body.note || "").trim();
    if (!id || !(amount > 0) || amount > 1e7) return res.status(400).json({ error: "amount must be a positive number" });
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return res.status(400).json({ error: "debt_date must be YYYY-MM-DD" });
    if (!note || note.length > 500) return res.status(400).json({ error: "note is required (max 500 characters)" });
    if (!(await clientInShop(pool, id, req.shopId))) return res.status(404).json({ error: "Not found" });
    await pool.query(
      `INSERT INTO client_debts (shop_id, client_id, amount, debt_date, note, created_by_user_id) VALUES ($1, $2, $3, $4, $5, $6)`,
      [req.shopId, id, amount, date, note, String(req.user.userId || "")],
    );
    res.status(201).json({ success: true, new_balance: await recalculateClientBalance(pool, id) });
  }, { log: "Add client debt error:" }));

  router.get(
    "/:id/past-appointments",
    authenticateToken,
    asyncHandler(async (req, res) => {
      const { id } = req.params;
      const limit = Math.min(parseInt(req.query.limit) || 10, 20);
      const threeMonthClause =
        req.user.role !== "super_admin"
          ? "AND (SELECT MIN(start_time) FROM appointment_services WHERE appointment_id = a.id) >= NOW() - INTERVAL '3 months'"
          : "";
      // Filters for the booking sidebar. "completed" = the visit took place
      // (including past bookings never marked completed); "unpaid" = not
      // cancelled and still owing, partly paid included.
      const STATUS_FILTERS = {
        all: "",
        completed: "AND a.status IN ('completed', 'new', 'confirmed', 'arrived', 'started')",
        cancelled: "AND a.status = 'cancelled'",
        "no-show": "AND a.status = 'no-show'",
        unpaid: "AND a.status <> 'cancelled' AND x.owed > 0",
      };
      const statusClause = STATUS_FILTERS[req.query.status] ?? "";
      const { rows } = await pool.query(
        `SELECT x.* FROM (
           SELECT
              a.id,
              a.status,
              (SELECT MIN(start_time) FROM appointment_services WHERE appointment_id = a.id) as start_time,
              (SELECT string_agg(s.name, ', ')
               FROM appointment_services aps
               JOIN services s ON aps.service_id = s.id
               WHERE aps.appointment_id = a.id) as service_names,
              (SELECT string_agg(DISTINCT st.name, ', ')
               FROM appointment_services aps
               JOIN staff st ON aps.staff_id = st.id
               WHERE aps.appointment_id = a.id) as staff_names,
              GREATEST(0,
                COALESCE((SELECT SUM(COALESCE(aps.price_override, s.price))
                          FROM appointment_services aps JOIN services s ON s.id = aps.service_id
                          WHERE aps.appointment_id = a.id), 0)
                + COALESCE((SELECT SUM(total_price) FROM product_sales WHERE appointment_id = a.id), 0)
                - COALESCE((SELECT SUM(amount) FROM transactions WHERE appointment_id = a.id), 0)
              )::float AS owed
           FROM appointments a
           WHERE a.client_id = $1 AND a.shop_id = $2
         ) x
         JOIN appointments a ON a.id = x.id
         WHERE x.start_time < NOW()
           ${threeMonthClause}
           ${statusClause}
         ORDER BY x.start_time DESC
         LIMIT $3`,
        [id, req.shopId, limit],
      );
      res.json(rows);
    }, { log: "Past appointments fetch error:" }),
  );

  router.get("/:id/full", authenticateToken, asyncHandler(async (req, res) => {
    const { id } = req.params;
    if (req.user.role === "client") {
      if (String(req.user.clientId) !== String(id)) {
        console.log(
          `Blocked access: User ${req.user.clientId} tried to view ${id}`,
        );
        return res
          .status(403)
          .json({ error: "Unauthorized to view this profile" });
      }
    }
    // 1. Fetch Client Details
    const clientRes = await pool.query(
      `SELECT * FROM clients WHERE id = $1 AND shop_id = $2`,
      [id, req.shopId],
    );

    if (clientRes.rows.length === 0) {
      return res.status(404).json({ error: "Client not found" });
    }
    const client = clientRes.rows[0];

    // The cached balance is only refreshed on writes, but its formula is
    // time-dependent (appointments crossing into the past start counting).
    // Recalculate on read so the profile always shows the true balance.
    client.outstanding_balance = await recalculateClientBalance(pool, id);

    // 2. Fetch Appointment History
    // FIX: logic calculates start_time from subquery and orders by it safely
    // 2. Fetch Appointment History
    const historyRes = await pool.query(
      `SELECT 
          a.id, 
          a.status, 
          a.deposit_amount,
          a.created_at,
          (
            SELECT MIN(start_time) 
            FROM appointment_services 
            WHERE appointment_id = a.id
          ) as start_time,
          
          COALESCE((
            SELECT SUM(price_override) 
            FROM appointment_services 
            WHERE appointment_id = a.id
          ), 0) as total_service_price,
          
          COALESCE((
            SELECT SUM(total_price) 
            FROM product_sales 
            WHERE appointment_id = a.id
          ), 0) as total_product_price,
          
          (
            SELECT string_agg(s.name, ', ') 
            FROM appointment_services aps 
            JOIN services s ON aps.service_id = s.id 
            WHERE aps.appointment_id = a.id
          ) as service_names,

          (
            SELECT string_agg(DISTINCT st.name, ', ')
            FROM appointment_services aps
            JOIN staff st ON aps.staff_id = st.id
            WHERE aps.appointment_id = a.id
          ) as staff_names,

          a.payment_status,

          (
            SELECT payment_method FROM transactions
            WHERE appointment_id = a.id
            ORDER BY created_at DESC LIMIT 1
          ) as payment_method,

          (
            SELECT gc.purchase_payment_method FROM transactions t
            JOIN gift_cards gc ON gc.id = t.gift_card_id
            WHERE t.appointment_id = a.id AND t.payment_method = 'gift-card'
            ORDER BY t.created_at DESC LIMIT 1
          ) as gift_card_source_method

        FROM appointments a
        WHERE a.client_id = $1 AND a.shop_id = $2
          ${req.user.role !== "super_admin" ? "AND (SELECT MIN(start_time) FROM appointment_services WHERE appointment_id = a.id) >= NOW() - INTERVAL '3 months'" : ""}
        ORDER BY 5 DESC`, // 5 refers to start_time
      [id, req.shopId],
    );

    // 3. Fetch File Metadata
    const filesRes = await pool.query(
      `SELECT id, file_name, file_type, file_size, uploaded_at 
       FROM client_files 
       WHERE client_id = $1 ORDER BY uploaded_at DESC`,
      [id],
    );

    const walkInRes = await pool.query("SELECT walk_in_client_id FROM shops WHERE id = $1", [req.shopId]);
    res.json({
      client: {
        ...client,
        full_name: `${client.first_name} ${client.last_name}`,
        is_walk_in: walkInRes.rows[0]?.walk_in_client_id === client.id,
      },
      history: historyRes.rows,
      files: filesRes.rows,
    });
  }, { log: "Profile Fetch Error:" }));

  // A client's active appointments on one specific date, across every staff
  // member — not gated by the "staff" role's own-appointments-only visibility
  // on GET /api/v1/appointments (that restriction exists for the scheduler's
  // own general listing and is unrelated to this: checking a client out needs
  // to see their whole day even when it spans several staff members). Used by
  // the Payment tab's combined-day-payment checklist; the read is open to any
  // authenticated shop role, only the client-side "select + pay" action is
  // gated to admin/frontdesk/super_admin.
  router.get(
    "/:clientId/appointments-on-date",
    authenticateToken,
    asyncHandler(async (req, res) => {
      const { clientId } = req.params;
      const { date } = req.query; // YYYY-MM-DD, required
      if (!safeUUID(clientId)) {
        return res.status(400).json({ error: "Invalid clientId" });
      }
      if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        return res.status(400).json({ error: "date (YYYY-MM-DD) is required" });
      }
      const { rows } = await pool.query(
        `SELECT
           a.id, a.status, a.payment_status,
           COALESCE((SELECT SUM(t.amount) FROM transactions t WHERE t.appointment_id = a.id), 0) as deposit_amount,
           (
             COALESCE((SELECT SUM(COALESCE(aps.price_override, s.price)) FROM appointment_services aps
                       JOIN services s ON aps.service_id = s.id WHERE aps.appointment_id = a.id), 0)
             + COALESCE((SELECT SUM(total_price) FROM product_sales WHERE appointment_id = a.id), 0)
           ) as total_cost,
           COALESCE((
             SELECT json_agg(json_build_object(
               'service_name', s.name,
               'staff_name', st.name,
               'start_time', aps.start_time
             ) ORDER BY aps.start_time ASC)
             FROM appointment_services aps
             LEFT JOIN services s ON aps.service_id = s.id
             LEFT JOIN staff st ON aps.staff_id = st.id
             WHERE aps.appointment_id = a.id
           ), '[]') as services
         FROM appointments a
         WHERE a.client_id = $1
           AND a.shop_id = $2
           AND a.status NOT IN ('cancelled', 'no-show')
           AND (SELECT MIN(start_time) FROM appointment_services WHERE appointment_id = a.id)::date = $3::date
         ORDER BY (SELECT MIN(start_time) FROM appointment_services WHERE appointment_id = a.id) ASC`,
        [clientId, req.shopId, date],
      );
      res.json(
        rows.map((r) => ({
          id: r.id,
          status: r.status,
          payment_status: r.payment_status,
          deposit_amount: Number(r.deposit_amount),
          total_cost: Number(r.total_cost),
          owed: Math.max(0, Number(r.total_cost) - Number(r.deposit_amount)),
          services: r.services,
        })),
      );
    }),
  );

  // UPLOAD CLIENT FILE (Saved as BLOB)
  router.post(
    "/:id/files",
    authenticateToken,
    dbFileUpload.single("file"),
    asyncHandler(async (req, res) => {
      const { id } = req.params;
      if (!req.file) return res.status(400).json({ error: "No file uploaded" });

      // Fix encoding for special characters
      const originalName = Buffer.from(
        req.file.originalname,
        "latin1",
      ).toString("utf8");

      await pool.query(
        `INSERT INTO client_files (client_id, file_name, file_type, file_size, file_data)
       VALUES ($1, $2, $3, $4, $5)`,
        [id, originalName, req.file.mimetype, req.file.size, req.file.buffer],
      );

      res.json({ success: true });
    }, { message: "Failed to upload file", log: "File Upload Error:" }),
  );

  // DOWNLOAD CLIENT FILE
  router.get(
    "/files/:fileId",
    authenticateToken,
    asyncHandler(async (req, res) => {
      const { fileId } = req.params;
      let query = `
      SELECT cf.file_data, cf.file_type, cf.file_name 
      FROM client_files cf
      JOIN clients c ON cf.client_id = c.id
      WHERE cf.id = $1
    `;
      let params = [fileId];

      // 2. Add Role-Based Security
      if (req.user.role === "client") {
        // CLIENTS: Must match the file ID AND their own clientId
        query += ` AND cf.client_id = $2`;
        params.push(req.user.clientId);
      } else {
        // STAFF/ADMIN: Must match the file ID AND the shop_id they belong to
        query += ` AND c.shop_id = $2`;
        params.push(req.shopId);
      }

      // 3. Execute the query AFTER building it
      const { rows } = await pool.query(query, params);

      if (rows.length === 0) {
        return res
          .status(404)
          .json({ error: "File not found or access denied" });
      }

      const file = rows[0];
      const encodedName = encodeURIComponent(file.file_name);

      // 4. Send the file
      res.setHeader(
        "Content-Type",
        file.file_type || "application/octet-stream",
      );
      res.setHeader(
        "Content-Disposition",
        `attachment; filename*=UTF-8''${encodedName}`,
      );

      res.send(file.file_data);
    }, { message: "Download failed", log: "Download Error:" }),
  );

  // DELETE CLIENT FILE
  router.delete(
    "/files/:fileId",
    authenticateToken,
    asyncHandler(async (req, res) => {
      await pool.query(
        `DELETE FROM client_files cf
       USING clients c
       WHERE cf.client_id = c.id AND cf.id = $1 AND c.shop_id = $2`,
        [req.params.fileId, req.shopId],
      );
      res.json({ success: true });
    }, { message: "Delete failed" }),
  );

  // 3. Get Exercises Completed by Specific Client
  router.get(
    "/:id/exercises",
    authenticateToken,
    asyncHandler(async (req, res) => {
      const { rows } = await pool.query(
        `SELECT exercise_id FROM client_exercises WHERE client_id = $1`,
        [req.params.id],
      );
      // Return simple array of IDs: ['uuid-1', 'uuid-2']
      res.json(rows.map((r) => r.exercise_id));
    }),
  );

  // 4. Toggle Exercise Status (Check/Uncheck)
  router.post(
    "/:id/exercises/toggle",
    authenticateToken,
    asyncHandler(async (req, res) => {
      const { id } = req.params; // Client ID
      const { exerciseId, completed } = req.body;

      if (completed) {
        // Check: Insert record
        await pool.query(
          `INSERT INTO client_exercises (client_id, exercise_id) 
         VALUES ($1, $2) ON CONFLICT DO NOTHING`,
          [id, exerciseId],
        );
      } else {
        // Uncheck: Delete record
        await pool.query(
          `DELETE FROM client_exercises WHERE client_id = $1 AND exercise_id = $2`,
          [id, exerciseId],
        );
      }
      res.json({ success: true });
    }, { message: "Failed to update exercise status" }),
  );

  // Invite Endpoint
  router.post("/:id/invite", authenticateToken, asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { rows } = await pool.query(
      "SELECT * FROM clients WHERE id = $1 AND shop_id = $2",
      [id, req.shopId],
    );
    if (rows.length === 0)
      return res.status(404).json({ error: "Client not found" });
    const client = rows[0];

    if (!client.email)
      return res
        .status(400)
        .json({ error: "Client does not have an email address" });

    const userCheck = await pool.query(
      "SELECT id FROM users WHERE client_id = $1",
      [id],
    );
    if (userCheck.rows.length > 0)
      return res.status(400).json({ error: "Client already has an account" });

    // Fetch shop branding
    const shopRes = await pool.query(
      "SELECT name, reply_email, primary_color FROM shops WHERE id = $1",
      [req.shopId],
    );
    const shopRow = shopRes.rows[0] || {};
    const replyEmail = shopRow.reply_email || null;
    const shopName = shopRow.name || req.user.shopName || process.env.APP_NAME || "Booking";
    const brandColor = shopRow.primary_color || "#111827";
    const brandTint = hexToRgba(brandColor, 0.08);
    const brandTintBorder = hexToRgba(brandColor, 0.2);
    const brandShadow = hexToRgba(brandColor, 0.3);

    // Generate temporary token for signup
    const inviteToken = jwt.sign(
      { typ: "invite", clientId: id, shopId: req.shopId, email: client.email },
      process.env.JWT_SECRET,
      { expiresIn: "48h" },
    );

    const signupUrl = `${process.env.FRONTEND_URL}/signup?token=${inviteToken}`;
    const nodemailer = require("nodemailer");

    const transporter = nodemailer.createTransport({
      host: process.env.EMAIL_HOST,
      port: process.env.EMAIL_PORT,
      secure: process.env.EMAIL_PORT == 465,
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS,
      },
      family: 4,
      connectionTimeout: 10000,
      greetingTimeout: 10000,
    });

    await transporter.sendMail({
      from: `"${shopName}" <${process.env.EMAIL_USER}>`,
      ...(replyEmail && { replyTo: replyEmail }),
      to: client.email,
      subject: "Invitation to your Client Portal",
      attachments: [
        {
          filename: "logo.png",
          path: path.join(__dirname, "../client/static/logo for photos-02.png"),
          cid: "brand-logo",
        },
      ],
      html: `
<!doctype html>
<html>
  <head>
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;700;800&display=swap" rel="stylesheet" />
    <style>
      /* Mobile responsiveness */
      @media only screen and (max-width: 600px) {
        .inner-padding { padding: 30px 15px !important; }
        .button-stack { display: block !important; width: 100% !important; margin: 10px 0 !important; box-sizing: border-box !important; }
      }
      /* Hover effect for buttons */
      .btn-hover:hover { opacity: 0.9 !important; transform: translateY(-2px); }
    </style>
  </head>
  <body style="font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background-color: ${brandTint}; padding: 40px 10px; margin: 0; -webkit-font-smoothing: antialiased;">
    <div style="max-width: 600px; margin: 0 auto; background: white; border-radius: 32px; overflow: hidden; box-shadow: 0 20px 25px -5px ${hexToRgba(brandColor, 0.1)}, 0 10px 10px -5px rgba(0, 0, 0, 0.04);">

      <div style="padding: 40px 40px 20px 40px; text-align: left">
        <img src="cid:brand-logo" alt="${shopName}" width="48" height="48" style="width: 48px; height: 48px; object-fit: contain; margin-bottom: 16px;" />
        <div style="display: inline-block; background-color: ${brandColor}; color: white; padding: 4px 12px; border-radius: 9999px; font-size: 12px; font-weight: 700; margin-bottom: 16px; text-transform: uppercase; letter-spacing: 0.05em;">
          Πρόσκληση
        </div>
        <h2 style="margin: 0; font-size: 24px; font-weight: 800; letter-spacing: -0.025em;">
          <span style="color: #111827">${shopName}</span><span style="color: ${brandColor}"> Portal</span>
        </h2>
      </div>

      <div class="inner-padding" style="padding: 0 40px 40px 40px">
        <h1 style="color: #111827; font-size: 32px; font-weight: 800; margin-bottom: 24px; line-height: 1.1; letter-spacing: -1px;">
          Καλώς ήρθατε στο <span style="color: ${brandColor}">Online Portal</span> μας
        </h1>

        <p style="color: #4b5563; font-size: 16px; line-height: 1.6; margin-bottom: 16px;">
          Γεια σας ${client.first_name},
        </p>
        <p style="color: #4b5563; font-size: 16px; line-height: 1.6">
          Είμαστε ενθουσιασμένοι που σας προσκαλούμε στη νέα μας πλατφόρμα. Εδώ μπορείτε να διαχειρίζεστε τα ραντεβού σας και να έχετε πρόσβαση στα έγγραφά σας 24/7.
        </p>

        <div style="background-color: ${brandTint}; border-radius: 24px; padding: 30px; margin: 32px 0; border: 1px solid ${brandTintBorder};">
          <ul style="color: #374151; font-size: 15px; padding-left: 0; list-style: none; margin: 0;">
            <li style="margin-bottom: 12px; display: flex; align-items: center;">
              <span style="color: ${brandColor}; margin-right: 12px; font-size: 18px;">📅</span>
              <strong>Προβολή ραντεβού:</strong> Δείτε τα επόμενα ραντεβού σας.
            </li>
            <li style="margin-bottom: 12px; display: flex; align-items: center;">
              <span style="color: ${brandColor}; margin-right: 12px; font-size: 18px;">🕒</span>
              <strong>Ιστορικό:</strong> Πλήρης έλεγχος των επισκέψεών σας.
            </li>
            <li style="display: flex; align-items: center;">
              <span style="color: ${brandColor}; margin-right: 12px; font-size: 18px;">📁</span>
              <strong>Αρχεία:</strong> Κατεβάστε σημαντικά έγγραφα και οδηγίες.
            </li>
          </ul>
        </div>

        <div style="text-align: center; margin-top: 40px;">
          <a href="${signupUrl}" class="btn-hover button-stack" style="display: inline-block; background-color: ${brandColor}; color: white; padding: 18px 40px; border-radius: 16px; text-decoration: none; font-weight: 700; font-size: 16px; transition: all 0.2s ease; box-shadow: 0 10px 15px -3px ${brandShadow};">
            Ενεργοποίηση Λογαριασμού
          </a>
          <p style="color: #9ca3af; font-size: 12px; margin-top: 25px;">
             Αυτός ο σύνδεσμος θα λήξει σε 48 ώρες για την ασφάλειά σας.
          </p>
        </div>
      </div>

      <div style="background-color: #fff; padding: 40px; text-align: center; border-top: 1px solid ${hexToRgba(brandColor, 0.1)};">
        <p style="color: #111827; font-size: 16px; font-weight: 700; margin-bottom: 8px;">
          ${shopName}<span style="color: ${brandColor}"> Booking</span>
        </p>
        <p style="color: #9ca3af; font-size: 12px; margin: 0;">
          © ${new Date().getFullYear()} Powered by ${process.env.APP_NAME || "Booking"}
        </p>
      </div>
    </div>
  </body>
</html>
      `,
    });

    res.json({ success: true });
  }, { message: "Failed to send invitation", log: "Invite Error:" }));

  // Current membership (any status, most recent) + per-covered-service usage
  // for the current calendar month. Quotas always reset on the 1st of the
  // month regardless of monthly/yearly billing — computed live, no reset job.
  router.get("/:id/membership", authenticateToken, asyncHandler(async (req, res) => {
    if (req.user.role === "client" && String(req.user.clientId) !== String(req.params.id)) {
      return res.status(403).json({ error: "Unauthorized to view this membership" });
    }
    const { rows } = await pool.query(
      `SELECT cm.*, mt.name as tier_name, mt.monthly_price, mt.yearly_price, mt.grace_period_days
       FROM client_memberships cm
       JOIN membership_tiers mt ON mt.id = cm.tier_id
       WHERE cm.client_id = $1 AND cm.shop_id = $2
       ORDER BY cm.created_at DESC LIMIT 1`,
      [req.params.id, req.shopId],
    );
    if (rows.length === 0) return res.json({ membership: null, usage: [] });

    const membership = rows[0];
    const { rows: usage } = await pool.query(
      `SELECT mts.service_id, s.name as service_name, mts.quota_per_month,
              COALESCE((
                SELECT COUNT(*) FROM membership_usage mu
                WHERE mu.client_membership_id = $1 AND mu.service_id = mts.service_id
                  AND mu.used_at >= date_trunc('month', NOW())
              ), 0) as used_this_month
       FROM membership_tier_services mts
       JOIN services s ON s.id = mts.service_id
       WHERE mts.tier_id = $2`,
      [membership.id, membership.tier_id],
    );

    res.json({
      membership,
      usage: usage.map((u) => ({
        ...u,
        used_this_month: parseInt(u.used_this_month),
        remaining: u.quota_per_month === null ? null : Math.max(0, u.quota_per_month - parseInt(u.used_this_month)),
      })),
    });
  }));

  // Assign/change a client's membership tier — admin only. Cancels any
  // existing active/paused enrollment and starts a fresh one. Payment is
  // recorded manually, same pattern as gift-card sales (no payment gateway).
  router.post("/:id/membership", authenticateToken, asyncHandler(async (req, res) => {
    if (req.user.role !== "admin" && req.user.role !== "super_admin") {
      return res.status(403).json({ error: "Admins only" });
    }
    const { tier_id, billing_cycle, payment_method } = req.body;
    if (!tier_id || !["monthly", "yearly"].includes(billing_cycle)) {
      return res.status(400).json({ error: "tier_id and a valid billing_cycle are required" });
    }

    const { status, body } = await withTransaction(async (client) => {

      const tierRes = await client.query(
        `SELECT * FROM membership_tiers WHERE id = $1 AND shop_id = $2`,
        [tier_id, req.shopId],
      );
      if (tierRes.rows.length === 0) {
        throw new HttpError(404, { error: "Tier not found" });
      }
      const tier = tierRes.rows[0];

      await client.query(
        `UPDATE client_memberships SET status = 'cancelled'
         WHERE client_id = $1 AND status IN ('active', 'paused')`,
        [req.params.id],
      );

      const periodInterval = billing_cycle === "yearly" ? "1 year" : "1 month";
      const { rows } = await client.query(
        `INSERT INTO client_memberships
           (client_id, shop_id, tier_id, billing_cycle, status, started_at, current_period_start, current_period_end, last_payment_recorded_at)
         VALUES ($1, $2, $3, $4, 'active', NOW(), NOW(), NOW() + $5::interval, NOW())
         RETURNING *`,
        [req.params.id, req.shopId, tier_id, billing_cycle, periodInterval],
      );

      const amount = billing_cycle === "yearly" ? tier.yearly_price : tier.monthly_price;
      await client.query(
        `INSERT INTO transactions (appointment_id, client_id, amount, payment_method, transaction_type, shop_id, created_at)
         VALUES (NULL, $1, $2, $3, 'membership_sale', $4, NOW())`,
        [req.params.id, amount, payment_method || "cash", req.shopId],
      );

      return { status: 200, body: rows[0] };
    });
    res.status(status).json(body);
  }));

  // Renew the client's current (active or lapsed-within-grace) membership for
  // another billing cycle — admin only.
  router.post("/:id/membership/renew", authenticateToken, asyncHandler(async (req, res) => {
    if (req.user.role !== "admin" && req.user.role !== "super_admin") {
      return res.status(403).json({ error: "Admins only" });
    }
    const { payment_method } = req.body;

    const { status, body } = await withTransaction(async (client) => {

      const { rows } = await client.query(
        `SELECT cm.*, mt.monthly_price, mt.yearly_price
         FROM client_memberships cm
         JOIN membership_tiers mt ON mt.id = cm.tier_id
         WHERE cm.client_id = $1 AND cm.shop_id = $2 AND cm.status IN ('active', 'expired')
         ORDER BY cm.created_at DESC LIMIT 1`,
        [req.params.id, req.shopId],
      );
      if (rows.length === 0) {
        throw new HttpError(404, { error: "No renewable membership found" });
      }
      const membership = rows[0];
      const periodInterval = membership.billing_cycle === "yearly" ? "1 year" : "1 month";

      const updated = await client.query(
        `UPDATE client_memberships
         SET status = 'active',
             current_period_start = GREATEST(current_period_end, NOW()),
             current_period_end = GREATEST(current_period_end, NOW()) + $2::interval,
             last_payment_recorded_at = NOW(),
             renewal_reminder_sent_at = NULL
         WHERE id = $1
         RETURNING *`,
        [membership.id, periodInterval],
      );

      const amount = membership.billing_cycle === "yearly" ? membership.yearly_price : membership.monthly_price;
      await client.query(
        `INSERT INTO transactions (appointment_id, client_id, amount, payment_method, transaction_type, shop_id, created_at)
         VALUES (NULL, $1, $2, $3, 'membership_sale', $4, NOW())`,
        [req.params.id, amount, payment_method || "cash", req.shopId],
      );

      return { status: 200, body: updated.rows[0] };
    });
    res.status(status).json(body);
  }));

  // Cancel a client's membership — admin only.
  router.delete("/:id/membership", authenticateToken, asyncHandler(async (req, res) => {
    if (req.user.role !== "admin" && req.user.role !== "super_admin") {
      return res.status(403).json({ error: "Admins only" });
    }
    const { rowCount } = await pool.query(
      `UPDATE client_memberships SET status = 'cancelled'
       WHERE client_id = $1 AND shop_id = $2 AND status IN ('active', 'paused')`,
      [req.params.id, req.shopId],
    );
    if (rowCount === 0) return res.status(404).json({ error: "No active membership found" });
    res.json({ success: true });
  }));

  // A client's packages (staff, or the client themselves).
  router.get("/:id/packages", authenticateToken, asyncHandler(async (req, res) => {
    if (req.user.role === "client" && String(req.user.clientId) !== String(req.params.id)) {
      return res.status(403).json({ error: "Unauthorized to view these packages" });
    }
    const list = await loadClientPackages(pool, req.shopId, req.params.id, {
      activeOnly: req.query.active === "true",
    });
    res.json(list);
  }));

  // Sell a package to a client: records the package plus one 'package_sale'
  // transaction (revenue counted today; later visits are $0 'package' payments).
  router.post("/:id/packages", authenticateToken, asyncHandler(async (req, res) => {
    if (!canSellExtras(req.user)) return res.status(403).json({ error: "Not allowed" });
    const { package_type_id, payment_method = "cash", note } = req.body;
    if (!safeUUID(package_type_id)) return res.status(400).json({ error: "package_type_id is required" });
    if (!["cash", "card", "bank-transfer"].includes(payment_method)) {
      return res.status(400).json({ error: "Invalid payment method" });
    }
    const { status, body } = await withTransaction(async (client) => {
      const c = await client.query("SELECT 1 FROM clients WHERE id = $1 AND shop_id = $2", [req.params.id, req.shopId]);
      if (!c.rows[0]) {
        throw new HttpError(404, { error: "Client not found" });
      }
      const t = await client.query(
        "SELECT * FROM package_types WHERE id = $1 AND shop_id = $2 AND is_active = true",
        [package_type_id, req.shopId],
      );
      if (!t.rows[0]) {
        throw new HttpError(404, { error: "Package type not found" });
      }
      const pt = t.rows[0];
      const { rows } = await client.query(
        `INSERT INTO client_packages
           (shop_id, client_id, package_type_id, name, service_id, total_visits, price_paid, expires_at, note)
         VALUES ($1, $2, $3, $4, $5, $6, $7,
                 CASE WHEN $8::int IS NULL THEN NULL ELSE NOW() + ($8::int * INTERVAL '1 day') END, $9)
         RETURNING id`,
        [req.shopId, req.params.id, pt.id, pt.name, pt.service_id, pt.visits, pt.price, pt.validity_days, note || null],
      );
      await client.query(
        `INSERT INTO transactions (appointment_id, client_id, amount, payment_method, transaction_type, shop_id, created_at)
         VALUES (NULL, $1, $2, $3, 'package_sale', $4, NOW())`,
        [req.params.id, pt.price, payment_method, req.shopId],
      );
      return { status: 201, body: { id: rows[0].id } };
    });
    res.status(status).json(body);
  }));

  return router;
};
