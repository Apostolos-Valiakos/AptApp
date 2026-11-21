// The overview reports: financials, analytics, booking insights, appointments and clients.
const express = require("express");
const { asyncHandler } = require("../../http");
const pool = require("../../db");
const { hiddenAmountSql, shownPriceSql, buildServiceExclusionClause, buildRevenueExclusionClause, analyticsWindow, RETURNING_SQL } = require("../../domain/reportSql");

module.exports = function overviewRouter({
  authenticateToken,
  getVisibilityClause,
  requireAnalyticsAccess,
}) {
  const router = express.Router();

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
  // --- REPORT ENDPOINTS (ALL FILTERED BY SHOP_ID AND VISIBILITY) ---
  router.get("/reports/analytics", authenticateToken, requireAnalyticsAccess, asyncHandler(async (req, res) => {
    const { excludeCash, excludeCard } = req.query;
    // Default to last 30 days if no dates provided
    const { start: startDate, end: endDate } = analyticsWindow(req);
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
           COUNT(DISTINCT a.client_id) FILTER (WHERE NOT ${RETURNING_SQL}) as new_clients,
           COUNT(DISTINCT a.client_id) FILTER (WHERE ${RETURNING_SQL}) as returning_clients
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
           SUM(${shownPriceSql(excludeCash, excludeCard)}) as total_revenue,
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
         ${buildServiceExclusionClause(excludeCash, excludeCard)}
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
  // Regulars not seen lately ignore the period: they count the last 3 and 6 months.
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
               SUM(${shownPriceSql(excludeCash, excludeCard)}) AS service_value
        FROM appointment_services aps LEFT JOIN services s ON s.id = aps.service_id
        WHERE aps.appointment_id = a.id ${buildServiceExclusionClause(excludeCash, excludeCard)}
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
                       ROUND(SUM(${shownPriceSql(excludeCash, excludeCard)}), 2)::float AS value
                FROM b
                JOIN appointment_services aps ON aps.appointment_id = b.id
                JOIN services s ON s.id = aps.service_id
                WHERE TRUE ${buildServiceExclusionClause(excludeCash, excludeCard)}
                GROUP BY s.id, s.name ORDER BY 2 DESC, 3 DESC LIMIT 5`),
      topClients("visits DESC, value DESC"),
      topClients("value DESC, visits DESC"),
      // 3+ visits in the last 6 months (the page narrows it to 3 with
      // visits_3_months), the latest over 60 days ago, nothing booked since.
      pool.query(
        `WITH b AS (${booked()})
         SELECT c.id, ${clientName} AS name, c.phone,
                COUNT(*) FILTER (WHERE b.first_start >= NOW() - INTERVAL '3 months')::int AS visits_3_months,
                COUNT(*) FILTER (WHERE b.first_start >= NOW() - INTERVAL '6 months')::int AS visits_6_months,
                MAX(b.local_start)::date::text AS last_visit
         FROM b JOIN clients c ON c.id = b.client_id
         WHERE ${notWalkIn}
         GROUP BY c.id
         HAVING COUNT(*) FILTER (WHERE b.first_start >= NOW() - INTERVAL '6 months') >= 3
            AND MAX(b.first_start) < NOW() - INTERVAL '60 days'
         ORDER BY visits_6_months DESC, MAX(b.first_start) DESC`,
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
      `SELECT a.id, a.client_id, a.status, a.created_at, c.first_name, c.last_name,
        json_agg(json_build_object('service_name', s.name, 'price', aps.price_override - ${hiddenAmountSql("aps", excludeCash, excludeCard)})) as services
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

  return router;
};
