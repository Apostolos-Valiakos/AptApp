// Making and changing bookings: series, edits, and the checks around them
// (staff availability, discounts, self-booking, overlaps, places, versions).
const crypto = require("crypto");
const { applyDiscount } = require("../discounts");
const { safeUUID } = require("./common");
const { recalculateClientBalance } = require("./balances");
const { releasePackageUsage } = require("./packages");

const addRecurrenceInterval = (date, freq) => {
  const result = new Date(date);
  if (freq === "Daily") result.setDate(result.getDate() + 1);
  if (freq === "Weekly") result.setDate(result.getDate() + 7);
  if (freq === "Bi-Weekly") result.setDate(result.getDate() + 14);
  if (freq === "Monthly") result.setMonth(result.getMonth() + 1);
  return result;
};

// Thrown by assertStaffAvailable below — an unconditional, no-override
// rejection (distinct from the conflicts_found/force pattern used when
// SAVING new time-off/working-hours over existing appointments).
class StaffUnavailableError extends Error {
  constructor(reason, staffId) {
    super("staff_unavailable");
    this.reason = reason; // "time_off" | "outside_working_hours"
    this.staffId = staffId;
  }
}

// A staff member is required on every service block (each one needs to land
// on a specific person's calendar column) — doesn't apply to time-off
// blocks, which never get appointment_services rows at all.
class MissingStaffError extends Error {
  constructor() {
    super("staff_required");
  }
}

const assertServicesHaveStaff = (services, isBlock) => {
  if (isBlock) return;
  const missing = (services || []).some(
    (svc) => safeUUID(svc.service_id) && !safeUUID(svc.staff_id),
  );
  if (missing) throw new MissingStaffError();
};

// Hard-blocks booking a staff member during their leave/break (staff_time_off)
// or, if they've opted into a configured schedule, outside their weekly
// working hours (staff_working_hours). Staff who never configured working
// hours (working_hours_enabled = false, the default) are unrestricted by that
// second check — only time-off applies to them, exactly as it always has.
// Uses the same timestamptz -> date/time cast convention as the existing
// (pre-existing, working) time-off conflict-check query for consistency.
// allowOvertime (admin, super admin and frontdesk, after confirming in the
// app) skips only the working-hours part: leave and breaks still block.
const assertStaffAvailable = async (client, { staffId, shopId, startTime, durationMinutes, allowOvertime = false }) => {
  if (!staffId) return;
  // Deliberately unconditional, regardless of staff_working_hours now having
  // effective-dated versions: editing an unrelated field on a past
  // appointment (recording a payment, marking a no-show) must never start
  // failing just because a staff member's schedule has since changed, since
  // every save re-validates staffId/start_time/duration whether or not the
  // time itself is being touched. Only future/current-moment bookings need
  // to respect the live schedule.
  if (new Date(startTime).getTime() < Date.now()) return;
  const duration = durationMinutes || 60;

  const timeOff = await client.query(
    `SELECT 1 FROM staff_time_off
     WHERE staff_id = $1 AND shop_id = $2
       AND (
         (type = 'leave' AND $3::timestamptz::date BETWEEN start_date AND end_date)
         OR (type = 'break' AND $3::timestamptz::date = start_date
             AND $3::timestamptz < (start_date + end_time)
             AND ($3::timestamptz + ($4 || ' minutes')::interval) > (start_date + start_time))
       )
     LIMIT 1`,
    [staffId, shopId, startTime, duration],
  );
  if (timeOff.rows.length > 0) throw new StaffUnavailableError("time_off", staffId);
  if (allowOvertime) return;

  const staffRow = await client.query(
    `SELECT working_hours_enabled FROM staff WHERE id = $1 AND shop_id = $2`,
    [staffId, shopId],
  );
  if (!staffRow.rows[0]?.working_hours_enabled) return;

  // Version-scoped: resolves whichever schedule was/will be active as of this
  // appointment's own date, not necessarily "today's" pattern — a booking for
  // a date on/after a staged future version's effective_from must be checked
  // against THAT version, since by then it's the one actually governing.
  //
  // Two queries, not one: if no version can be resolved at all for this date
  // (e.g. working_hours_enabled was just turned on with only a staged FUTURE
  // version and no "current" one yet, leaving a gap before it), MAX(...)
  // returns NULL, and "effective_from = NULL" would never match any row in a
  // single combined query — silently blocking the booking instead of failing
  // open. Resolving the version first makes "no data for this date" explicit.
  const versionRow = await client.query(
    `SELECT MAX(effective_from) AS latest FROM staff_working_hours
     WHERE staff_id = $1 AND effective_from <= $2::timestamptz::date`,
    [staffId, startTime],
  );
  const latestVersion = versionRow.rows[0]?.latest;
  if (!latestVersion) return; // no schedule data as of this date — fail open

  const fits = await client.query(
    `SELECT 1 FROM staff_working_hours
     WHERE staff_id = $1 AND effective_from = $2
       AND day_of_week = EXTRACT(DOW FROM $3::timestamptz)
       AND $3::timestamptz::time >= start_time
       AND ($3::timestamptz + ($4 || ' minutes')::interval)::time <= end_time
       AND ($3::timestamptz + ($4 || ' minutes')::interval)::date = $3::timestamptz::date
     LIMIT 1`,
    [staffId, latestVersion, startTime, duration],
  );
  if (fits.rows.length === 0) throw new StaffUnavailableError("outside_working_hours", staffId);
};

