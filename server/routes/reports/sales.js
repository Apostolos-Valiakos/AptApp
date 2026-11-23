// Sales reports: product usage, sales, products, gift cards, staff, payments, the service summary and price changes.
const express = require("express");
const { asyncHandler } = require("../../http");
const pool = require("../../db");
const { localTimeOf, shownPriceSql, buildServiceExclusionClause, hiddenCostSql, buildRevenueExclusionClause, buildTxnMethodExclusionClause } = require("../../domain/reportSql");

module.exports = function salesRouter({
  authenticateToken,
  getVisibilityClause,
  requireAnalyticsAccess,
}) {
  const router = express.Router();

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
               AND created_at BETWEEN ${localTimeOf(3)} AND ${localTimeOf(4)}`,
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
  router.get("/reports/sales", authenticateToken, requireAnalyticsAccess, asyncHandler(async (req, res) => {
    const { from, to, excludeCash, excludeCard } = req.query;
    const params = [req.shopId];

    // Bookings off the receipts: super admins only (domain/common.js).
    let whereClause = "WHERE a.shop_id = $1 AND a.status = 'completed'" + getVisibilityClause(req.user, "a");
    whereClause += " " + buildRevenueExclusionClause(excludeCash, excludeCard, "a");
    whereClause += " " + buildServiceExclusionClause(excludeCash, excludeCard);

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
        SUM(${shownPriceSql(excludeCash, excludeCard)}) as total_revenue
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
      whereClause += ` AND gc.issued_at >= ${localTimeOf(params.length)}`;
    }
    if (to) {
      params.push(to);
      whereClause += ` AND gc.issued_at <= ${localTimeOf(params.length)}`;
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
    svcWhere += " " + buildServiceExclusionClause(excludeCash, excludeCard);
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
      gcWhere += ` AND gc.issued_at >= ${localTimeOf(params.length)}`;
    }
    if (to) {
      params.push(to);
      gcWhere += ` AND gc.issued_at <= ${localTimeOf(params.length)}`;
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
          SUM(${shownPriceSql(excludeCash, excludeCard)}) as total_revenue
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
      whereClause += ` AND t.created_at >= ${localTimeOf(params.length)}`;
    }
    if (to) {
      params.push(to);
      whereClause += ` AND t.created_at <= ${localTimeOf(params.length)}`;
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
  router.get(
    "/reports/service-summary",
    authenticateToken,
    requireAnalyticsAccess,
    asyncHandler(async (req, res) => {
      const { from, to, excludeCash, excludeCard } = req.query;
      const params = [req.shopId];
      let dateFilter = "";
      const cashExclusion =
        buildRevenueExclusionClause(excludeCash, excludeCard, "a") + " " + buildServiceExclusionClause(excludeCash, excludeCard);

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
          SUM(${shownPriceSql(excludeCash, excludeCard)}) as total_value,
          SUM(COALESCE((
            SELECT SUM(t.amount) 
            FROM transactions t 
            WHERE t.appointment_id = a.id AND COALESCE(t.payment_method, '') <> 'write-off'
          ), 0) - ${hiddenCostSql("a.id", excludeCash, excludeCard)}) as total_paid,
          SUM(COALESCE((
            SELECT SUM(t.amount)
            FROM transactions t
            WHERE t.appointment_id = a.id AND t.payment_method = 'write-off'
          ), 0)) as total_written_off
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
          Number(row.total_value) - Number(row.total_paid) - Number(row.total_written_off),
        ),
      }));

      res.json(reportData);
    }, { log: "Service Summary Error:", message: "Failed to generate service summary" }),
  );
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
        whereClause += ` AND pa.created_at >= ${localTimeOf(params.length)}`;
      }
      if (to) {
        params.push(to);
        whereClause += ` AND pa.created_at <= ${localTimeOf(params.length)}`;
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

  return router;
};
