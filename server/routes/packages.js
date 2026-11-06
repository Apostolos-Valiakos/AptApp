// Package types, sold packages and their visits: /api/v1/package-types, /client-packages, /package-usage.
// Moved out of server.js; helpers that still live there are handed over when
// it mounts this router (see "Area routers" near the end of server.js).
const express = require("express");
const { HttpError, asyncHandler, withTransaction } = require("../http");
const pool = require("../db");

module.exports = function packagesRouter({
  authenticateToken,
  isAdminRole,
  notForClients,
  recalculateClientBalance,
  requireAnalyticsAccess,
  requireShopAdminAccess,
  safeUUID,
}) {
  const router = express.Router();

  router.get("/package-types", authenticateToken, notForClients, asyncHandler(async (req, res) => {
    if (req.user.role === "client") return res.status(403).json({ error: "Forbidden" });
    const { rows } = await pool.query(
      `SELECT pt.*, s.name AS service_name
       FROM package_types pt JOIN services s ON s.id = pt.service_id
       WHERE pt.shop_id = $1 ${isAdminRole(req.user) ? "" : "AND pt.is_active = true"}
       ORDER BY pt.is_active DESC, LOWER(pt.name)`,
      [req.shopId],
    );
    res.json(rows);
  }));

  const parsePackageTypeBody = (b) => {
    const name = String(b.name || "").trim();
    const visits = parseInt(b.visits, 10);
    const price = Number(b.price);
    const validity = b.validity_days === null || b.validity_days === "" || b.validity_days === undefined ? null : parseInt(b.validity_days, 10);
    if (!name || name.length > 100) return { error: "Name is required (max 100 chars)" };
    if (!safeUUID(b.service_id)) return { error: "Service is required" };
    if (!(visits > 0)) return { error: "Visits must be at least 1" };
    if (!(price >= 0)) return { error: "Price is invalid" };
    if (validity !== null && !(validity > 0)) return { error: "Validity must be a positive number of days" };
    return { value: { name, service_id: safeUUID(b.service_id), visits, price, validity_days: validity } };
  };

  router.post("/package-types", authenticateToken, requireShopAdminAccess, asyncHandler(async (req, res) => {
    const parsed = parsePackageTypeBody(req.body);
    if (parsed.error) return res.status(400).json({ error: parsed.error });
    const v = parsed.value;
    const svc = await pool.query("SELECT 1 FROM services WHERE id = $1 AND shop_id = $2", [v.service_id, req.shopId]);
    if (!svc.rows[0]) return res.status(400).json({ error: "Service not found" });
    const { rows } = await pool.query(
      `INSERT INTO package_types (shop_id, name, service_id, visits, price, validity_days)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [req.shopId, v.name, v.service_id, v.visits, v.price, v.validity_days],
    );
    res.status(201).json(rows[0]);
  }));

  // Editing a type never changes packages already sold (they snapshot name/visits/price).
  router.put("/package-types/:id", authenticateToken, requireShopAdminAccess, asyncHandler(async (req, res) => {
    const parsed = parsePackageTypeBody(req.body);
    if (parsed.error) return res.status(400).json({ error: parsed.error });
    const v = parsed.value;
    const svc = await pool.query("SELECT 1 FROM services WHERE id = $1 AND shop_id = $2", [v.service_id, req.shopId]);
    if (!svc.rows[0]) return res.status(400).json({ error: "Service not found" });
    const { rows } = await pool.query(
      `UPDATE package_types SET name=$3, service_id=$4, visits=$5, price=$6, validity_days=$7,
         is_active = COALESCE($8, is_active)
       WHERE id = $1 AND shop_id = $2 RETURNING *`,
      [req.params.id, req.shopId, v.name, v.service_id, v.visits, v.price, v.validity_days,
       req.body.is_active === undefined ? null : !!req.body.is_active],
    );
    if (!rows[0]) return res.status(404).json({ error: "Not found" });
    res.json(rows[0]);
  }));

  router.delete("/package-types/:id", authenticateToken, requireShopAdminAccess, asyncHandler(async (req, res) => {
    const { rowCount } = await pool.query("DELETE FROM package_types WHERE id = $1 AND shop_id = $2", [req.params.id, req.shopId]);
    if (!rowCount) return res.status(404).json({ error: "Not found" });
    res.json({ success: true });
  }));

  // Admin adjustments: change total visits / expiry / note, or cancel the package.
  router.put("/client-packages/:id", authenticateToken, requireAnalyticsAccess, asyncHandler(async (req, res) => {
    const { total_visits, expires_at, note, status } = req.body;
    const sets = [];
    const params = [req.params.id, req.shopId];
    const add = (col, val) => {
      params.push(val);
      sets.push(`${col} = $${params.length}`);
    };
    if (total_visits !== undefined) {
      const n = parseInt(total_visits, 10);
      if (!(n >= 0)) return res.status(400).json({ error: "Invalid total visits" });
      add("total_visits", n);
    }
    if (expires_at !== undefined) add("expires_at", expires_at || null);
    if (note !== undefined) add("note", note || null);
    if (status !== undefined) {
      if (!["active", "cancelled"].includes(status)) return res.status(400).json({ error: "Invalid status" });
      add("status", status);
    }
    if (!sets.length) return res.status(400).json({ error: "Nothing to update" });
    const { rowCount } = await pool.query(
      `UPDATE client_packages SET ${sets.join(", ")} WHERE id = $1 AND shop_id = $2`,
      params,
    );
    if (!rowCount) return res.status(404).json({ error: "Not found" });
    res.json({ success: true });
  }));

  // Undo a visit redemption (the visit returns to the package).
  router.delete("/package-usage/:id", authenticateToken, notForClients, asyncHandler(async (req, res) => {
    if (req.user.role === "client") return res.status(403).json({ error: "Forbidden" });
    const answer = await withTransaction(async (client) => {
      const u = await client.query(
        `DELETE FROM package_usage pu USING client_packages cp
         WHERE pu.id = $1 AND cp.id = pu.client_package_id AND cp.shop_id = $2
         RETURNING pu.transaction_id, pu.appointment_id, cp.client_id`,
        [req.params.id, req.shopId],
      );
      if (!u.rows[0]) {
        throw new HttpError(404, { error: "Not found" });
      }
      const { transaction_id, appointment_id, client_id } = u.rows[0];
      if (transaction_id) await client.query("DELETE FROM transactions WHERE id = $1", [transaction_id]);
      let paymentStatus = null;
      if (appointment_id) {
        const upd = await client.query(
          `UPDATE appointments a SET payment_status = CASE
             WHEN NOT EXISTS (SELECT 1 FROM transactions t WHERE t.appointment_id = a.id) THEN 'unpaid' ELSE 'partial' END
           WHERE a.id = $1 RETURNING payment_status`,
          [appointment_id],
        );
        paymentStatus = upd.rows[0]?.payment_status || null;
      }
      const newBalance = await recalculateClientBalance(client, client_id);
      return { success: true, new_balance: newBalance, payment_status: paymentStatus };
    });
    res.json(answer);
  }));

  return router;
};