const getGroupDetails = async (client, id, shopId) => {
  const res = await client.query(
    "SELECT group_id, (SELECT start_time FROM appointment_services WHERE appointment_id = appointments.id LIMIT 1) as start_time FROM appointments WHERE id = $1 AND shop_id = $2",
    [id, shopId],
  );
  return res.rows[0];
};

// --- HELPER: Discounts ---
class DiscountError extends Error {
  constructor(reason) {
    super("invalid_discount");
    this.reason = reason;
  }
}

// Validates the discount fields on a booking body (flat discount_* fields, same
// names the GET returns so drag/resize round-trips preserve them). Codes are
// looked up server-side; an appointment that already carries a code keeps its
// stored percentage even if the code was later edited, deactivated or deleted.
const resolveDiscount = async (client, shopId, body, existing = null) => {
  const type = body.discount_type;
  if (!["fixed", "percent", "code"].includes(type)) return null;
  const scope = ["services", "products", "total"].includes(body.discount_scope)
    ? body.discount_scope
    : "services";
  let value = Number(body.discount_value);
  let codeId = null;
  let codeName = null;

  if (type === "code") {
    codeId = safeUUID(body.discount_code_id);
    const keepsExisting =
      existing?.discount_type === "code" &&
      (!codeId || existing.discount_code_id === codeId);
    if (keepsExisting) {
      value = Number(existing.discount_value);
      codeId = existing.discount_code_id;
      codeName = existing.discount_code_name;
    } else {
      if (!codeId) throw new DiscountError("code_required");
      const codeRes = await client.query(
        "SELECT name, percentage FROM discount_codes WHERE id = $1 AND shop_id = $2 AND is_active = true",
        [codeId, shopId],
      );
      if (!codeRes.rows[0]) throw new DiscountError("code_not_found");
      value = Number(codeRes.rows[0].percentage);
      codeName = codeRes.rows[0].name;
    }
  }
  if (!(value > 0)) return null;
  if (type !== "fixed" && value > 100) throw new DiscountError("percent_too_high");
  return { type, value, scope, codeId, codeName };
};

