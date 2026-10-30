// Reports and financials: /api/v1/reports, /financials.
// Moved out of server.js; helpers that still live there are handed over when
// it mounts this router (see "Area routers" near the end of server.js).
const express = require("express");
const { asyncHandler } = require("../http");
const pool = require("../db");

module.exports = function reportsRouter({
  authenticateToken,
  getVisibilityClause,
  notForClients,
  requireAnalyticsAccess,
}) {
  const router = express.Router();

  // --- REVENUE EXCLUSION HELPERS (Ctrl+1 hides cash + gift-cards that were themselves
  // bought with cash, Ctrl+8 hides card — independent toggles). A gift-card payment is
  // only cash-equivalent if the card's own purchase_payment_method was cash; a card- or
  // bank-transfer-funded gift card is left alone.
  //
  // payment_method = 'membership' is excluded UNCONDITIONALLY, regardless of the
  // Ctrl+1/Ctrl+8 toggles — this isn't a privacy setting, it's correctness: a
  // membership-covered visit isn't new revenue, the money was already recognized
  // as a 'membership_sale' transaction when the client bought/renewed the plan
  // (that transaction uses a real payment_method like cash/card, so it's counted
  // normally and is unaffected by this exclusion).
  const buildRevenueExclusionClause = (excludeCash, excludeCard, alias = "a") => {
    const conditions = [`_t.payment_method IN ('membership', 'package', 'write-off')`];
    if (excludeCash === "true") {
      conditions.push(`_t.payment_method = 'cash'`);
      conditions.push(
        `(_t.payment_method = 'gift-card' AND EXISTS (SELECT 1 FROM gift_cards _gc WHERE _gc.id = _t.gift_card_id AND _gc.purchase_payment_method = 'cash'))`,
      );
    }
    if (excludeCard === "true") conditions.push(`_t.payment_method = 'card'`);
    return `AND NOT (${alias}.payment_status = 'paid' AND EXISTS (SELECT 1 FROM transactions _t WHERE _t.appointment_id = ${alias}.id AND (${conditions.join(" OR ")})))`;
  };

  const buildTxnMethodExclusionClause = (excludeCash, excludeCard, columnPrefix = "") => {
    const conditions = [`${columnPrefix}payment_method IN ('membership', 'package', 'write-off')`];
    if (excludeCash === "true") {
      conditions.push(`${columnPrefix}payment_method = 'cash'`);
      conditions.push(
        `(${columnPrefix}payment_method = 'gift-card' AND EXISTS (SELECT 1 FROM gift_cards _gc WHERE _gc.id = ${columnPrefix}gift_card_id AND _gc.purchase_payment_method = 'cash'))`,
      );
    }
    if (excludeCard === "true") conditions.push(`${columnPrefix}payment_method = 'card'`);
    return `AND NOT (${conditions.join(" OR ")})`;
  };

  router.get(
    "/reports/product-usage",
    authenticateToken,
    requireAnalyticsAccess,
    asyncHandler(async (req, res) => {
      // Matches every other /api/v1/reports/* endpoint's from/to query-param
      // convention (see FinancialsView.vue's fetchAllReports), not a
      // start/end pair of its own.
      const start = req.query.from || "1970-01-01";
      const end = req.query.to || "2999-12-31";

      const { rows: recipes } = await pool.query(
        `SELECT spr.service_id, s.name AS service_name,
                spr.product_inventory_id, p.name AS product_name, pi.variation_name,
                spr.amount_type, spr.amount_value, spr.amount_min, spr.amount_max
         FROM service_product_recipes spr
         JOIN services s ON s.id = spr.service_id
         JOIN product_inventory pi ON pi.id = spr.product_inventory_id
         JOIN products p ON p.id = pi.product_id
         WHERE spr.shop_id = $1`,
        [req.shopId],
      );

      // Booking count per service in the period, one query per distinct service.
      const serviceIds = [...new Set(recipes.map((r) => r.service_id))];
      const countsByService = {};
      for (const serviceId of serviceIds) {
        const { rows } = await pool.query(
          `SELECT COUNT(*) AS cnt FROM appointment_services aps
           JOIN appointments a ON a.id = aps.appointment_id
           WHERE aps.service_id = $1 AND a.shop_id = $2 AND a.status != 'cancelled'
             AND aps.start_time BETWEEN $3 AND $4`,
          [serviceId, req.shopId, start, end],
        );
        countsByService[serviceId] = parseInt(rows[0].cnt, 10);
      }

      // Group recipes by product, accumulating expected totals across every
      // service that uses this product.
      const byProduct = {};
      for (const r of recipes) {
        const count = countsByService[r.service_id] || 0;
        if (!byProduct[r.product_inventory_id]) {
          byProduct[r.product_inventory_id] = {
            product_inventory_id: r.product_inventory_id,
            product_name: r.product_name,
            variation_name: r.variation_name,
            unit: r.amount_type === "bottle" ? "bottle" : "ml",
            expected_min: 0,
            expected_max: 0,
            services: [],
          };
        }
        const entry = byProduct[r.product_inventory_id];
        if (r.amount_type === "range") {
          entry.expected_min += Number(r.amount_min) * count;
          entry.expected_max += Number(r.amount_max) * count;
        } else {
          entry.expected_min += Number(r.amount_value) * count;
          entry.expected_max += Number(r.amount_value) * count;
        }
        entry.services.push({
          service_name: r.service_name,
          amount_type: r.amount_type,
          amount_value: r.amount_value,
          amount_min: r.amount_min,
          amount_max: r.amount_max,
          count,
        });
      }

      const results = [];
      for (const productId of Object.keys(byProduct)) {
        const entry = byProduct[productId];
        let actual = null;
        if (entry.unit === "ml") {
          const { rows: stocktakes } = await pool.query(
            `SELECT recorded_at, remaining_amount_ml, restocked_amount_ml
             FROM product_usage_stocktakes
             WHERE product_inventory_id = $1 AND shop_id = $2
             ORDER BY recorded_at ASC`,
            [productId, req.shopId],
          );
          actual = 0;
          let hasData = false;
          for (let i = 1; i < stocktakes.length; i++) {
            const prev = stocktakes[i - 1];
            const curr = stocktakes[i];
            if (curr.recorded_at >= new Date(start) && curr.recorded_at <= new Date(end)) {
              actual +=
                Number(prev.remaining_amount_ml) +
                Number(curr.restocked_amount_ml) -
                Number(curr.remaining_amount_ml);
              hasData = true;
            }
          }
          if (!hasData) actual = null;
        } else {
          const { rows } = await pool.query(
            `SELECT COALESCE(SUM(-delta), 0) AS used
             FROM product_stock_adjustments
             WHERE product_inventory_id = $1 AND shop_id = $2 AND delta < 0
               AND created_at BETWEEN $3 AND $4`,
            [productId, req.shopId, start, end],
          );
          actual = Number(rows[0].used);
        }

        let status = "no_data";
        if (actual !== null) {
          if (actual < entry.expected_min) status = "under";
          else if (actual > entry.expected_max) status = "over";
          else status = "ok";
        }

        results.push({ ...entry, actual, status });
      }

      res.json(results);
    }),
  );

  router.get("/financials", authenticateToken, requireAnalyticsAccess, asyncHandler(async (req, res) => {
    const { from, to } = req.query;
    // Safety net: without a range this scanned every transaction ever recorded.
    // Default to the last 12 months when the caller doesn't specify one.
    const startDate =
      from || new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString();
    const endDate = to || new Date().toISOString();

    const { rows } = await pool.query(
      `
      SELECT t.*, c.first_name, c.last_name, s.name AS service_name
      FROM transactions t
      LEFT JOIN clients c ON t.client_id = c.id
      LEFT JOIN appointments a ON t.appointment_id = a.id
      LEFT JOIN appointment_services aps ON a.id = aps.appointment_id
      LEFT JOIN services s ON aps.service_id = s.id
      WHERE t.shop_id = $1 AND t.created_at BETWEEN $2 AND $3
      ORDER BY t.created_at DESC
    `,
      [req.shopId, startDate, endDate],
    );
    res.json(rows);
  }));

  // Front desk's end-of-day view: today's takings and today's appointments only.
  // Deliberately fixed to "today" (no from/to) so front desk never gets historical
  // financials — the full analytics endpoints stay admin-only.
  router.get("/reports/daily", authenticateToken, notForClients, asyncHandler(async (req, res) => {
    const role = req.user.role;
    if (role !== "admin" && role !== "super_admin" && role !== "frontdesk") {
      return res.status(403).json({ error: "Forbidden" });
    }
    // The day to show: ?date=YYYY-MM-DD, or today.
    const day = req.query.date ? String(req.query.date) : null;
    if (day) {
      const parsed = new Date(`${day}T00:00:00Z`);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || isNaN(parsed) || !parsed.toISOString().startsWith(day)) {
        return res.status(400).json({ error: "invalid_date" });
      }
    }
    // Ctrl+1 (cash) / Ctrl+8 (card) hide-revenue toggles, same params as the other reports.
    const { excludeCash, excludeCard } = req.query;
    const methodExclusion = buildTxnMethodExclusionClause(excludeCash, excludeCard, "t.");
    const apptExclusion = buildRevenueExclusionClause(excludeCash, excludeCard, "a");
    const visibility = role === "super_admin" ? "" : " AND (a.id IS NULL OR a.save_receipt = true)";
    // Package/membership visits are prepaid earlier — not money collected today.
    const { rows: payments } = await pool.query(
      `SELECT t.id, t.amount, t.payment_method, t.transaction_type, t.created_at,
              c.first_name, c.last_name
       FROM transactions t
       LEFT JOIN clients c ON c.id = t.client_id
       LEFT JOIN appointments a ON a.id = t.appointment_id
       WHERE t.shop_id = $1 AND t.created_at::date = COALESCE($2::date, CURRENT_DATE)
         AND COALESCE(t.payment_method, '') NOT IN ('membership', 'package', 'write-off')
         ${methodExclusion}
         ${visibility}
       ORDER BY t.created_at DESC`,
      [req.shopId, day],
    );

    const { rows: appointments } = await pool.query(
      `SELECT a.status
       FROM appointments a
       WHERE a.shop_id = $1 AND a.is_block = false ${apptExclusion}
         AND EXISTS (SELECT 1 FROM appointment_services x WHERE x.appointment_id = a.id AND x.start_time::date = COALESCE($2::date, CURRENT_DATE))
         ${role === "super_admin" ? "" : "AND a.save_receipt = true"}`,
      [req.shopId, day],
    );

    const byMethod = {};
    let total = 0;
    for (const p of payments) {
      const m = p.payment_method || "other";
      byMethod[m] = (byMethod[m] || 0) + Number(p.amount);
      total += Number(p.amount);
    }
    const byStatus = {};
    for (const a of appointments) byStatus[a.status] = (byStatus[a.status] || 0) + 1;

    res.json({
      date: day || new Date().toISOString(),
      total_collected: Math.round(total * 100) / 100,
      by_method: Object.entries(byMethod).map(([method, amount]) => ({
        method,
        amount: Math.round(amount * 100) / 100,
      })),
      payments,
      appointment_count: appointments.length,
      by_status: byStatus,
    });
  }));

  // --- REPORT ENDPOINTS (ALL FILTERED BY SHOP_ID AND VISIBILITY) ---
  router.get("/reports/analytics", authenticateToken, requireAnalyticsAccess, asyncHandler(async (req, res) => {
    const { from, to, excludeCash, excludeCard } = req.query;
    // Default to last 30 days if no dates provided
    const startDate =
      from || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const endDate = to || new Date().toISOString();
    const client = await pool.connect();
    try {
      // A. Cancellation Rate
      // (Cancelled + No-Show) / Total Appointments
      const statusRes = await client.query(
        `SELECT 
           COUNT(*) FILTER (WHERE status IN ('cancelled', 'no-show')) as negative,
           COUNT(*) as total
         FROM appointments a
         JOIN appointment_services aps ON a.id = aps.appointment_id
         WHERE a.shop_id = $1 
         AND aps.start_time >= $2 AND aps.start_time <= $3`,
        [req.shopId, startDate, endDate],
      );

      const negCount = Number(statusRes.rows[0].negative);
      const totalAppts = Number(statusRes.rows[0].total);
      const cancelRate = totalAppts > 0 ? (negCount / totalAppts) * 100 : 0;

      // B. Client Retention (New vs Returning in this period)
      // "New" = Their first ever appointment is in this period
      // "Returning" = They have appointments before this period
      const retentionRes = await client.query(
        `SELECT 
           COUNT(DISTINCT a.client_id) FILTER (
             WHERE NOT EXISTS (
               SELECT 1 FROM appointments old 
               JOIN appointment_services aps_old ON old.id = aps_old.appointment_id
               WHERE old.client_id = a.client_id 
               AND aps_old.start_time < $2
               AND old.status = 'completed'
             )
           ) as new_clients,
           COUNT(DISTINCT a.client_id) FILTER (
             WHERE EXISTS (
               SELECT 1 FROM appointments old 
               JOIN appointment_services aps_old ON old.id = aps_old.appointment_id
               WHERE old.client_id = a.client_id 
               AND aps_old.start_time < $2
               AND old.status = 'completed'
             )
           ) as returning_clients
         FROM appointments a
         WHERE a.shop_id = $1 
         AND a.created_at >= $2 AND a.created_at <= $3`,
        [req.shopId, startDate, endDate],
      );

      const newClients = Number(retentionRes.rows[0].new_clients);
      const retClients = Number(retentionRes.rows[0].returning_clients);
      const retentionRate =
        newClients + retClients > 0
          ? (retClients / (newClients + retClients)) * 100
          : 0;

      // C. Staff Utilization
      // Per staff member: hours booked, appointments, revenue, the days they
      // had appointments, and appointments per such day. Cancelled and
      // no-show appointments and time blocks are left out, so every column
      // (and the average) counts the same appointments.
      const utilRes = await client.query(
        `SELECT st.name,
           SUM(COALESCE(aps.duration_override, s.duration_minutes))/60.0 as hours_booked,
           COUNT(aps.id) as appt_count,
           SUM(COALESCE(aps.price_override, s.price)) as total_revenue,
           COUNT(DISTINCT (aps.start_time AT TIME ZONE '${process.env.TZ || "Europe/Athens"}')::date) as days_worked,
           ROUND(COUNT(aps.id)::numeric
                 / NULLIF(COUNT(DISTINCT (aps.start_time AT TIME ZONE '${process.env.TZ || "Europe/Athens"}')::date), 0), 1) as avg_per_day
         FROM appointment_services aps
         JOIN staff st ON aps.staff_id = st.id
         LEFT JOIN services s ON aps.service_id = s.id
         JOIN appointments a ON aps.appointment_id = a.id
         WHERE st.shop_id = $1
         AND aps.start_time >= $2 AND aps.start_time <= $3
         AND a.status NOT IN ('cancelled', 'no-show', 'no_show')
         AND NOT COALESCE(a.is_block, false)
         ${buildRevenueExclusionClause(excludeCash, excludeCard, "a")}
         GROUP BY st.name`,
        [req.shopId, startDate, endDate],
      );

      res.json({
        cancellation_rate: cancelRate.toFixed(1),
        retention_rate: retentionRate.toFixed(1),
        new_clients: newClients,
        returning_clients: retClients,
        staff_utilization: utilRes.rows,
      });
    } finally {
      client.release();
    }
  }));

  // Booking insights for the analytics page: when the shop is busiest, what is
  // booked most, who comes most, and regulars who stopped coming. Counts
  // bookings that happened or are coming (not cancelled / no-show, no time
  // blocks), each on the day and hour of its first service, in shop time.
  // Regulars not seen lately look at all history, not the period.
  router.get("/reports/insights", authenticateToken, requireAnalyticsAccess, asyncHandler(async (req, res) => {
    const { from, to, excludeCash, excludeCard } = req.query;
    const tz = process.env.TZ || "Europe/Athens";
    const params = [req.shopId];
    let range = "";
    if (from) {
      params.push(from);
      range += ` AND fs.first_start >= $${params.length}`;
    }
    if (to) {
      params.push(to);
      range += ` AND fs.first_start <= $${params.length}`;
    }
    // One row per booking: its first start, number of services and value
    // (services + products).
    const booked = (extra = "") => `
      SELECT a.id, a.client_id, a.created_at, fs.first_start,
             (fs.first_start AT TIME ZONE '${tz}') AS local_start,
             fs.services,
             fs.service_value + COALESCE((SELECT SUM(ps.total_price) FROM product_sales ps WHERE ps.appointment_id = a.id), 0) AS value
      FROM appointments a
      JOIN LATERAL (
        SELECT MIN(aps.start_time) AS first_start, COUNT(*) AS services,
               SUM(COALESCE(aps.price_override, s.price, 0)) AS service_value
        FROM appointment_services aps LEFT JOIN services s ON s.id = aps.service_id
        WHERE aps.appointment_id = a.id
      ) fs ON fs.first_start IS NOT NULL
      WHERE a.shop_id = $1
        AND a.status NOT IN ('cancelled', 'no-show', 'no_show')
        AND NOT COALESCE(a.is_block, false)
        ${getVisibilityClause(req.user, "a")}
        ${buildRevenueExclusionClause(excludeCash, excludeCard, "a")}
        ${extra}`;
    const inPeriod = (query) => pool.query(`WITH b AS (${booked(range)}) ${query}`, params);
    const clientName = "TRIM(COALESCE(c.last_name, '') || ' ' || COALESCE(c.first_name, ''))";
    // The shop's walk-in client, and older ones named so, aren't real clients.
    const notWalkIn = `c.id IS DISTINCT FROM (SELECT walk_in_client_id FROM shops WHERE id = $1)
      AND NOT (COALESCE(c.first_name, '') || ' ' || COALESCE(c.last_name, '')) ~* 'walk[- ]?in'`;
    const topClients = (order) =>
      inPeriod(`SELECT c.id, ${clientName} AS name, c.phone, COUNT(*)::int AS visits, ROUND(SUM(b.value), 2)::float AS value
                FROM b JOIN clients c ON c.id = b.client_id
                WHERE ${notWalkIn}
                GROUP BY c.id ORDER BY ${order} LIMIT 10`);
    const [weekdays, busiestDate, heatmap, averages, services, byVisits, byValue, lapsed] = await Promise.all([
      inPeriod(`SELECT EXTRACT(ISODOW FROM local_start)::int AS weekday, COUNT(*)::int AS bookings,
                       COUNT(DISTINCT local_start::date)::int AS days
                FROM b GROUP BY 1 ORDER BY 1`),
      inPeriod(`SELECT local_start::date::text AS date, COUNT(*)::int AS bookings
                FROM b GROUP BY 1 ORDER BY 2 DESC, 1 LIMIT 1`),
      inPeriod(`SELECT EXTRACT(ISODOW FROM local_start)::int AS weekday, EXTRACT(HOUR FROM local_start)::int AS hour,
                       COUNT(*)::int AS bookings
                FROM b GROUP BY 1, 2`),
      inPeriod(`SELECT COUNT(*)::int AS bookings,
                       ROUND(AVG(value), 2)::float AS avg_value,
                       ROUND(AVG(services), 1)::float AS avg_services,
                       ROUND(AVG(GREATEST(local_start::date - created_at, 0)) FILTER (WHERE created_at IS NOT NULL), 1)::float AS avg_lead_days,
                       ROUND(100.0 * AVG(CASE WHEN local_start::date <= created_at THEN 1 ELSE 0 END) FILTER (WHERE created_at IS NOT NULL))::int AS same_day_pct
                FROM b`),
      inPeriod(`SELECT s.name AS service_name, COUNT(DISTINCT b.id)::int AS bookings,
                       ROUND(SUM(COALESCE(aps.price_override, s.price, 0)), 2)::float AS value
                FROM b
                JOIN appointment_services aps ON aps.appointment_id = b.id
                JOIN services s ON s.id = aps.service_id
                GROUP BY s.id, s.name ORDER BY 2 DESC, 3 DESC LIMIT 5`),
      topClients("visits DESC, value DESC"),
      topClients("value DESC, visits DESC"),
      // 3+ past visits, the last over 60 days ago, nothing booked since.
      pool.query(
        `WITH b AS (${booked()})
         SELECT c.id, ${clientName} AS name, c.phone,
                COUNT(*)::int AS visits, MAX(b.local_start)::date::text AS last_visit
         FROM b JOIN clients c ON c.id = b.client_id
         WHERE ${notWalkIn}
         GROUP BY c.id
         HAVING COUNT(*) >= 3 AND MAX(b.first_start) < NOW() - INTERVAL '60 days'
         ORDER BY visits DESC, MAX(b.first_start) DESC
         LIMIT 30`,
        [req.shopId],
      ),
    ]);
    res.json({
      weekdays: weekdays.rows,
      busiest_date: busiestDate.rows[0] || null,
      heatmap: heatmap.rows,
      averages: averages.rows[0],
      top_services: services.rows,
      top_clients_by_visits: byVisits.rows,
      top_clients_by_value: byValue.rows,
      lapsed_regulars: lapsed.rows,
    });
  }, { log: "Insights report error:" }));

  router.get("/reports/appointments", authenticateToken, requireAnalyticsAccess, asyncHandler(async (req, res) => {
    const { from, to, excludeCash, excludeCard } = req.query;
    const params = [req.shopId];

    let whereClause = " AND a.shop_id = $1" + getVisibilityClause(req.user, "a");
    whereClause += " " + buildRevenueExclusionClause(excludeCash, excludeCard, "a");

    if (from) {
      params.push(from);
      whereClause += ` AND aps.start_time >= $${params.length}`;
    }
    if (to) {
      params.push(to);
      whereClause += ` AND aps.start_time <= $${params.length}`;
    }
    const { rows } = await pool.query(
      `SELECT a.id, a.client_id, a.status, a.created_at, c.first_name, c.last_name,
        json_agg(json_build_object('service_name', s.name, 'price', aps.price_override)) as services
      FROM appointments a
      LEFT JOIN clients c ON a.client_id = c.id
      LEFT JOIN appointment_services aps ON aps.appointment_id = a.id
      LEFT JOIN services s ON aps.service_id = s.id
      WHERE 1=1 ${whereClause}
      GROUP BY a.id, c.first_name, c.last_name
      ORDER BY a.created_at DESC`,
      params,
    );
    res.json(rows);
  }));

  router.get("/reports/clients", authenticateToken, requireAnalyticsAccess, asyncHandler(async (req, res) => {
    const { from, to, excludeCash, excludeCard } = req.query;
    const params = [req.shopId];

    let whereClause = "WHERE a.shop_id = $1" + getVisibilityClause(req.user, "a");
    whereClause += " " + buildRevenueExclusionClause(excludeCash, excludeCard, "a");

    if (from) {
      params.push(from);
      whereClause += ` AND aps.start_time >= $${params.length}`;
    }
    if (to) {
      params.push(to);
      whereClause += ` AND aps.start_time <= $${params.length}`;
    }
    const { rows } = await pool.query(
      `SELECT c.*, COUNT(DISTINCT a.id) as appointment_count
       FROM clients c
       JOIN appointments a ON c.id = a.client_id
       JOIN appointment_services aps ON a.id = aps.appointment_id
       ${whereClause}
       GROUP BY c.id 
       ORDER BY c.last_name`,
      params,
    );
    res.json(rows);
  }));

  router.get("/reports/sales", authenticateToken, requireAnalyticsAccess, asyncHandler(async (req, res) => {
    const { from, to, excludeCash, excludeCard } = req.query;
    const params = [req.shopId];

    let whereClause = "WHERE a.shop_id = $1 AND a.status = 'completed'";
    if (req.user.role !== "super_admin") {
      whereClause += " AND a.save_receipt = true";
    }
    whereClause += " " + buildRevenueExclusionClause(excludeCash, excludeCard, "a");

    if (from) {
      params.push(from);
      whereClause += ` AND aps.start_time >= $${params.length}`;
    }
    if (to) {
      params.push(to);
      whereClause += ` AND aps.start_time <= $${params.length}`;
    }
    const { rows } = await pool.query(
      `SELECT 
        COALESCE(s.name, 'Deleted Service') as service_name, 
        COUNT(aps.id) as count, 
        SUM(COALESCE(aps.price_override, s.price)) as total_revenue
      FROM appointment_services aps
      LEFT JOIN services s ON aps.service_id = s.id -- FIXED: LEFT JOIN
      JOIN appointments a ON aps.appointment_id = a.id
      ${whereClause} 
      GROUP BY COALESCE(s.name, 'Deleted Service') 
      ORDER BY total_revenue DESC`,
      params,
    );

    // Also return summary for charts
    const summary = rows.reduce(
      (acc, row) => acc + Number(row.total_revenue),
      0,
    );
    res.json({ summary: { total_revenue: summary }, details: rows });
  }));

  router.get("/reports/products", authenticateToken, requireAnalyticsAccess, asyncHandler(async (req, res) => {
    const { from, to, excludeCash, excludeCard } = req.query;
    const params = [req.shopId];

    let whereClause = "WHERE ps.shop_id = $1";
    if (req.user.role !== "super_admin") {
      whereClause += " AND (a.id IS NULL OR a.save_receipt = true)";
    }
    whereClause += " " + buildRevenueExclusionClause(excludeCash, excludeCard, "a");
    if (from) {
      params.push(from);
      whereClause += ` AND ps.sale_date >= $${params.length}`;
    }
    if (to) {
      params.push(to);
      whereClause += ` AND ps.sale_date <= $${params.length}`;
    }
    const { rows } = await pool.query(
      `SELECT
        COALESCE(p.name, 'Deleted Product') as product_name,
        COALESCE(pi.variation_name, 'Standard') as variation_name,
        SUM(ps.quantity) as units_sold,
        SUM(ps.total_price) as total_revenue,
        MAX(pi.stock_quantity) as current_stock
      FROM product_sales ps
      LEFT JOIN product_inventory pi ON ps.inventory_id = pi.id
      LEFT JOIN products p ON pi.product_id = p.id
      LEFT JOIN appointments a ON ps.appointment_id = a.id
      ${whereClause}
      GROUP BY COALESCE(p.name, 'Deleted Product'), COALESCE(pi.variation_name, 'Standard')
      ORDER BY total_revenue DESC`,
      params,
    );

    const summary = rows.reduce(
      (acc, row) => {
        acc.total_revenue += Number(row.total_revenue) || 0;
        acc.total_units += Number(row.units_sold) || 0;
        return acc;
      },
      { total_revenue: 0, total_units: 0 },
    );
    res.json({ summary, details: rows });
  }));

  router.get("/reports/gift-cards", authenticateToken, requireAnalyticsAccess, asyncHandler(async (req, res) => {
    const { from, to, excludeCash, excludeCard } = req.query;
    const params = [req.shopId];

    let whereClause = "WHERE gc.shop_id = $1";
    if (excludeCash === "true") {
      whereClause += " AND gc.purchase_payment_method != 'cash'";
    }
    if (excludeCard === "true") {
      whereClause += " AND gc.purchase_payment_method != 'card'";
    }
    if (from) {
      params.push(from);
      whereClause += ` AND gc.issued_at >= $${params.length}`;
    }
    if (to) {
      params.push(to);
      whereClause += ` AND gc.issued_at <= $${params.length}`;
    }
    const { rows } = await pool.query(
      `SELECT gc.card_number, gc.customer_name, gc.initial_amount,
              gc.remaining_balance, gc.purchase_payment_method,
              gc.issued_at, gc.expires_at
       FROM gift_cards gc
       ${whereClause}
       ORDER BY gc.issued_at DESC`,
      params,
    );

    const summary = rows.reduce(
      (acc, row) => {
        acc.total_revenue += Number(row.initial_amount) || 0;
        acc.total_outstanding += Number(row.remaining_balance) || 0;
        acc.total_cards += 1;
        return acc;
      },
      { total_revenue: 0, total_outstanding: 0, total_cards: 0 },
    );
    res.json({ summary, details: rows });
  }));

  router.get("/reports/staff", authenticateToken, requireAnalyticsAccess, asyncHandler(async (req, res) => {
    const { from, to, excludeCash, excludeCard } = req.query;
    const params = [req.shopId]; // $1, shared by both subqueries below

    // --- Service revenue/hours per staff (existing behavior) ---
    let svcWhere = "WHERE a.shop_id = $1" + getVisibilityClause(req.user, "a");
    svcWhere += " " + buildRevenueExclusionClause(excludeCash, excludeCard, "a");
    if (from) {
      params.push(from);
      svcWhere += ` AND aps.start_time >= $${params.length}`;
    }
    if (to) {
      params.push(to);
      svcWhere += ` AND aps.start_time <= $${params.length}`;
    }

    // --- Gift cards sold per staff member (Frontdesk / null sales are excluded —
    // there's no staff member to attribute them to in a per-staff breakdown) ---
    let gcWhere = "WHERE gc.shop_id = $1 AND gc.sold_by_staff_id IS NOT NULL";
    if (excludeCash === "true") gcWhere += " AND gc.purchase_payment_method != 'cash'";
    if (excludeCard === "true") gcWhere += " AND gc.purchase_payment_method != 'card'";
    if (from) {
      params.push(from);
      gcWhere += ` AND gc.issued_at >= $${params.length}`;
    }
    if (to) {
      params.push(to);
      gcWhere += ` AND gc.issued_at <= $${params.length}`;
    }
    const { rows } = await pool.query(
      `SELECT st.id as staff_id, st.name as staff_name,
        COALESCE(ss.appointment_count, 0) as appointment_count,
        COALESCE(ss.total_hours, 0) as total_hours,
        COALESCE(ss.total_revenue, 0) as total_revenue,
        COALESCE(gcs.gift_card_count, 0) as gift_card_count,
        COALESCE(gcs.gift_card_revenue, 0) as gift_card_revenue
      FROM staff st
      LEFT JOIN (
        SELECT aps.staff_id, COUNT(aps.id) as appointment_count,
          SUM(COALESCE(aps.duration_override, s.duration_minutes)) as total_hours,
          SUM(COALESCE(aps.price_override, s.price)) as total_revenue
        FROM appointment_services aps
        JOIN services s ON aps.service_id = s.id
        JOIN appointments a ON aps.appointment_id = a.id
        ${svcWhere}
        GROUP BY aps.staff_id
      ) ss ON ss.staff_id = st.id
      LEFT JOIN (
        SELECT gc.sold_by_staff_id, COUNT(*) as gift_card_count, SUM(gc.initial_amount) as gift_card_revenue
        FROM gift_cards gc
        ${gcWhere}
        GROUP BY gc.sold_by_staff_id
      ) gcs ON gcs.sold_by_staff_id = st.id
      WHERE st.shop_id = $1 AND (ss.staff_id IS NOT NULL OR gcs.sold_by_staff_id IS NOT NULL)
      ORDER BY total_revenue DESC`,
      params,
    );
    res.json(rows);
  }));

  router.get("/reports/payments", authenticateToken, requireAnalyticsAccess, asyncHandler(async (req, res) => {
    const { from, to, excludeCash, excludeCard } = req.query;
    const params = [req.shopId];

    let whereClause = "WHERE t.shop_id = $1";

    if (req.user.role !== "super_admin") {
      whereClause += " AND (a.id IS NULL OR a.save_receipt = true)";
    }

    whereClause += " " + buildTxnMethodExclusionClause(excludeCash, excludeCard, "t.");

    if (from) {
      params.push(from);
      whereClause += ` AND t.created_at >= $${params.length}`;
    }
    if (to) {
      params.push(to);
      whereClause += ` AND t.created_at <= $${params.length}`;
    }
    const { rows } = await pool.query(
      `SELECT t.*, c.first_name, c.last_name 
       FROM transactions t 
       LEFT JOIN clients c ON t.client_id = c.id 
       LEFT JOIN appointments a ON t.appointment_id = a.id
       ${whereClause} 
       ORDER BY t.created_at DESC`,
      params,
    );
    res.json(rows);
  }));

  // A from/to bound arrives as an ISO timestamp of local midnight; expenses are
  // plain calendar dates, so compare against that timestamp's local date.
  const expenseDateOf = (paramIndex) =>
    `(($${paramIndex})::timestamptz AT TIME ZONE '${process.env.TZ || "Europe/Athens"}')::date`;

  router.get("/reports/finances", authenticateToken, requireAnalyticsAccess, asyncHandler(async (req, res) => {
    const { from, to, excludeCash, excludeCard } = req.query;
    const shopId = req.shopId;
    const isSuperAdmin = req.user.role === "super_admin";
    const cashApptClause = buildRevenueExclusionClause(excludeCash, excludeCard, "a2");
    const cashTxnClause = buildTxnMethodExclusionClause(excludeCash, excludeCard);

    // 1. Setup Parameters for Appointments (Sales/Debt)
    const apptParams = [shopId];
    let apptDateFilter = "";
    if (from) {
      apptParams.push(from);
      apptDateFilter += ` AND aps2.start_time >= $${apptParams.length}`;
    }
    if (to) {
      apptParams.push(to);
      apptDateFilter += ` AND aps2.start_time <= $${apptParams.length}`;
    }

    // Subquery to find appointments in the date range.
    // Includes completed appointments and any past appointment that is not cancelled/no-show
    // (covers 'new', 'confirmed', and 'started' statuses that have already occurred).
    const appointmentSubquery = `
      SELECT DISTINCT a2.id FROM appointments a2
      JOIN appointment_services aps2 ON a2.id = aps2.appointment_id
      WHERE a2.shop_id = $1
      AND (
        a2.status = 'completed'
        OR (a2.status IN ('new', 'confirmed', 'started') AND aps2.start_time < CURRENT_TIMESTAMP)
      )
      ${!isSuperAdmin ? "AND a2.save_receipt = true" : ""}
      ${apptDateFilter}
      ${cashApptClause}
    `;

    let client;
    try {
      client = await pool.connect();

      // --- A. TOTAL SALES (Services + Products) ---
      const salesRes = await client.query(
        `
        SELECT SUM(COALESCE(aps.price_override, s.price)) as total
        FROM appointment_services aps
        LEFT JOIN services s ON aps.service_id = s.id
        WHERE aps.appointment_id IN (${appointmentSubquery})
      `,
        apptParams,
      );
      const productSalesRes = await client.query(
        `
        SELECT SUM(ps.total_price) as total
        FROM product_sales ps
        WHERE ps.appointment_id IN (${appointmentSubquery})
      `,
        apptParams,
      );
      const totalSales =
        (Number(salesRes.rows[0].total) || 0) +
        (Number(productSalesRes.rows[0].total) || 0);

      // --- B. PERIOD DEBT ---
      const periodPaymentsRes = await client.query(
        `
        SELECT SUM(amount) as total FROM transactions WHERE appointment_id IN (${appointmentSubquery})
      `,
        apptParams,
      );
      const periodPaymentsApplied = Number(periodPaymentsRes.rows[0].total) || 0;
      const totalDebt = totalSales - periodPaymentsApplied;

      // --- C. TOTAL COLLECTED (Cash Flow for Period) ---
      const flowParams = [shopId];
      let flowFilter = "";
      if (from) {
        flowParams.push(from);
        flowFilter += ` AND created_at >= $${flowParams.length}`;
      }
      if (to) {
        flowParams.push(to);
        flowFilter += ` AND created_at <= $${flowParams.length}`;
      }

      const payRes = await client.query(
        `
        SELECT SUM(amount) as total FROM transactions WHERE shop_id = $1 ${flowFilter} ${cashTxnClause}
      `,
        flowParams,
      );
      const totalPayments = Number(payRes.rows[0].total) || 0;

      // --- D. COLLECTED TODAY (The missing piece) ---
      const todayRes = await client.query(
        `
        SELECT SUM(amount) as total FROM transactions
        WHERE shop_id = $1 AND created_at >= CURRENT_DATE ${cashTxnClause}
      `,
        [shopId],
      );
      const collectedToday = Number(todayRes.rows[0].total) || 0;

      // --- E. EXPENSES for the period, hidden by the same cash/card toggles ---
      const expParams = [shopId];
      let expFilter = "";
      if (from) {
        expParams.push(from);
        expFilter += ` AND expense_date >= ${expenseDateOf(expParams.length)}`;
      }
      if (to) {
        expParams.push(to);
        expFilter += ` AND expense_date <= ${expenseDateOf(expParams.length)}`;
      }
      if (excludeCash === "true") expFilter += ` AND payment_method <> 'cash'`;
      if (excludeCard === "true") expFilter += ` AND payment_method <> 'card'`;
      const expRes = await client.query(
        `SELECT COALESCE(SUM(amount), 0) AS total FROM expenses WHERE shop_id = $1 ${expFilter}`,
        expParams,
      );
      const totalExpenses = Number(expRes.rows[0].total) || 0;

      // --- Final Response (All keys required by FinancialsView.vue) ---
      res.json({
        total_sales: totalSales,
        total_payments: totalPayments,
        collected_today: collectedToday,
        total_debt: totalDebt,
        total_expenses: totalExpenses,
        net_profit: totalPayments - totalExpenses,
      });
    } finally {
      if (client) client.release();
    }
  }, { log: "Finance Report Error:", message: "Failed to generate report" }));

  router.get(
    "/reports/service-summary",
    authenticateToken,
    requireAnalyticsAccess,
    asyncHandler(async (req, res) => {
      const { from, to, excludeCash, excludeCard } = req.query;
      const params = [req.shopId];
      let dateFilter = "";
      const cashExclusion = buildRevenueExclusionClause(excludeCash, excludeCard, "a");

      if (from) {
        params.push(from);
        dateFilter += ` AND aps.start_time >= $${params.length}`;
      }
      if (to) {
        params.push(to);
        dateFilter += ` AND aps.start_time <= $${params.length}`;
      }
      // We join with active_clients as the source of truth for client data
      // Updated query to filter for past appointments only
      const query = `
        SELECT 
          s.name as service_name,
          COUNT(aps.id) as service_count,
          SUM(COALESCE(aps.price_override, s.price)) as total_value,
          SUM(COALESCE((
            SELECT SUM(t.amount) 
            FROM transactions t 
            WHERE t.appointment_id = a.id
          ), 0)) as total_paid
        FROM appointment_services aps
        JOIN services s ON aps.service_id = s.id
        JOIN appointments a ON aps.appointment_id = a.id
        JOIN active_clients c ON a.client_id = c.id
        WHERE a.shop_id = $1
          AND a.status NOT IN ('cancelled', 'no-show')
          ${dateFilter}
          ${cashExclusion}
        GROUP BY s.name
        ORDER BY total_value DESC
      `;

      const { rows } = await pool.query(query, params);

      // Calculate owed amount for each row
      const reportData = rows.map((row) => ({
        ...row,
        total_owed: Math.max(
          0,
          Number(row.total_value) - Number(row.total_paid),
        ),
      }));

      res.json(reportData);
    }, { log: "Service Summary Error:", message: "Failed to generate service summary" }),
  );

  // Backing report for the admin Financials "Payments Log" tab's new
  // Refunds & Price Changes section.
  router.get(
    "/reports/price-adjustments",
    authenticateToken,
    requireAnalyticsAccess,
    asyncHandler(async (req, res) => {
      const { from, to } = req.query;
      const params = [req.shopId];
      let whereClause = "WHERE pa.shop_id = $1";
      if (from) {
        params.push(from);
        whereClause += ` AND pa.created_at >= $${params.length}`;
      }
      if (to) {
        params.push(to);
        whereClause += ` AND pa.created_at <= $${params.length}`;
      }
      const { rows } = await pool.query(
        `SELECT pa.*, c.first_name, c.last_name
         FROM price_adjustments pa
         JOIN appointments a ON a.id = pa.appointment_id
         LEFT JOIN clients c ON c.id = a.client_id
         ${whereClause}
         ORDER BY pa.created_at DESC`,
        params,
      );
      res.json(rows);
    }),
  );

  // ==================== MEMBERSHIP REPORT ====================
  router.get("/reports/membership", authenticateToken, requireAnalyticsAccess, asyncHandler(async (req, res) => {
    const { from, to } = req.query;
    const byTierRes = await pool.query(
      `SELECT mt.id, mt.name, mt.monthly_price, mt.yearly_price,
              COUNT(*) FILTER (WHERE cm.status = 'active') as active_count,
              COUNT(*) FILTER (WHERE cm.status = 'paused') as paused_count
       FROM membership_tiers mt
       LEFT JOIN client_memberships cm ON cm.tier_id = mt.id
       WHERE mt.shop_id = $1
       GROUP BY mt.id
       ORDER BY mt.sort_order`,
      [req.shopId],
    );

    const mrrRes = await pool.query(
      `SELECT COALESCE(SUM(
         CASE WHEN cm.billing_cycle = 'yearly' THEN mt.yearly_price / 12 ELSE mt.monthly_price END
       ), 0) as mrr
       FROM client_memberships cm
       JOIN membership_tiers mt ON mt.id = cm.tier_id
       WHERE cm.shop_id = $1 AND cm.status = 'active'`,
      [req.shopId],
    );

    const nearExpiryRes = await pool.query(
      `SELECT cm.id, cm.current_period_end, c.first_name, c.last_name, mt.name as tier_name
       FROM client_memberships cm
       JOIN clients c ON c.id = cm.client_id
       JOIN membership_tiers mt ON mt.id = cm.tier_id
       WHERE cm.shop_id = $1 AND cm.status = 'active'
         AND cm.current_period_end <= NOW() + INTERVAL '7 days'
       ORDER BY cm.current_period_end ASC`,
      [req.shopId],
    );

    const mostUsedRes = await pool.query(
      `SELECT s.name as service_name, COUNT(*) as uses
       FROM membership_usage mu
       JOIN client_memberships cm ON cm.id = mu.client_membership_id
       JOIN services s ON s.id = mu.service_id
       WHERE cm.shop_id = $1 AND mu.used_at >= date_trunc('month', NOW())
       GROUP BY s.name
       ORDER BY uses DESC
       LIMIT 10`,
      [req.shopId],
    );

    const revenueParams = [req.shopId];
    let revenueDateClause = "";
    if (from) {
      revenueParams.push(from);
      revenueDateClause += ` AND created_at >= $${revenueParams.length}`;
    }
    if (to) {
      revenueParams.push(to);
      revenueDateClause += ` AND created_at <= $${revenueParams.length}`;
    }
    const revenueRes = await pool.query(
      `SELECT COALESCE(SUM(amount), 0) as total FROM transactions
       WHERE shop_id = $1 AND transaction_type = 'membership_sale' ${revenueDateClause}`,
      revenueParams,
    );

    res.json({
      by_tier: byTierRes.rows.map((r) => ({
        ...r,
        active_count: parseInt(r.active_count),
        paused_count: parseInt(r.paused_count),
      })),
      total_active: byTierRes.rows.reduce((sum, r) => sum + parseInt(r.active_count), 0),
      mrr_estimate: Number(mrrRes.rows[0].mrr),
      membership_revenue: Number(revenueRes.rows[0].total),
      near_expiry: nearExpiryRes.rows,
      most_used_services: mostUsedRes.rows.map((r) => ({ ...r, uses: parseInt(r.uses) })),
    });
  }));

  return router;
};
