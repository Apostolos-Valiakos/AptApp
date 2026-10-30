// Expenses: /api/v1/expenses.
// Moved out of server.js; helpers that still live there are handed over when
// it mounts this router (see "Area routers" near the end of server.js).
const express = require("express");
const { asyncHandler } = require("../http");
const pool = require("../db");

module.exports = function expensesRouter({
  authenticateToken,
  requireShopAdminAccess,
  safeUUID,
}) {
  const router = express.Router();

  // ==================== EXPENSES ====================
  // Shop running costs (rent, supplies, ...). Admin, super admin and frontdesk.
  const EXPENSE_METHODS = ["cash", "card", "bank-transfer"];

  const parseExpense = (body) => {
    const amount = Number(body.amount);
    const description = String(body.description || "").trim();
    const date = String(body.expense_date || "");
    const method = String(body.payment_method || "cash");
    if (!(amount > 0) || amount > 1e7) return { error: "amount must be a positive number" };
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || isNaN(new Date(`${date}T00:00:00`).getTime())) {
      return { error: "expense_date must be YYYY-MM-DD" };
    }
    if (!description || description.length > 500) return { error: "description is required (max 500 characters)" };
    if (!EXPENSE_METHODS.includes(method)) return { error: "invalid payment_method" };
    return { value: { amount: Math.round(amount * 100) / 100, description, date, method } };
  };

  router.get("/expenses", authenticateToken, requireShopAdminAccess, asyncHandler(async (req, res) => {
    const { from, to } = req.query;
    const params = [req.shopId];
    let filter = "";
    for (const [value, op] of [[from, ">="], [to, "<="]]) {
      if (!value) continue;
      if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value))) return res.status(400).json({ error: "dates must be YYYY-MM-DD" });
      params.push(value);
      filter += ` AND expense_date ${op} $${params.length}::date`;
    }
    const { rows } = await pool.query(
      `SELECT id, amount, to_char(expense_date, 'YYYY-MM-DD') AS expense_date, description,
              payment_method, created_at
       FROM expenses WHERE shop_id = $1 ${filter}
       ORDER BY expense_date DESC, created_at DESC`,
      params,
    );
    res.json(rows.map((r) => ({ ...r, amount: Number(r.amount) })));
  }, { log: "List expenses error:" }));

  router.post("/expenses", authenticateToken, requireShopAdminAccess, asyncHandler(async (req, res) => {
    const parsed = parseExpense(req.body);
    if (parsed.error) return res.status(400).json({ error: parsed.error });
    const e = parsed.value;
    const { rows } = await pool.query(
      `INSERT INTO expenses (shop_id, amount, expense_date, description, payment_method, created_by_user_id)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
      [req.shopId, e.amount, e.date, e.description, e.method, String(req.user.userId || "")],
    );
    res.status(201).json({ id: rows[0].id });
  }, { log: "Create expense error:" }));

  router.put("/expenses/:id", authenticateToken, requireShopAdminAccess, asyncHandler(async (req, res) => {
    const id = safeUUID(req.params.id);
    if (!id) return res.status(400).json({ error: "Invalid id" });
    const parsed = parseExpense(req.body);
    if (parsed.error) return res.status(400).json({ error: parsed.error });
    const e = parsed.value;
    const { rowCount } = await pool.query(
      `UPDATE expenses SET amount = $1, expense_date = $2, description = $3, payment_method = $4, updated_at = NOW()
       WHERE id = $5 AND shop_id = $6`,
      [e.amount, e.date, e.description, e.method, id, req.shopId],
    );
    if (!rowCount) return res.status(404).json({ error: "Not found" });
    res.json({ success: true });
  }, { log: "Update expense error:" }));

  router.delete("/expenses/:id", authenticateToken, requireShopAdminAccess, asyncHandler(async (req, res) => {
    const id = safeUUID(req.params.id);
    if (!id) return res.status(400).json({ error: "Invalid id" });
    const { rowCount } = await pool.query("DELETE FROM expenses WHERE id = $1 AND shop_id = $2", [id, req.shopId]);
    if (!rowCount) return res.status(404).json({ error: "Not found" });
    res.json({ success: true });
  }, { log: "Delete expense error:" }));

  return router;
};
