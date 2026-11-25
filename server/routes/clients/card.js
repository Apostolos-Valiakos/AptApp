// A client's card: the full profile with history, the day's bookings, files and exercises.
const express = require("express");
const { asyncHandler } = require("../../http");
const { appointmentCostSql, appointmentPaidSql } = require("../../domain/moneySql");

module.exports = function cardRouter({
  notForStaff,
  authenticateToken,
  dbFileUpload,
  pool,
  recalculateClientBalance,
  safeUUID,
}) {
  const router = express.Router();

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
          a.internal_notes,
          a.booking_notes,
          ${appointmentPaidSql("a.id")}::float AS paid,
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
            SELECT COALESCE(json_agg(json_build_object(
              'name', s.name,
              'staff', st.name,
              'notes', aps.notes,
              'charged', COALESCE(aps.price_override, s.price, 0),
              'paid_with', (SELECT paid_with FROM appointment_service_payments WHERE appointment_service_id = aps.id),
              'hidden', (SELECT json_build_object('cash', hidden_cash, 'card', hidden_card, 'both', hidden_both)
                         FROM appointment_service_payments WHERE appointment_service_id = aps.id)
            ) ORDER BY aps.start_time), '[]')
            FROM appointment_services aps
            LEFT JOIN services s ON s.id = aps.service_id
            LEFT JOIN staff st ON st.id = aps.staff_id
            WHERE aps.appointment_id = a.id
          ) as services_paid,

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
        ORDER BY start_time DESC`,
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
    // The notes on a client's card are the shop's, not for the client to read.
    if (req.user.role === "client") {
      delete client.notes;
      for (const row of historyRes.rows) {
        delete row.internal_notes;
        // Each service's own note is the shop's too.
        row.services_paid = (row.services_paid || []).map(({ notes, ...svc }) => svc);
      }
    }
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
           ${appointmentPaidSql("a.id")} as deposit_amount,
           (
             ${appointmentCostSql("a.id")}
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
    notForStaff,
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
    notForStaff,
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
    notForStaff,
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

  return router;
};
