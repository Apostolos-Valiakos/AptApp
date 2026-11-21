// The staff bonus: each staff member's bonus and product-commission rules
// (admins), who can be picked as a product's seller (everyone who sells), and
// the report (admins, with the password retyped). The calculation is in
// domain/bonus.js.
const express = require("express");
const { asyncHandler } = require("../http");
const pool = require("../db");
const { bonusReport, ruleOn, commissionOn, targetOn, reviewRuleOn, monthsBetween } = require("../domain/bonus");

const TZ = process.env.TZ || "Europe/Athens";
// A real calendar day: JavaScript would quietly turn 30 Feb into 2 March, so
// the day must read back as written (the database refuses it otherwise).
const isDate = (v) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(v || ""))) return false;
  const d = new Date(`${v}T00:00:00Z`);
  return !isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v;
};
const shopToday = () => new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(new Date());
const BONUS_COLUMNS = `id, staff_id, to_char(effective_from, 'YYYY-MM-DD') AS effective_from, enabled, kind,
  threshold_minutes, percent::float AS percent, amount_per_hour::float AS amount_per_hour`;
// A redemption: a service in the category Εξαργύρωση (see migration 0020).
const IS_REDEMPTION = "(trim(COALESCE(s.category, '')) = 'Εξαργύρωση')";
const COMMISSION_COLUMNS = "id, staff_id, to_char(effective_from, 'YYYY-MM-DD') AS effective_from, enabled, percent::float AS percent";
const TARGET_COLUMNS = "id, staff_id, to_char(effective_from, 'YYYY-MM-DD') AS effective_from, enabled, steps";
const REVIEW_COLUMNS = "id, staff_id, to_char(effective_from, 'YYYY-MM-DD') AS effective_from, enabled, amount_per_review::float AS amount_per_review";
// What a completed service counts for: the price charged; a redemption, the
// price of the service it stands for (stored when booked, else that service's
// price now). Needs services s and bs joined as below.
const SERVICE_VALUE = `(CASE WHEN ${IS_REDEMPTION} THEN COALESCE(aps.bonus_value, bs.price, 0)
                       ELSE COALESCE(aps.price_override, s.price, 0) END)`;
const MAX_STEPS = 10;