// --- HELPER: Create Appointment Series ---
const createAppointmentSeries = async (client, data, shopId) => {
  const {
    client_id,
    status = "new",
    internal_notes,
    booking_notes,
    deposit_amount,
    payment_status,
    is_block,
    save_receipt = false,
    is_eoppy = false,
    services = [],
    products = [],
    recurrence,
    group_id_override,
    instance_starts,
    allow_unavailable,
    allow_overtime,
    booked_at,
  } = data;

  assertServicesHaveStaff(services, is_block);
  // When it was booked: now, or when it was made offline (sent by the sync
  // queue) if that's a sensible past moment.
  const bookedAt = (() => {
    const d = booked_at ? new Date(booked_at) : null;
    return d && !Number.isNaN(d.getTime()) && d <= new Date() && d > new Date(Date.now() - 60 * 86400000) ? d.toISOString() : null;
  })();

  const crypto = require("crypto");
  const groupId =
    group_id_override || (recurrence ? crypto.randomUUID() : null);
  const recurrenceRule = recurrence ? JSON.stringify(recurrence) : null;
  const validClientId = safeUUID(client_id);
  const discountInput = is_block
    ? null
    : await resolveDiscount(client, shopId, data);

  const hasExplicitStarts = Array.isArray(instance_starts) && instance_starts.length > 0;
  let datesToBook = hasExplicitStarts
    ? instance_starts.map((s) => new Date(s))
    : [new Date(services[0]?.start_time || new Date())];

  if (!hasExplicitStarts && recurrence && recurrence.end_date) {
    let nextDate = addRecurrenceInterval(datesToBook[0], recurrence.freq);
    const endDate = new Date(recurrence.end_date);

    // Safety Limit: Max 52 appointments
    while (nextDate <= endDate && datesToBook.length < 52) {
      datesToBook.push(new Date(nextDate));
      nextDate = addRecurrenceInterval(nextDate, recurrence.freq);
    }
  }

  let firstAppointmentId = null;

  // === DUPLICATE CHECK (batched) ===
  // A recurring series can book up to 52 dates; checking one-by-one meant up
  // to 52 sequential round-trips just to look for collisions. staffId is the
  // same for every instance (services[0].staff_id doesn't vary per date), so
  // fetch this client+staff's existing start times once and check in memory.
  const seriesStaffId = services[0]?.staff_id;
  let existingStartTimes = null;
  if (!is_block && validClientId && seriesStaffId) {
    const existingRes = await client.query(
      `SELECT aps.start_time, a.id
       FROM appointments a
       JOIN appointment_services aps ON a.id = aps.appointment_id
       WHERE a.shop_id = $1
         AND a.client_id = $2
         AND aps.staff_id = $3
         AND a.status != 'cancelled'`,
      [shopId, validClientId, seriesStaffId],
    );
    existingStartTimes = new Map(
      existingRes.rows.map((r) => [new Date(r.start_time).toISOString(), r.id]),
    );
  }

  for (let i = 0; i < datesToBook.length; i++) {
    const currentDate = datesToBook[i];
    const isFirstInstance = i === 0;

    // Calculate the start time for this instance to check for collisions
    const originalStart = new Date(services[0]?.start_time);
    const instanceStart = new Date(currentDate);
    if (!hasExplicitStarts) {
      instanceStart.setHours(
        originalStart.getHours(),
        originalStart.getMinutes(),
        0,
        0,
      );
    }
    const instanceStartIso = instanceStart.toISOString();

    // === DUPLICATE CHECK ===
    if (
      !is_block &&
      validClientId &&
      existingStartTimes?.has(instanceStartIso)
    ) {
      // Already booked: the answer points at that booking, so a caller
      // linking follow-ups to the new id (the offline sync queue) still can.
      if (isFirstInstance) firstAppointmentId = existingStartTimes.get(instanceStartIso);
      continue;
    }

    const currentEoppyStatus = !!is_eoppy;
    const disc = discountInput
      ? applyDiscount(discountInput, services, products, {
          includeProducts: isFirstInstance,
        })
      : null;
    const instanceServices = disc ? disc.services : services;

    const instanceDeposit = isFirstInstance ? deposit_amount || 0 : 0;
    const instancePaymentStatus = isFirstInstance
      ? payment_status || "unpaid"
      : "unpaid";

    const apptRes = await client.query(
      `INSERT INTO appointments (
        client_id, status, internal_notes, booking_notes, 
        deposit_amount, payment_status, is_block, save_receipt, is_eoppy,
        shop_id, created_at, updated_at,
        group_id, recurrence,
        discount_type, discount_value, discount_scope, discount_code_id,
        discount_code_name, discount_amount, booked_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW(), NOW(), $11, $12,
        $13, $14, $15, $16, $17, $18, COALESCE($19::timestamptz, NOW())) 
      RETURNING id`,
      [
        is_block ? null : validClientId,
        status,
        internal_notes,
        booking_notes,
        instanceDeposit,
        instancePaymentStatus,
        !!is_block,
        !!save_receipt,
        currentEoppyStatus,
        shopId,
        groupId,
        recurrenceRule,
        disc ? discountInput.type : null,
        disc ? discountInput.value : null,
        disc ? discountInput.scope : null,
        disc ? discountInput.codeId : null,
        disc ? discountInput.codeName : null,
        disc ? disc.discountAmount : 0,
        bookedAt,
      ],
    );
    const appointmentId = apptRes.rows[0].id;
    if (isFirstInstance) firstAppointmentId = appointmentId;

    if (!is_block) {
      for (const svc of instanceServices) {
        const validServiceId = safeUUID(svc.service_id);
        const validStaffId = safeUUID(svc.staff_id);

        // Multi-service bookings (e.g. a combo split into a therapeutic +
        // sauna block) have each service at its own start_time, laid out
        // sequentially by the client. Preserve that offset from services[0]
        // rather than collapsing every block onto the same instanceStartIso.
        const svcOffsetMs =
          new Date(svc.start_time).getTime() - originalStart.getTime();
        const svcInstanceStartIso = new Date(
          instanceStart.getTime() + svcOffsetMs,
        ).toISOString();

        if (!allow_unavailable) {
          await assertStaffAvailable(client, {
            staffId: validStaffId,
            shopId,
            startTime: svcInstanceStartIso,
            durationMinutes: svc.duration_override,
            allowOvertime: !!allow_overtime,
          });
        }

        if (validServiceId) {
          await client.query(
            `INSERT INTO appointment_services (
              appointment_id, service_id, staff_id, start_time,
              duration_override, price_override, shop_id, list_price, variation_name, persons
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
            [
              appointmentId,
              validServiceId,
              validStaffId,
              svcInstanceStartIso,
              svc.duration_override,
              svc.price_override,
              shopId,
              disc ? svc.list_price : null,
              svc.variation_name || null,
              personsOf(svc),
            ],
          );
        }
      }

      // Products logic remains the same (usually only for first instance)
      if (isFirstInstance && products && products.length > 0) {
        // ... existing product logic ...
        for (const [prodIdx, prod] of products.entries()) {
          if (prod.product_id) {
            const unitPrice = Number(prod.price || 0);
            const qty = Number(prod.quantity || 1);
            const lineTotal = disc
              ? disc.productLineTotals[prodIdx]
              : unitPrice * qty;

            await client.query(
              `INSERT INTO product_sales (
                    appointment_id, inventory_id, staff_id, client_id,
                    quantity, total_price, shop_id, sale_date, list_total
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), $8)`,
              [
                appointmentId,
                prod.product_id,
                services[0]?.staff_id || null,
                validClientId,
                qty,
                lineTotal,
                shopId,
                disc ? unitPrice * qty : null,
              ],
            );
            await client.query(
              `UPDATE product_inventory SET stock_quantity = GREATEST(0, stock_quantity - $1) WHERE id = $2`,
              [qty, prod.product_id],
            );
          }
        }
      }
    }
  }
  return { firstAppointmentId, validClientId };
};

// --- HELPER: Perform Single Update ---
const performSingleUpdate = async (client, id, shopId, body) => {
  const {
    client_id,
    status,
    internal_notes,
    booking_notes,
    deposit_amount,
    payment_status,
    is_block,
    save_receipt,
    is_eoppy,
    services = [],
    products = [],
    allow_overtime,
  } = body;

  assertServicesHaveStaff(services, is_block);

  const validClientId = safeUUID(client_id);

  const existingDiscountRes = await client.query(
    `SELECT discount_type, discount_value, discount_code_id, discount_code_name, client_id AS old_client_id
     FROM appointments WHERE id = $1 AND shop_id = $2`,
    [id, shopId],
  );
  const existingRow = existingDiscountRes.rows[0] || null;
  const oldClientId = existingRow?.old_client_id || null;
  // Reassigning an appointment to a different client (e.g. attributing a
  // walk-in booking to the real client after the fact) moves its money with
  // it — otherwise the payment stays recorded under whoever was picked
  // first, and neither client's balance/history is accurate afterward.
  const clientIsChanging =
    !is_block && oldClientId && validClientId && oldClientId !== validClientId;
  if (clientIsChanging) {
    await client.query(
      "UPDATE transactions SET client_id = $1 WHERE appointment_id = $2",
      [validClientId, id],
    );
    await client.query(
      "UPDATE product_sales SET client_id = $1 WHERE appointment_id = $2",
      [validClientId, id],
    );
    // The caller recalculates the new client's balance after this function
    // returns; the old client's balance needs it too, now that this
    // appointment's money no longer belongs to them.
    await recalculateClientBalance(client, oldClientId);
  }
  const discountInput = is_block
    ? null
    : await resolveDiscount(client, shopId, body, existingRow);
  const disc = discountInput
    ? applyDiscount(discountInput, services, products)
    : null;
  const finalServices = disc ? disc.services : services;
  if (status === "cancelled") await releasePackageUsage(client, [id]);

  await client.query(
    `UPDATE appointments SET
      client_id = $1, status = $2, internal_notes = $3, booking_notes = $4, 
      deposit_amount = $5, payment_status = $6, is_block = $7, save_receipt = $8,is_eoppy = $9, updated_at = NOW(),
      discount_type = $12, discount_value = $13, discount_scope = $14,
      discount_code_id = $15, discount_code_name = $16, discount_amount = $17
    WHERE id = $10 AND shop_id = $11`,
    [
      is_block ? null : validClientId,
      status,
      internal_notes,
      booking_notes,
      deposit_amount || 0,
      payment_status || "unpaid",
      is_block,
      save_receipt || false,
      !!is_eoppy,
      id,
      shopId,
      disc ? discountInput.type : null,
      disc ? discountInput.value : null,
      disc ? discountInput.scope : null,
      disc ? discountInput.codeId : null,
      disc ? discountInput.codeName : null,
      disc ? disc.discountAmount : 0,
    ],
  );

  await client.query(
    "DELETE FROM appointment_services WHERE appointment_id = $1",
    [id],
  );
  if (!is_block) {
    for (const svc of finalServices) {
      await assertStaffAvailable(client, {
        staffId: safeUUID(svc.staff_id),
        shopId,
        startTime: svc.start_time,
        durationMinutes: svc.duration_override,
        allowOvertime: !!allow_overtime,
      });
      if (safeUUID(svc.service_id)) {
        await client.query(
          `INSERT INTO appointment_services (
            appointment_id, service_id, staff_id, start_time, duration_override, price_override, shop_id, list_price, variation_name, persons
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
          [
            id,
            safeUUID(svc.service_id),
            safeUUID(svc.staff_id),
            svc.start_time,
            svc.duration_override,
            svc.price_override,
            shopId,
            disc ? svc.list_price : null,
            svc.variation_name || null,
            personsOf(svc),
          ],
        );
      }
    }
  }

  // Restore stock for the sales being removed, then delete and re-insert
  await client.query(
    `UPDATE product_inventory pi
     SET stock_quantity = pi.stock_quantity + ps.quantity
     FROM product_sales ps
     WHERE ps.inventory_id = pi.id AND ps.appointment_id = $1`,
    [id],
  );
  await client.query("DELETE FROM product_sales WHERE appointment_id = $1", [
    id,
  ]);
  // Cancelled appointments keep no product sales — stock stays restored
  if (!is_block && status !== "cancelled" && products.length > 0) {
    for (const [prodIdx, prod] of products.entries()) {
      if (prod.product_id) {
        const unitPrice = Number(prod.price || 0);
        const qty = Number(prod.quantity || 1);
        await client.query(
          `INSERT INTO product_sales (
            appointment_id, inventory_id, staff_id, client_id, quantity, total_price, shop_id, sale_date, list_total
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), $8)`,
          [
            id,
            prod.product_id,
            services[0]?.staff_id || null,
            validClientId,
            qty,
            disc ? disc.productLineTotals[prodIdx] : unitPrice * qty,
            shopId,
            disc ? unitPrice * qty : null,
          ],
        );
        await client.query(
          `UPDATE product_inventory SET stock_quantity = GREATEST(0, stock_quantity - $1) WHERE id = $2`,
          [qty, prod.product_id],
        );
      }
    }
  }
};

// --- HELPER: Sanitize a client's self-booking submission ---
// A client-role POST to /api/v1/appointments must never be trusted with the
// same payload shape staff/admin get. This rebuilds a minimal, safe payload
// from scratch: price/duration are re-derived from the services table (never
// trusted from the client), staff eligibility is re-checked server-side, and
// every staff/admin-only field (notes, deposit, payment, products, recurrence,
// block bookings) is forced to a safe default regardless of what was submitted.
class SelfBookingNotAllowedError extends Error {
  constructor(reason) {
    super("self_booking_not_allowed");
    this.reason = reason;
  }
}

const sanitizeClientBookingPayload = async (client, rawBody, shopId, clientId) => {
  const shopRes = await client.query(
    "SELECT self_booking_enabled FROM shops WHERE id = $1",
    [shopId],
  );
  if (!shopRes.rows[0]?.self_booking_enabled) {
    throw new SelfBookingNotAllowedError("self_booking_disabled");
  }

  const serviceId = safeUUID(rawBody.services?.[0]?.service_id);
  const staffId = safeUUID(rawBody.services?.[0]?.staff_id);
  const startTime = rawBody.services?.[0]?.start_time;
  if (!serviceId || !staffId || !startTime) {
    throw new SelfBookingNotAllowedError("missing_fields");
  }

  const serviceRes = await client.query(
    `SELECT id, price, duration_minutes FROM services
     WHERE id = $1 AND shop_id = $2 AND is_active = true AND bookable_online = true`,
    [serviceId, shopId],
  );
  const service = serviceRes.rows[0];
  if (!service) {
    throw new SelfBookingNotAllowedError("service_not_bookable");
  }

  const staffRes = await client.query(
    "SELECT id FROM staff WHERE id = $1 AND shop_id = $2 AND is_active = true",
    [staffId, shopId],
  );
  if (!staffRes.rows[0]) {
    throw new SelfBookingNotAllowedError("staff_not_available");
  }

  // Empty mapping in staff_services means "eligible for every service" — the
  // same convention already used for the staff/admin booking picker.
  const eligibilityRes = await client.query(
    "SELECT 1 FROM staff_services WHERE staff_id = $1",
    [staffId],
  );
  if (eligibilityRes.rows.length > 0) {
    const matchRes = await client.query(
      "SELECT 1 FROM staff_services WHERE staff_id = $1 AND service_id = $2",
      [staffId, serviceId],
    );
    if (!matchRes.rows[0]) {
      throw new SelfBookingNotAllowedError("staff_not_eligible");
    }
  }

  return {
    client_id: clientId,
    status: "new",
    internal_notes: null,
    booking_notes:
      typeof rawBody.booking_notes === "string"
        ? rawBody.booking_notes.slice(0, 500)
        : null,
    deposit_amount: 0,
    payment_status: "unpaid",
    is_block: false,
    save_receipt: true,
    is_eoppy: false,
    services: [
      {
        service_id: serviceId,
        staff_id: staffId,
        start_time: startTime,
        duration_override: service.duration_minutes,
        price_override: service.price,
      },
    ],
    products: [],
    recurrence: null,
    group_id_override: null,
  };
};

// --- Offline sync conflict checks -----------------------------------------
// A booking saved offline (replayed later by the browser's sync queue)
// carries offline_known_overlaps: the appointments it overlapped on the
// device's calendar at save time — overlaps staff saw and accepted. Any OTHER
// appointment now overlapping the same staff and time was booked online in
// the meantime, so the write is refused as slot_taken for staff to resolve,
// unless sent again with force: true ("keep mine").
class OfflineConflictError extends Error {
  constructor(code, details) {
    super(code);
    this.code = code;
    this.details = details;
  }
}

// Staff with more than one place at a time (staff.capacity, e.g. the sauna):
// their id → { name, capacity }, for the staff in `services`.
const sharedPlacesFor = async (client, shopId, services) => {
  const ids = [...new Set((services || []).map((s) => safeUUID(s.staff_id)).filter(Boolean))];
  if (ids.length === 0) return new Map();
  const { rows } = await client.query(
    "SELECT id, name, capacity FROM staff WHERE shop_id = $1 AND id = ANY($2::uuid[]) AND capacity > 1",
    [shopId, ids],
  );
  return new Map(rows.map((r) => [String(r.id), { name: r.name, capacity: Number(r.capacity) }]));
};

const personsOf = (svc) => Math.max(1, parseInt(svc?.persons, 10) || 1);

const rowMinutes = (svc) => Number(svc.duration_override || svc.duration_minutes) || 60;

// The most persons present at one moment within [start, end), from rows
// { start, end, persons } (ms).
const peakPersons = (rows, start, end) => {
  const points = [];
  for (const r of rows) {
    const from = Math.max(r.start, start);
    const to = Math.min(r.end, end);
    if (from < to) points.push([from, r.persons], [to, -r.persons]);
  }
  // At the same moment, someone leaving frees the place before the next one comes.
  points.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  let now = 0;
  let peak = 0;
  for (const [, change] of points) {
    now += change;
    peak = Math.max(peak, now);
  }
  return peak;
};

// A booking that would put more persons in a shared place (the sauna, the
// hammam) at once than it has places is refused as over_capacity, so the
// screen can warn first; sent again with allow_over_capacity (or force, the
// offline "keep mine") it goes through. Only new or changed rows count, so
// editing something else on a booking that is already over doesn't ask again.
const assertCapacity = async (client, shopId, body, ownAppointmentId = null) => {
  if (body.allow_over_capacity || body.force || body.is_block) return;
  const services = (body.services || []).filter((s) => safeUUID(s.staff_id) && s.start_time);
  const places = await sharedPlacesFor(client, shopId, services);
  if (places.size === 0) return;

  const keyOf = (staffId, startMs, minutes, persons) => `${staffId}|${startMs}|${minutes}|${persons}`;
  const unchanged = new Map();
  if (ownAppointmentId) {
    const { rows } = await client.query(
      `SELECT aps.staff_id, aps.start_time, COALESCE(aps.duration_override, s.duration_minutes, 60) AS minutes, aps.persons
       FROM appointment_services aps LEFT JOIN services s ON s.id = aps.service_id
       WHERE aps.appointment_id = $1`,
      [ownAppointmentId],
    );
    for (const r of rows) {
      const key = keyOf(String(r.staff_id), new Date(r.start_time).getTime(), Number(r.minutes), Number(r.persons));
      unchanged.set(key, (unchanged.get(key) || 0) + 1);
    }
  }

  for (const svc of services) {
    const staffId = safeUUID(svc.staff_id);
    const place = places.get(String(staffId));
    if (!place) continue;
    const start = new Date(svc.start_time).getTime();
    const end = start + rowMinutes(svc) * 60000;
    const persons = personsOf(svc);
    const key = keyOf(String(staffId), start, rowMinutes(svc), persons);
    if (unchanged.get(key) > 0) {
      unchanged.set(key, unchanged.get(key) - 1);
      continue;
    }
    const { rows } = await client.query(
      `SELECT aps.start_time, COALESCE(aps.duration_override, s.duration_minutes, 60) AS minutes, aps.persons
       FROM appointment_services aps
       JOIN appointments a ON a.id = aps.appointment_id
       LEFT JOIN services s ON s.id = aps.service_id
       WHERE a.shop_id = $1 AND aps.staff_id = $2
         AND a.status NOT IN ('cancelled', 'no-show', 'no_show')
         AND ($3::uuid IS NULL OR a.id <> $3::uuid)
         AND aps.start_time < to_timestamp($5 / 1000.0)
         AND aps.start_time + (COALESCE(aps.duration_override, s.duration_minutes, 60) || ' minutes')::interval > to_timestamp($4 / 1000.0)`,
      [shopId, staffId, ownAppointmentId, start, end],
    );
    const others = rows.map((r) => {
      const from = new Date(r.start_time).getTime();
      return { start: from, end: from + Number(r.minutes) * 60000, persons: Number(r.persons) || 1 };
    });
    // The booking's own other rows in the same place count too.
    for (const other of services) {
      if (other === svc || String(safeUUID(other.staff_id)) !== String(staffId)) continue;
      const from = new Date(other.start_time).getTime();
      others.push({ start: from, end: from + rowMinutes(other) * 60000, persons: personsOf(other) });
    }
    const total = peakPersons(others, start, end) + persons;
    if (total > place.capacity) {
      throw new OfflineConflictError("over_capacity", {
        staff_id: staffId,
        staff_name: place.name,
        capacity: place.capacity,
        persons: total,
        start_time: new Date(start).toISOString(),
        end_time: new Date(end).toISOString(),
      });
    }
  }
};

const assertNoNewOverlaps = async (client, shopId, body, ownAppointmentId = null) => {
  if (!Array.isArray(body.offline_known_overlaps) || body.force || body.is_block) return;
  const known = body.offline_known_overlaps.filter((x) => safeUUID(String(x)));
  // Overlaps are normal in a shared place; assertCapacity covers those.
  const places = await sharedPlacesFor(client, shopId, body.services);
  for (const svc of body.services || []) {
    const staffId = safeUUID(svc.staff_id);
    if (!staffId || !svc.start_time || places.has(String(staffId))) continue;
    const minutes = Number(svc.duration_override || svc.duration_minutes) || 60;
    const { rows } = await client.query(
      `SELECT DISTINCT a.id AS appointment_id, aps.start_time,
              TRIM(COALESCE(c.first_name, '') || ' ' || COALESCE(c.last_name, '')) AS client_name
       FROM appointment_services aps
       JOIN appointments a ON a.id = aps.appointment_id
       LEFT JOIN clients c ON c.id = a.client_id
       LEFT JOIN services s ON s.id = aps.service_id
       WHERE a.shop_id = $1 AND aps.staff_id = $2
         AND a.status NOT IN ('cancelled', 'no-show', 'no_show')
         AND ($3::uuid IS NULL OR a.id <> $3::uuid)
         AND NOT (a.id = ANY($4::uuid[]))
         AND aps.start_time < ($5::timestamptz + ($6 || ' minutes')::interval)
         AND (aps.start_time + (COALESCE(aps.duration_override, s.duration_minutes, 60) || ' minutes')::interval) > $5::timestamptz`,
      [shopId, staffId, ownAppointmentId, known, svc.start_time, minutes],
    );
    if (rows.length > 0) throw new OfflineConflictError("slot_taken", { staff_id: staffId, conflicts: rows });
  }
};

// An edit carries base_version: the appointment version it was made from. If
// the appointment changed since (another device, or online while this one was
// offline), the edit is refused as stale_appointment instead of silently
// overwriting the newer changes — unless sent again with force: true.
const assertBaseVersion = async (client, shopId, appointmentId, body) => {
  if (body.base_version === undefined || body.base_version === null || body.force) return;
  const { rows } = await client.query(
    "SELECT version FROM appointments WHERE id = $1 AND shop_id = $2 FOR UPDATE",
    [appointmentId, shopId],
  );
  if (!rows[0]) throw new OfflineConflictError("appointment_missing", {});
  if (Number(rows[0].version) !== Number(body.base_version)) {
    throw new OfflineConflictError("stale_appointment", { current_version: Number(rows[0].version) });
  }
};

module.exports = {
  addRecurrenceInterval,
  StaffUnavailableError,
  MissingStaffError,
  assertServicesHaveStaff,
  assertStaffAvailable,
  getGroupDetails,
  DiscountError,
  resolveDiscount,
  createAppointmentSeries,
  performSingleUpdate,
  SelfBookingNotAllowedError,
  sanitizeClientBookingPayload,
  OfflineConflictError,
  sharedPlacesFor,
  personsOf,
  rowMinutes,
  peakPersons,
  assertCapacity,
  assertNoNewOverlaps,
  assertBaseVersion,
};
