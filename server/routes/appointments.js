// Appointments routes (/api/v1/appointments*), moved out of server.js unchanged.
// Helpers that still live in server.js are handed over when it mounts this
// router (see "Area routers" near the end of server.js).
const crypto = require("crypto");
const express = require("express");
const { HttpError, asyncHandler, withTransaction } = require("../http");

module.exports = function appointmentsRouter({
  DiscountError,
  MissingStaffError,
  OfflineConflictError,
  SelfBookingNotAllowedError,
  StaffUnavailableError,
  allocate,
  assertBaseVersion,
  assertCapacity,
  assertNoNewOverlaps,
  authenticateToken,
  canSellExtras,
  checkIdempotency,
  createAppointmentSeries,
  getGroupDetails,
  getVisibilityClause,
  parseDebtResolution,
  performSingleUpdate,
  pool,
  recalculateClientBalance,
  releasePackageUsage,
  requireShopAdminAccess,
  round2,
  safeUUID,
  sanitizeClientBookingPayload,
  saveIdempotency,
  settleAmount,
}) {
  const router = express.Router();

  // Booking errors raised by createAppointmentSeries / performSingleUpdate and
  // the offline conflict checks, as the create and edit routes answer them.
  const bookingError = (err) => {
    if (err instanceof DiscountError) return { status: 400, body: { error: "invalid_discount", reason: err.reason } };
    if (err instanceof StaffUnavailableError) {
      return { status: 422, body: { error: "staff_unavailable", reason: err.reason, staff_id: err.staffId } };
    }
    if (err instanceof MissingStaffError) return { status: 422, body: { error: "staff_required" } };
    if (err instanceof OfflineConflictError) return { status: 409, body: { error: err.code, ...err.details } };
    return null;
  };
  // Creating also answers a refused client self-booking.
  const createBookingError = (err) =>
    err instanceof SelfBookingNotAllowedError
      ? { status: 422, body: { error: err.message, reason: err.reason } }
      : bookingError(err);

  router.get("/", authenticateToken, asyncHandler(async (req, res) => {
      // 1. Capture date parameters from the request
      const { date, start, end } = req.query;
      const visibilityClause = getVisibilityClause(req.user, "a");

      let dateFilter = "";
      const params = [req.shopId];

      // 2. Build the dynamic date filter. An appointment belongs to the day of
      // its first service (fs.first_start, see the query). For a range, the
      // IN (...) first narrows to appointments with any service in it — which
      // the start_time index answers — so the whole history isn't scanned;
      // the first_start condition keeps the exact meaning.
      if (date) {
        params.push(date);
        dateFilter = ` AND fs.first_start::date = $${params.length}::date`;
      } else if (start && end) {
        params.push(start, end);
        const s = `$${params.length - 1}`;
        const e = `$${params.length}`;
        dateFilter =
          ` AND a.id IN (SELECT appointment_id FROM appointment_services WHERE start_time BETWEEN ${s} AND ${e})` +
          ` AND fs.first_start BETWEEN ${s} AND ${e}`;
      }

      // 3. Non-super_admin users cannot retrieve appointments older than 3 months
      const threeMonthClause =
        req.user.role !== "super_admin"
          ? ` AND fs.first_start >= NOW() - INTERVAL '3 months'`
          : "";

      // 4. Plain "staff" (not frontdesk/admin/super_admin) can only ever see their
      // own appointments, and never anything before today. Enforced here — not
      // just hidden client-side — so it can't be bypassed by calling the API
      // directly with a different date range or another staff member's id.
      let staffOwnClause = "";
      if (req.user.role === "staff") {
        if (req.user.staffId) {
          params.push(req.user.staffId);
          staffOwnClause = ` AND EXISTS (SELECT 1 FROM appointment_services aps_staff WHERE aps_staff.appointment_id = a.id AND aps_staff.staff_id = $${params.length})`;
        } else {
          // No linked staff profile — nothing to show.
          staffOwnClause = " AND FALSE";
        }
        staffOwnClause += ` AND fs.first_start >= CURRENT_DATE`;
      }

      // A logged-in client can only ever see their own appointments — past and
      // future both (unlike staff, who are future-only above), matching what
      // they already see via /api/v1/clients/:id/full. Previously there was no
      // client-role branch at all here, meaning a client JWT could list every
      // appointment in the shop.
      if (req.user.role === "client") {
        if (req.user.clientId) {
          params.push(req.user.clientId);
          staffOwnClause = ` AND a.client_id = $${params.length}`;
        } else {
          staffOwnClause = " AND FALSE";
        }
      }

      const { rows } = await pool.query(
        `
        SELECT 
          a.id, 
          a.version,
          a.client_id, 
          a.status, 
          a.internal_notes, 
          a.booking_notes, 
          a.payment_status, 
          a.is_block, 
          a.is_eoppy,
          a.save_receipt, 
          -- As text ("2026-10-21"): a DATE sent as a JS Date becomes the day
          -- before's 21:00/22:00 UTC (midnight in Athens), and the hover card
          -- would show the previous day.
          a.created_at::text AS created_at,
          a.booked_at,
          a.recurrence,
          a.group_id,
          a.discount_type,
          a.discount_value,
          a.discount_scope,
          a.discount_code_id,
          a.discount_code_name,
          COALESCE(a.discount_amount, 0) as discount_amount,
          c.first_name, 
          c.last_name, 
          c.phone as client_phone,
          COALESCE(c.outstanding_balance, 0) as client_outstanding_balance,
          COALESCE((SELECT SUM(amount) FROM transactions WHERE appointment_id = a.id), 0) as deposit_amount,
          -- True only on a client's first visit: their earliest booking by its
          -- first service's start (not cancelled / no-show; ties by id). It
          -- powers the "new client" badge on the hover card. The day a
          -- booking was made can't decide it: two made the same day tie.
          -- NULL-safe: a block/hold without a client yields no match.
          (
            a.client_id IS NOT NULL AND a.id = (
              SELECT a2.id FROM appointments a2
              JOIN LATERAL (
                SELECT MIN(start_time) AS first_start FROM appointment_services WHERE appointment_id = a2.id
              ) f2 ON f2.first_start IS NOT NULL
              WHERE a2.client_id = a.client_id AND a2.shop_id = a.shop_id
                AND a2.status NOT IN ('cancelled', 'no-show', 'no_show')
              ORDER BY f2.first_start ASC, a2.id ASC
              LIMIT 1
            )
          ) as is_new_client,
          (SELECT payment_method FROM transactions WHERE appointment_id = a.id ORDER BY created_at DESC LIMIT 1) as payment_method,
          (
            SELECT gc.purchase_payment_method FROM transactions t
            JOIN gift_cards gc ON gc.id = t.gift_card_id
            WHERE t.appointment_id = a.id AND t.payment_method = 'gift-card'
            ORDER BY t.created_at DESC LIMIT 1
          ) as gift_card_source_method,
          (
            COALESCE((SELECT SUM(COALESCE(aps2.price_override, s2.price)) FROM appointment_services aps2 JOIN services s2 ON aps2.service_id = s2.id WHERE aps2.appointment_id = a.id), 0) +
            COALESCE((SELECT SUM(total_price) FROM product_sales WHERE appointment_id = a.id), 0)
          ) as total_cost,
          COALESCE((
            SELECT json_agg(json_build_object(
              'service_id', s.id,
              'service_name', s.name,
              'service_archived', COALESCE(s.is_active = false, false),
              'service_color', s.color_code,
              'category_color', sc.color_code,
              'variation_name', aps.variation_name,
              'price', COALESCE(aps.list_price, aps.price_override, s.price),
              'duration_minutes', COALESCE(aps.duration_override, s.duration_minutes),
              'staff_id', aps.staff_id,
              'staff_name', st.name,
              'start_time', aps.start_time,
              'persons', aps.persons
            ) ORDER BY aps.start_time ASC)
            FROM appointment_services aps
            LEFT JOIN services s ON aps.service_id = s.id
            LEFT JOIN service_categories sc ON sc.shop_id = s.shop_id AND sc.name = s.category
            LEFT JOIN staff st ON aps.staff_id = st.id
            WHERE aps.appointment_id = a.id
          ), '[]') as services,
          COALESCE((
            SELECT json_agg(json_build_object(
              'product_id', ps.inventory_id,
              'quantity', ps.quantity,
              'price', ROUND(COALESCE(ps.list_total, ps.total_price) / NULLIF(ps.quantity, 0), 2)
            ))
            FROM product_sales ps
            WHERE ps.appointment_id = a.id
          ), '[]') as products
        FROM appointments a
        LEFT JOIN clients c ON a.client_id = c.id
        JOIN LATERAL (
          SELECT MIN(start_time) AS first_start FROM appointment_services WHERE appointment_id = a.id
        ) fs ON true
        WHERE a.shop_id = $1 ${visibilityClause} ${dateFilter} ${threeMonthClause} ${staffOwnClause}
        GROUP BY a.id, c.first_name, c.last_name, c.phone, c.outstanding_balance, fs.first_start
        ORDER BY fs.first_start ASC, a.id
      `,
        params,
      );

      const formatted = rows.map((row) => ({
        ...row,
        start_time: row.services?.[0]?.start_time || row.created_at,
        staff_id: row.services?.[0]?.staff_id,
        current_appt_total: parseFloat(row.total_cost),
        deposit_amount: parseFloat(row.deposit_amount),
        // Staff-authored notes about a client should never reach the client's
        // own portal view of their own appointment.
        ...(req.user.role === "client" ? { internal_notes: null, products: [] } : {}),
      }));

      res.json(formatted);
  }));

  router.post("/", authenticateToken, asyncHandler(async (req, res) => {
    const idempotencyKey = req.headers["idempotency-key"] || null;
    const { status, body } = await withTransaction(async (client) => {
      const cached = await checkIdempotency(client, idempotencyKey, req.shopId);
      if (cached) return { status: cached.response_status, body: cached.response_body };

      let bookingPayload = req.body;
      if (!["admin", "super_admin", "frontdesk"].includes(req.user.role)) {
        delete bookingPayload.allow_unavailable;
        delete bookingPayload.allow_overtime;
      }
      if (req.user.role === "client") {
        if (!req.user.clientId) {
          throw new SelfBookingNotAllowedError("no_client_id");
        }
        bookingPayload = await sanitizeClientBookingPayload(
          client,
          req.body,
          req.shopId,
          req.user.clientId,
        );
      }

      await assertNoNewOverlaps(client, req.shopId, bookingPayload);
      // Repeats (a series, or the repeat-booking dialog's dates) aren't
      // checked, nor client portal bookings yet.
      if (req.user.role !== "client" && !bookingPayload.recurrence && !Array.isArray(bookingPayload.instance_starts)) {
        await assertCapacity(client, req.shopId, bookingPayload);
      }

      const { firstAppointmentId, validClientId } = await createAppointmentSeries(
        client,
        bookingPayload,
        req.shopId,
      );

      let newBalance = 0;
      if (validClientId) {
        newBalance = await recalculateClientBalance(client, validClientId);
      }

      const versionRes = await client.query("SELECT version FROM appointments WHERE id = $1", [firstAppointmentId]);
      const responseBody = {
        id: firstAppointmentId,
        version: versionRes.rows[0] ? Number(versionRes.rows[0].version) : null,
        success: true,
        new_balance: newBalance,
      };
      await saveIdempotency(client, idempotencyKey, req.shopId, 200, responseBody);
      return { status: 200, body: responseBody };
    });
    res.status(status).json(body);
  }, { log: "Create Appointment Error:", message: "Failed to create appointment", mapError: createBookingError }));

  router.put("/:id", authenticateToken, asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { scope } = req.query;
    const idempotencyKey = req.headers["idempotency-key"] || null;

    // Clients never edit an appointment directly — confirm/cancel go through
    // the dedicated /api/v1/portal/appointments/:id/{confirm,cancel} routes.
    // Without this, a client JWT could rewrite any appointment in the shop.
    if (req.user.role === "client") {
      return res.status(403).json({ error: "forbidden" });
    }
    // Same overrides as on create: only these roles may book outside working
    // hours (allow_overtime) or skip availability checks (allow_unavailable).
    if (!["admin", "super_admin", "frontdesk"].includes(req.user.role)) {
      delete req.body.allow_unavailable;
      delete req.body.allow_overtime;
    }

    const { status, body } = await withTransaction(async (client) => {
      const cached = await checkIdempotency(client, idempotencyKey, req.shopId);
      if (cached) return { status: cached.response_status, body: cached.response_body };

      const validClientId = safeUUID(req.body.client_id);

      if (scope !== "series") {
        await assertBaseVersion(client, req.shopId, id, req.body);
        await assertNoNewOverlaps(client, req.shopId, req.body, id);
        await assertCapacity(client, req.shopId, req.body, id);
      }

      if (scope === "series") {
        const groupInfo = await getGroupDetails(client, id, req.shopId);
        const isRecurringBody = !!req.body.recurrence;

        if (groupInfo && groupInfo.group_id) {
          // === Case 1: Existing Series (Delete Future & Recreate) ===
          const currentApptStart = req.body.services[0]?.start_time;
          await client.query(
            `DELETE FROM appointments 
             WHERE group_id = $1 AND shop_id = $2
             AND id IN (
               SELECT a.id FROM appointments a
               JOIN appointment_services aps ON a.id = aps.appointment_id
               WHERE a.group_id = $1 AND aps.start_time >= $3
             )`,
            [groupInfo.group_id, req.shopId, currentApptStart],
          );

          // createAppointmentSeries will create new rows.
          // These rows default to reminder_sent = false automatically via DB schema.
          await createAppointmentSeries(
            client,
            { ...req.body, group_id_override: groupInfo.group_id },
            req.shopId,
          );
        } else if (isRecurringBody) {
          // === Case 2: Convert Single -> Series (Update Current & Fill Future) ===
          const newGroupId = crypto.randomUUID();
          const recurrenceRule = JSON.stringify(req.body.recurrence);

          // 1. Update the CURRENT appointment (the 'Single' one)
          // We use performSingleUpdate to handle services/products/basic info
          await performSingleUpdate(client, id, req.shopId, req.body);

          // 2. Assign the new Group ID, Recurrence Rule to it and RESET reminder_sent
          await client.query(
            `UPDATE appointments 
               SET group_id = $1, recurrence = $2, email_reminder_sent = false 
               WHERE id = $3 AND shop_id = $4`,
            [newGroupId, recurrenceRule, id, req.shopId],
          );

          // 3. Create the REST of the series
          // The duplicate check in createAppointmentSeries will see the current appointment
          // (which we just updated) and skip creating a duplicate for today,
          // then proceed to create the future ones.
          await createAppointmentSeries(
            client,
            { ...req.body, group_id_override: newGroupId },
            req.shopId,
          );
        }
      } else {
        // === Case 3: Single Update ===
        await performSingleUpdate(client, id, req.shopId, req.body);

        // Reset flag to ensure that if the time was moved, a new reminder can trigger
        await client.query(
          `UPDATE appointments SET email_reminder_sent = false WHERE id = $1 AND shop_id = $2`,
          [id, req.shopId],
        );
      }

      let newBalance = 0;
      if (validClientId) {
        newBalance = await recalculateClientBalance(client, validClientId);
      }

      const versionRes = await client.query("SELECT version FROM appointments WHERE id = $1 AND shop_id = $2", [id, req.shopId]);
      const responseBody = {
        success: true,
        new_balance: newBalance,
        version: versionRes.rows[0] ? Number(versionRes.rows[0].version) : null,
      };
      await saveIdempotency(client, idempotencyKey, req.shopId, 200, responseBody);
      return { status: 200, body: responseBody };
    });
    res.status(status).json(body);
  }, { log: "Update Appointment Error:", message: "Update failed", mapError: bookingError }));

  // Staff-side quick cancel (soft — the appointment stays for history/reporting,
  // only its status changes). Completed ones too: it's what a booking with
  // payments gets instead of being deleted (payments stay, as credit). Deliberately separate from the general PUT
  // endpoint: that one requires resending the full services/products arrays or
  // it wipes them out, which is overkill for a one-click "cancel" action from a
  // summary view that doesn't have that data loaded. Mirrors the client
  // portal's own cancel endpoint, plus releasing any redeemed package visit
  // (the portal one doesn't — a pre-existing gap there, left alone since the
  // client portal is a separate, not-yet-shipped feature).
  router.post("/:id/cancel", authenticateToken, asyncHandler(async (req, res) => {
    if (req.user.role === "client") return res.status(403).json({ error: "Forbidden" });
    const { id } = req.params;
    const newBalance = await withTransaction(async (client) => {
      const check = await client.query(
        `SELECT client_id FROM appointments
         WHERE id = $1 AND shop_id = $2 AND status <> 'cancelled'`,
        [id, req.shopId],
      );
      if (check.rows.length === 0) {
        throw new HttpError(404, { error: "Appointment not found or cannot be cancelled" });
      }
      const clientId = check.rows[0].client_id;

      await client.query("UPDATE appointments SET status = 'cancelled' WHERE id = $1", [id]);
      await releasePackageUsage(client, [id]);
      await client.query(
        `UPDATE product_inventory pi
         SET stock_quantity = pi.stock_quantity + ps.quantity
         FROM product_sales ps
         WHERE ps.inventory_id = pi.id AND ps.appointment_id = $1`,
        [id],
      );
      await client.query("DELETE FROM product_sales WHERE appointment_id = $1", [id]);

      return clientId ? await recalculateClientBalance(client, clientId) : undefined;
    });
    res.json({ success: true, new_balance: newBalance });
  }, { log: "Staff appointment cancel error:" }));

  router.delete("/:id", authenticateToken, asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { scope } = req.query;
    const idempotencyKey = req.headers["idempotency-key"] || null;

    const { status, body } = await withTransaction(async (client) => {
      const cached = await checkIdempotency(client, idempotencyKey, req.shopId);
      if (cached) return { status: cached.response_status, body: cached.response_body };

      // Look up the client now — the row won't exist to query after deletion.
      const affectedClientRes = await client.query(
        "SELECT client_id FROM appointments WHERE id = $1 AND shop_id = $2",
        [id, req.shopId],
      );
      // Already gone (deleted on another device, or a replayed offline delete):
      // the outcome the caller wants, so report success rather than an error.
      // Answered through HttpError so the transaction rolls back and nothing
      // is kept for this idempotency key (as before).
      if (affectedClientRes.rows.length === 0) {
        throw new HttpError(200, { success: true, already_deleted: true });
      }
      const affectedClientId = affectedClientRes.rows[0]?.client_id || null;

      // Collect the appointment ids being deleted so product stock can be restored
      let deletedIds = [id];
      let groupInfo = null;
      if (scope === "series") {
        groupInfo = await getGroupDetails(client, id, req.shopId);
        if (groupInfo && groupInfo.group_id) {
          const idsRes = await client.query(
            `SELECT DISTINCT a.id FROM appointments a
             JOIN appointment_services aps ON a.id = aps.appointment_id
             WHERE a.group_id = $1 AND a.shop_id = $2 AND aps.start_time >= $3`,
            [groupInfo.group_id, req.shopId, groupInfo.start_time],
          );
          deletedIds = idsRes.rows.map((r) => r.id);
        }
      }

      // A booking with money on it (payments, refunds, write-offs, package or
      // membership visits) isn't deleted — its payments would be left linked
      // to nothing. It can be cancelled instead (POST /:id/cancel), which
      // keeps them; what was paid then counts as the client's credit.
      const paidRes = await client.query(
        "SELECT appointment_id FROM transactions WHERE appointment_id = ANY($1) LIMIT 1",
        [deletedIds],
      );
      if (paidRes.rows.length > 0) {
        throw new HttpError(409, { error: "has_payments", appointment_id: paidRes.rows[0].appointment_id });
      }

      // Visits paid with a prepaid package go back to the package
      await releasePackageUsage(client, deletedIds);

      // Restore stock for any product sales on the deleted appointments
      await client.query(
        `UPDATE product_inventory pi
         SET stock_quantity = pi.stock_quantity + ps.quantity
         FROM product_sales ps
         WHERE ps.inventory_id = pi.id AND ps.appointment_id = ANY($1)`,
        [deletedIds],
      );
      await client.query(
        "DELETE FROM product_sales WHERE appointment_id = ANY($1)",
        [deletedIds],
      );

      if (scope === "series" && groupInfo && groupInfo.group_id) {
        await client.query(
          `DELETE FROM appointments WHERE id = ANY($1) AND shop_id = $2`,
          [deletedIds, req.shopId],
        );
      } else {
        await client.query(
          "DELETE FROM appointments WHERE id = $1 AND shop_id = $2",
          [id, req.shopId],
        );
      }

      let newBalance;
      if (affectedClientId) {
        newBalance = await recalculateClientBalance(client, affectedClientId);
      }

      const responseBody = { success: true, new_balance: newBalance };
      await saveIdempotency(client, idempotencyKey, req.shopId, 200, responseBody);
      return { status: 200, body: responseBody };
    });
    res.status(status).json(body);
  }));

  router.post("/swap", authenticateToken, asyncHandler(async (req, res) => {
    const { appointment1_id, appointment2_id } = req.body;
    if (!appointment1_id || !appointment2_id)
      return res.status(400).json({ error: "Two appointment IDs required" });

    await withTransaction(async (client) => {
      const q1 = await client.query(
        `SELECT * FROM appointment_services WHERE appointment_id = $1 AND shop_id = $2 ORDER BY id`,
        [appointment1_id, req.shopId],
      );
      const q2 = await client.query(
        `SELECT * FROM appointment_services WHERE appointment_id = $1 AND shop_id = $2 ORDER BY id`,
        [appointment2_id, req.shopId],
      );

      const s1 = q1.rows;
      const s2 = q2.rows;

      for (let i = 0; i < s1.length && i < s2.length; i++) {
        // variation_name travels with the rest of the swapped bundle (same
        // reasoning as list_price/price_override/duration_override above) —
        // service_id doesn't change, only which appointment this row's
        // time/price/duration/variation is now attached to.
        await client.query(
          `UPDATE appointment_services SET start_time=$1, staff_id=$2, duration_override=$3, price_override=$4, list_price=$6, variation_name=$7 WHERE id=$5`,
          [
            s2[i].start_time,
            s2[i].staff_id,
            s2[i].duration_override,
            s2[i].price_override,
            s1[i].id,
            s2[i].list_price,
            s2[i].variation_name,
          ],
        );
        await client.query(
          `UPDATE appointment_services SET start_time=$1, staff_id=$2, duration_override=$3, price_override=$4, list_price=$6, variation_name=$7 WHERE id=$5`,
          [
            s1[i].start_time,
            s1[i].staff_id,
            s1[i].duration_override,
            s1[i].price_override,
            s2[i].id,
            s1[i].list_price,
            s1[i].variation_name,
          ],
        );
      }
    });
    res.json({ success: true });
  }, { message: "Swap failed" }));

  router.post("/:id/resolve-debt", authenticateToken, requireShopAdminAccess, asyncHandler(async (req, res) => {
    const id = safeUUID(req.params.id);
    const how = parseDebtResolution(req.body);
    if (!id || !how) return res.status(400).json({ error: "mode must be payment (with payment_method) or write_off" });
    const note = String(req.body.note || "").trim().slice(0, 500) || null;
    const result = await withTransaction(async (db) => {
      const apptRes = await db.query(
        `SELECT a.id, a.client_id,
                COALESCE((SELECT SUM(COALESCE(aps.price_override, s.price)) FROM appointment_services aps
                          JOIN services s ON s.id = aps.service_id WHERE aps.appointment_id = a.id), 0)
                  + COALESCE((SELECT SUM(total_price) FROM product_sales WHERE appointment_id = a.id), 0) AS cost,
                COALESCE((SELECT SUM(amount) FROM transactions WHERE appointment_id = a.id), 0) AS paid
         FROM appointments a
         WHERE a.id = $1 AND a.shop_id = $2 AND a.status <> 'cancelled'
         FOR UPDATE OF a`,
        [id, req.shopId],
      );
      const appt = apptRes.rows[0];
      if (!appt) throw new HttpError(404, { error: "Appointment not found or cancelled" });
      const owed = Math.round((Number(appt.cost) - Number(appt.paid)) * 100) / 100;
      if (!(owed > 0)) throw new HttpError(409, { error: "nothing_owed" });
      // All of it, or part (`amount`), never more than what's owed.
      const amount = settleAmount(req.body, owed);
      if (amount === null) throw new HttpError(400, { error: "invalid_amount", owed });
      if (amount > owed + 0.001) throw new HttpError(400, { error: "exceeds_owed", owed });
      const paidNow = Math.round((Number(appt.paid) + amount) * 100) / 100;
      const fullyPaid = paidNow >= Number(appt.cost) - 0.01;
      await db.query(
        `INSERT INTO transactions (appointment_id, client_id, amount, payment_method, transaction_type, shop_id, reason, created_by_user_id, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())`,
        [id, appt.client_id, amount, how.method, how.type, req.shopId, note, String(req.user.userId || "")],
      );
      await db.query(
        `UPDATE appointments SET payment_status = $1, deposit_amount = $2, updated_at = NOW() WHERE id = $3`,
        [fullyPaid ? "paid" : "partial", fullyPaid ? Number(appt.cost) : paidNow, id],
      );
      const balance = appt.client_id ? await recalculateClientBalance(db, appt.client_id) : 0;
      return { success: true, amount, remaining: Math.round((owed - amount) * 100) / 100, new_balance: balance };
    });
    res.json(result);
  }, { log: "Resolve appointment debt error:" }));

  // A refund is an ordinary negative-amount transaction — every revenue/debt/
  // balance query already sums `amount`, so this nets out correctly everywhere
  // (Financials, Daily Report, client balance) with no other changes needed.
  router.post(
    "/:id/refund",
    authenticateToken,
    asyncHandler(async (req, res) => {
      if (!canSellExtras(req.user)) {
        return res.status(403).json({ error: "Not authorized to issue refunds" });
      }
      const { id } = req.params;
      const { amount, payment_method, reason } = req.body;
      const refundAmount = round2(Number(amount));
      if (!refundAmount || refundAmount <= 0) {
        return res.status(400).json({ error: "amount must be a positive number" });
      }
      if (!["cash", "card", "bank-transfer"].includes(payment_method)) {
        return res.status(400).json({ error: "Invalid payment_method" });
      }
      if (!reason?.trim()) {
        return res.status(400).json({ error: "A reason is required" });
      }

      const newBalance = await withTransaction(async (client) => {
        const apptRes = await client.query(
          `SELECT client_id FROM appointments WHERE id = $1 AND shop_id = $2`,
          [id, req.shopId],
        );
        if (apptRes.rows.length === 0) throw new HttpError(404, { error: "Appointment not found" });
        const clientId = apptRes.rows[0].client_id;

        // Cap at what's currently net-collected on this appointment (already
        // nets out any prior refunds, since those are negative rows too).
        const netPaidRes = await client.query(
          `SELECT COALESCE(SUM(amount), 0) AS net_paid FROM transactions WHERE appointment_id = $1`,
          [id],
        );
        const netPaid = Number(netPaidRes.rows[0].net_paid);
        if (refundAmount > netPaid + 0.001) {
          throw new HttpError(400, { error: "exceeds_amount_paid", net_paid: round2(netPaid) });
        }

        await client.query(
          `INSERT INTO transactions
            (appointment_id, client_id, amount, payment_method, transaction_type, reason, created_by_user_id, shop_id, created_at)
           VALUES ($1, $2, $3, $4, 'refund', $5, $6, $7, NOW())`,
          [id, clientId, -refundAmount, payment_method, reason.trim(), req.user.username, req.shopId],
        );

        return clientId ? await recalculateClientBalance(client, clientId) : 0;
      });
      res.json({ success: true, new_balance: newBalance });
    }),
  );

  // A manual checkout price change re-derives each service's price_override
  // from the new total, proportionally to what it currently carries (reusing
  // the same largest-remainder split the discount engine uses), and logs the
  // before/after + reason for the admin report — it isn't a money movement by
  // itself, so it doesn't create a transaction, only an audit row.
  router.post(
    "/:id/price-change",
    authenticateToken,
    asyncHandler(async (req, res) => {
      if (!canSellExtras(req.user)) {
        return res.status(403).json({ error: "Not authorized to change prices" });
      }
      const { id } = req.params;
      const { new_total, reason } = req.body;
      const newTotal = round2(Number(new_total));
      if (new_total == null || Number.isNaN(newTotal) || newTotal < 0) {
        return res.status(400).json({ error: "new_total must be a non-negative number" });
      }
      if (!reason?.trim()) {
        return res.status(400).json({ error: "A reason is required" });
      }

      const result = await withTransaction(async (client) => {
        const apptRes = await client.query(
          `SELECT client_id FROM appointments WHERE id = $1 AND shop_id = $2`,
          [id, req.shopId],
        );
        if (apptRes.rows.length === 0) throw new HttpError(404, { error: "Appointment not found" });
        const clientId = apptRes.rows[0].client_id;

        const svcRes = await client.query(
          `SELECT id, COALESCE(price_override, 0) AS price
           FROM appointment_services WHERE appointment_id = $1 ORDER BY start_time`,
          [id],
        );
        if (svcRes.rows.length === 0) throw new HttpError(400, { error: "no_services_to_adjust" });

        const amounts = svcRes.rows.map((r) => Number(r.price));
        const oldTotal = round2(amounts.reduce((a, b) => a + b, 0));
        const delta = round2(newTotal - oldTotal);

        if (delta !== 0) {
          // No existing price to proportion an increase against (e.g. a comped
          // €0 visit) — put the entire new total on the last block rather than
          // silently doing nothing.
          if (oldTotal <= 0 && delta > 0) {
            const lastIdx = svcRes.rows.length - 1;
            await client.query(
              `UPDATE appointment_services SET price_override = $1 WHERE id = $2`,
              [newTotal, svcRes.rows[lastIdx].id],
            );
          } else {
            const allocs = allocate(amounts, Math.abs(delta));
            for (let i = 0; i < svcRes.rows.length; i++) {
              const newPrice = round2(amounts[i] + (delta > 0 ? allocs[i] : -allocs[i]));
              await client.query(
                `UPDATE appointment_services SET price_override = $1 WHERE id = $2`,
                [newPrice, svcRes.rows[i].id],
              );
            }
          }
        }

        await client.query(
          `INSERT INTO price_adjustments
            (appointment_id, shop_id, old_total, new_total, reason, created_by_user_id, created_at)
           VALUES ($1, $2, $3, $4, $5, $6, NOW())`,
          [id, req.shopId, oldTotal, newTotal, reason.trim(), req.user.username],
        );

        let newBalance = 0;
        if (clientId) newBalance = await recalculateClientBalance(client, clientId);

        // Returned so the client can display the new per-service prices
        // exactly as computed here, instead of re-deriving the same split
        // client-side and risking drift from this endpoint's rounding.
        const updatedServices = await client.query(
          `SELECT service_id, staff_id, start_time, duration_override, price_override, persons
           FROM appointment_services WHERE appointment_id = $1 ORDER BY start_time`,
          [id],
        );

        return {
          success: true,
          new_balance: newBalance,
          old_total: oldTotal,
          new_total: newTotal,
          services: updatedServices.rows,
        };
      });
      res.json(result);
    }),
  );

  // Use one visit of a package for a service line of this appointment.
  router.post("/:id/package-redemptions", authenticateToken, asyncHandler(async (req, res) => {
    if (req.user.role === "client") return res.status(403).json({ error: "Forbidden" });
    const packageId = safeUUID(req.body.client_package_id);
    if (!packageId) return res.status(400).json({ error: "client_package_id is required" });
    const result = await withTransaction(async (client) => {
      const apptRes = await client.query(
        "SELECT id, client_id, status FROM appointments WHERE id = $1 AND shop_id = $2 AND is_block = false FOR UPDATE",
        [req.params.id, req.shopId],
      );
      const appt = apptRes.rows[0];
      if (!appt || !appt.client_id) throw new HttpError(404, { error: "Appointment not found" });
      const apptStatusBefore = appt.status;
      const fail = (code, msg) => {
        throw new HttpError(code, { error: msg });
      };

      const pkgRes = await client.query(
        "SELECT * FROM client_packages WHERE id = $1 AND shop_id = $2 AND client_id = $3 FOR UPDATE",
        [packageId, req.shopId, appt.client_id],
      );
      const pkg = pkgRes.rows[0];
      if (!pkg) fail(404, "Package not found for this client");
      if (pkg.status !== "active") fail(400, "This package is cancelled");
      if (pkg.expires_at && new Date(pkg.expires_at) < new Date()) fail(400, "This package has expired");
      const usedRes = await client.query("SELECT COUNT(*)::int AS n FROM package_usage WHERE client_package_id = $1", [pkg.id]);
      if (usedRes.rows[0].n >= pkg.total_visits) fail(400, "No visits left on this package");

      const lines = await client.query(
        `SELECT COALESCE(price_override, (SELECT price FROM services WHERE id = $2)) AS price
         FROM appointment_services WHERE appointment_id = $1 AND service_id = $2 ORDER BY id`,
        [appt.id, pkg.service_id],
      );
      const already = await client.query(
        "SELECT COUNT(*)::int AS n FROM package_usage WHERE appointment_id = $1 AND service_id = $2",
        [appt.id, pkg.service_id],
      );
      if (already.rows[0].n >= lines.rows.length) {
        fail(400, "This appointment has no uncovered occurrence of that service");
      }
      const amount = Number(lines.rows[already.rows[0].n].price);

      const txn = await client.query(
        `INSERT INTO transactions (appointment_id, client_id, amount, payment_method, transaction_type, shop_id, created_at)
         VALUES ($1, $2, $3, 'package', 'payment', $4, NOW()) RETURNING id`,
        [appt.id, appt.client_id, amount, req.shopId],
      );
      await client.query(
        `INSERT INTO package_usage (client_package_id, appointment_id, service_id, amount, transaction_id, used_at)
         VALUES ($1, $2, $3, $4, $5, NOW())`,
        [pkg.id, appt.id, pkg.service_id, amount, txn.rows[0].id],
      );

      const totals = await client.query(
        `SELECT
           COALESCE((SELECT SUM(price_override) FROM appointment_services WHERE appointment_id = $1), 0)
           + COALESCE((SELECT SUM(total_price) FROM product_sales WHERE appointment_id = $1), 0) AS total_price,
           COALESCE((SELECT SUM(amount) FROM transactions WHERE appointment_id = $1), 0) AS paid`,
        [appt.id],
      );
      const fullyPaid = Number(totals.rows[0].paid) >= Number(totals.rows[0].total_price) - 0.01;
      await client.query(
        `UPDATE appointments
         SET payment_status = $1,
             status = CASE WHEN status = 'completed' THEN 'completed' ELSE $2 END
         WHERE id = $3 AND shop_id = $4`,
        [fullyPaid ? "paid" : "partial", fullyPaid ? "completed" : "confirmed", appt.id, req.shopId],
      );

      const newBalance = await recalculateClientBalance(client, appt.client_id);
      return {
        success: true,
        new_balance: newBalance,
        amount,
        status: apptStatusBefore === "completed" || fullyPaid ? "completed" : "confirmed",
        payment_status: fullyPaid ? "paid" : "partial",
      };
    });
    res.json(result);
  }));

  return router;
};