module.exports = function bonusRouter({ authenticateToken, requireAnalyticsAccess, requireSensitiveAccess, requireShopAdminAccess, safeUUID }) {
  const router = express.Router();

  const staffInShop = async (req, id) =>
    (await pool.query("SELECT id, capacity FROM staff WHERE id = $1 AND shop_id = $2", [id, req.shopId])).rows[0] || null;
  const listOf = (table, columns) => (req, staffId) =>
    pool
      .query(`SELECT ${columns} FROM ${table} WHERE shop_id = $1 AND staff_id = $2 ORDER BY effective_from DESC`, [req.shopId, staffId])
      .then((r) => r.rows);
  const bonusRules = listOf("staff_bonus_rules", BONUS_COLUMNS);
  const commissionRules = listOf("staff_product_commission_rules", COMMISSION_COLUMNS);
  const targetRules = listOf("staff_target_rules", TARGET_COLUMNS);
  const reviewRules = listOf("staff_review_rules", REVIEW_COLUMNS);

  // GET, POST (one rule from a date on; one already starting that day is
  // replaced) and DELETE for a kind of rule. `parse` checks the body and
  // answers the columns to save, or { error }.
  const ruleRoutes = (path, table, list, current, parse, label) => {
    const member = async (req, res) => {
      const id = safeUUID(req.params.id);
      const found = id && (await staffInShop(req, id));
      if (!found) res.status(404).json({ error: "Not found" });
      return found;
    };
    router.get(`/staff/:id/${path}`, authenticateToken, requireAnalyticsAccess, asyncHandler(async (req, res) => {
      const found = await member(req, res);
      if (!found) return;
      const rules = await list(req, found.id);
      res.json({ rules, current: current(rules, shopToday(), found.capacity), today: shopToday() });
    }, { log: `List ${label} error:` }));

    router.post(`/staff/:id/${path}`, authenticateToken, requireAnalyticsAccess, asyncHandler(async (req, res) => {
      const found = await member(req, res);
      if (!found) return;
      if (!isDate(req.body.effective_from)) return res.status(400).json({ error: "effective_from must be YYYY-MM-DD" });
      const parsed = parse(req.body);
      if (parsed.error) return res.status(400).json({ error: parsed.error });
      const columns = Object.keys(parsed);
      const values = Object.values(parsed);
      await pool.query(
        `INSERT INTO ${table} (shop_id, staff_id, effective_from, enabled, ${columns.join(", ")})
         VALUES ($1, $2, $3, $4, ${columns.map((_, i) => `$${i + 5}`).join(", ")})
         ON CONFLICT (staff_id, effective_from) DO UPDATE
           SET enabled = EXCLUDED.enabled, ${columns.map((c) => `${c} = EXCLUDED.${c}`).join(", ")}`,
        [req.shopId, found.id, req.body.effective_from, req.body.enabled !== false, ...values],
      );
      res.status(201).json({ rules: await list(req, found.id) });
    }, { log: `Save ${label} error:` }));

    router.delete(`/staff/:id/${path}/:ruleId`, authenticateToken, requireAnalyticsAccess, asyncHandler(async (req, res) => {
      const id = safeUUID(req.params.id);
      const ruleId = safeUUID(req.params.ruleId);
      if (!id || !ruleId) return res.status(400).json({ error: "Invalid id" });
      const { rowCount } = await pool.query(`DELETE FROM ${table} WHERE id = $1 AND staff_id = $2 AND shop_id = $3`, [ruleId, id, req.shopId]);
      if (!rowCount) return res.status(404).json({ error: "Not found" });
      res.json({ rules: await list(req, id) });
    }, { log: `Delete ${label} error:` }));
  };

  const parsePercent = (value) => {
    const percent = Number(value);
    return percent >= 0 && percent <= 100 ? Math.round(percent * 100) / 100 : null;
  };

  ruleRoutes("bonus-rules", "staff_bonus_rules", bonusRules, ruleOn, (body) => {
    const kind = body.kind === "per_hour" ? "per_hour" : "percent";
    const threshold = Number(body.threshold_minutes);
    if (!Number.isInteger(threshold) || threshold < 0 || threshold > 1440) return { error: "threshold_minutes must be 0 to 1440" };
    // The kind not chosen keeps a value, ready if the rule is switched back.
    const percent = parsePercent(body.percent ?? 10);
    if (percent === null) return { error: "percent must be 0 to 100" };
    const amount = Number(body.amount_per_hour ?? 0);
    if (!(amount >= 0 && amount <= 1000)) return { error: "amount_per_hour must be 0 to 1000" };
    if (kind === "per_hour" && body.enabled !== false && !(amount > 0)) return { error: "amount_per_hour is required" };
    return { kind, threshold_minutes: threshold, percent, amount_per_hour: Math.round(amount * 100) / 100 };
  }, "bonus rules");

  ruleRoutes("product-commission-rules", "staff_product_commission_rules", commissionRules, (rules, day) => commissionOn(rules, day), (body) => {
    const percent = parsePercent(body.percent ?? 10);
    return percent === null ? { error: "percent must be 0 to 100" } : { percent };
  }, "product commission rules");

  // Steps: up to 10 { target, bonus } with different targets above 0 and a
  // bonus of 0 or more, stored lowest target first. A rule switched on needs one.
  ruleRoutes("target-rules", "staff_target_rules", targetRules, (rules, day) => targetOn(rules, day), (body) => {
    const raw = Array.isArray(body.steps) ? body.steps : [];
    if (raw.length > MAX_STEPS) return { error: `at most ${MAX_STEPS} steps` };
    const steps = [];
    for (const s of raw) {
      const target = Math.round(Number(s?.target) * 100) / 100;
      const bonus = Math.round(Number(s?.bonus) * 100) / 100;
      if (!(target > 0 && target <= 10000000) || !(bonus >= 0 && bonus <= 1000000)) return { error: "each step needs a target above 0 and a bonus of 0 or more" };
      if (steps.some((x) => x.target === target)) return { error: "two steps have the same target" };
      steps.push({ target, bonus });
    }
    if (body.enabled !== false && !steps.length) return { error: "steps are required" };
    steps.sort((a, b) => a.target - b.target);
    return { steps: JSON.stringify(steps) };
  }, "target rules");

  ruleRoutes("review-rules", "staff_review_rules", reviewRules, (rules, day) => reviewRuleOn(rules, day), (body) => {
    const amount = Number(body.amount_per_review ?? 3);
    if (!(amount >= 0 && amount <= 1000)) return { error: "amount_per_review must be 0 to 1000" };
    return { amount_per_review: Math.round(amount * 100) / 100 };
  }, "review rules");

  // The shop's review count on the 1st of a month and at its end (either may
  // be left empty until known). Same access as the report.
  router.put("/reports/bonus/reviews/:month", authenticateToken, requireSensitiveAccess, asyncHandler(async (req, res) => {
    const { month } = req.params;
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) return res.status(400).json({ error: "month must be YYYY-MM" });
    const count = (v) => (v === null || v === undefined || v === "" ? null : Number(v));
    const start = count(req.body.start_count);
    const end = count(req.body.end_count);
    for (const v of [start, end]) {
      if (v !== null && !(Number.isInteger(v) && v >= 0 && v <= 10000000)) return res.status(400).json({ error: "counts must be whole numbers, 0 or more" });
    }
    if (start !== null && end !== null && end < start) return res.status(400).json({ error: "end_count is below start_count" });
    await pool.query(
      `INSERT INTO shop_review_counts (shop_id, month, start_count, end_count) VALUES ($1, $2::date, $3, $4)
       ON CONFLICT (shop_id, month) DO UPDATE SET start_count = EXCLUDED.start_count, end_count = EXCLUDED.end_count, updated_at = NOW()`,
      [req.shopId, `${month}-01`, start, end],
    );
    res.json({ month, start_count: start, end_count: end });
  }, { log: "Save review counts error:" }));

  // Who can be picked as a product's seller: active staff with product
  // commission on today.
  router.get("/product-sellers", authenticateToken, requireShopAdminAccess, asyncHandler(async (req, res) => {
    const { rows } = await pool.query(
      `SELECT st.id, st.name
       FROM staff st
       JOIN LATERAL (
         SELECT r.enabled FROM staff_product_commission_rules r
         WHERE r.staff_id = st.id AND r.effective_from <= $2::date
         ORDER BY r.effective_from DESC LIMIT 1
       ) rule ON rule.enabled
       WHERE st.shop_id = $1 AND st.is_active
       ORDER BY st.sort_order, st.name`,
      [req.shopId, shopToday()],
    );
    res.json(rows);
  }, { log: "List product sellers error:" }));

  // Completed services and products sold from `from` to `to` (shop days, both
  // included). Like the other reports, only a super admin also sees bookings
  // kept off the receipts.
  router.get("/reports/bonus", authenticateToken, requireSensitiveAccess, asyncHandler(async (req, res) => {
    const { from, to } = req.query;
    if (!isDate(from) || !isDate(to)) return res.status(400).json({ error: "from and to must be YYYY-MM-DD" });
    if (from > to) return res.status(400).json({ error: "from is after to" });
    const receiptsOnly = req.user.role === "super_admin" ? "" : "AND COALESCE(a.save_receipt, true)";
    // The monthly bonuses look at whole calendar months, also when the dates
    // cover only part of one.
    const months = monthsBetween(from, to);
    const [staff, rules, commission, services, products, targets, monthSales, reviewRuleRows, reviewCounts] = await Promise.all([
      pool.query("SELECT id, name, capacity FROM staff WHERE shop_id = $1", [req.shopId]),
      pool.query(`SELECT ${BONUS_COLUMNS} FROM staff_bonus_rules WHERE shop_id = $1`, [req.shopId]),
      pool.query(`SELECT ${COMMISSION_COLUMNS} FROM staff_product_commission_rules WHERE shop_id = $1`, [req.shopId]),
      pool.query(
        `SELECT aps.id, aps.staff_id, aps.start_time,
                to_char(aps.start_time AT TIME ZONE '${TZ}', 'YYYY-MM-DD') AS day,
                COALESCE(NULLIF(aps.duration_override, 0), s.duration_minutes, 60) AS minutes,
                -- A redemption counts at the price of the service it stands for:
                -- stored when it was booked, else that service's price now.
                ${SERVICE_VALUE}::float AS price,
                ${IS_REDEMPTION} AS is_redemption,
                s.name AS service_name,
                NULLIF(TRIM(CONCAT_WS(' ', c.first_name, c.last_name)), '') AS client_name
         FROM appointment_services aps
         JOIN appointments a ON a.id = aps.appointment_id
         JOIN services s ON s.id = aps.service_id
         LEFT JOIN services bs ON bs.id = s.bonus_service_id
         LEFT JOIN clients c ON c.id = a.client_id
         WHERE a.shop_id = $1 AND LOWER(a.status) = 'completed' AND NOT COALESCE(a.is_block, false)
           AND aps.staff_id IS NOT NULL
           AND (aps.start_time AT TIME ZONE '${TZ}')::date BETWEEN $2::date AND $3::date
           ${receiptsOnly}`,
        [req.shopId, from, to],
      ),
      // A product counts as soon as it's sold, whatever becomes of its booking
      // (a cancelled booking's products go back into stock and aren't sales).
      pool.query(
        `SELECT ps.id, ps.staff_id, ps.quantity, ps.total_price::float AS total_price, ps.sale_date,
                ps.unit_bulk_price::float AS unit_bulk_price,
                to_char(ps.sale_date AT TIME ZONE '${TZ}', 'YYYY-MM-DD') AS day,
                TRIM(CONCAT_WS(' ', p.name, NULLIF(pi.variation_name, ''))) AS product_name,
                NULLIF(TRIM(CONCAT_WS(' ', c.first_name, c.last_name)), '') AS client_name
         FROM product_sales ps
         LEFT JOIN appointments a ON a.id = ps.appointment_id
         LEFT JOIN product_inventory pi ON pi.id = ps.inventory_id
         LEFT JOIN products p ON p.id = pi.product_id
         LEFT JOIN clients c ON c.id = ps.client_id
         WHERE ps.shop_id = $1 AND ps.staff_id IS NOT NULL
           AND (ps.sale_date AT TIME ZONE '${TZ}')::date BETWEEN $2::date AND $3::date
           ${receiptsOnly}`,
        [req.shopId, from, to],
      ),
      pool.query(`SELECT ${TARGET_COLUMNS} FROM staff_target_rules WHERE shop_id = $1`, [req.shopId]),
      pool.query(
        `SELECT aps.staff_id, to_char(aps.start_time AT TIME ZONE '${TZ}', 'YYYY-MM') AS month, SUM(${SERVICE_VALUE})::float AS total
         FROM appointment_services aps
         JOIN appointments a ON a.id = aps.appointment_id
         JOIN services s ON s.id = aps.service_id
         LEFT JOIN services bs ON bs.id = s.bonus_service_id
         WHERE a.shop_id = $1 AND LOWER(a.status) = 'completed' AND NOT COALESCE(a.is_block, false)
           AND aps.staff_id IS NOT NULL
           AND (aps.start_time AT TIME ZONE '${TZ}')::date BETWEEN $2::date AND $3::date
           ${receiptsOnly}
         GROUP BY 1, 2`,
        [req.shopId, months[0].first, months[months.length - 1].last],
      ),
      pool.query(`SELECT ${REVIEW_COLUMNS} FROM staff_review_rules WHERE shop_id = $1`, [req.shopId]),
      pool.query(
        `SELECT to_char(month, 'YYYY-MM') AS month, start_count, end_count FROM shop_review_counts
         WHERE shop_id = $1 AND month BETWEEN $2::date AND $3::date`,
        [req.shopId, months[0].first, months[months.length - 1].first],
      ),
    ]);
    const counts = new Map(reviewCounts.rows.map((c) => [c.month, c]));
    res.json({
      from,
      to,
      // Each month's review counts, for the fields on the Bonus page.
      review_months: months.map((m) => ({
        month: m.month,
        start_count: counts.get(m.month)?.start_count ?? null,
        end_count: counts.get(m.month)?.end_count ?? null,
      })),
      ...bonusReport({
        staff: staff.rows,
        rules: rules.rows,
        commissionRules: commission.rows,
        services: services.rows,
        products: products.rows,
        months,
        targetRules: targets.rows,
        monthSales: monthSales.rows,
        reviewRules: reviewRuleRows.rows,
        reviewCounts: reviewCounts.rows,
      }),
    });
  }, { log: "Bonus report error:" }));

  return router;
};
