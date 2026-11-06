// Expenses: /api/v1/expenses.
// Moved out of server.js; helpers that still live there are handed over when
// it mounts this router (see "Area routers" near the end of server.js).
const express = require("express");
const { asyncHandler } = require("../http");
const pool = require("../db");

module.exports = function expensesRouter({
  authenticateToken,
  isReauthed,
  requireShopAdminAccess,
  requireAnalyticsAccess,
  requireSensitiveAccess,
  safeUUID,
}) {
  const router = express.Router();

  // ==================== EXPENSES ====================
  // Shop running costs. Daily ones (supplies, ...): admin, super admin and
  // frontdesk, who can change only today's. Monthly ones (rent, salaries, ...):
  // admin and super admin only; frontdesk can't see them at all.
  const EXPENSE_METHODS = ["cash", "card", "bank-transfer"];
  const isAdmin = (req) => req.user.role === "admin" || req.user.role === "super_admin";
  const shopToday = () => `(NOW() AT TIME ZONE '${process.env.TZ || "Europe/Athens"}')::date`;

  const parseExpense = (body) => {
    const amount = Number(body.amount);
    const description = String(body.description || "").trim();
    const date = String(body.expense_date || "");
    const method = String(body.payment_method || "cash");
    const categoryId = body.category_id ? safeUUID(body.category_id) : null;
    if (!(amount > 0) || amount > 1e7) return { error: "amount must be a positive number" };
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || isNaN(new Date(`${date}T00:00:00`).getTime())) {
      return { error: "expense_date must be YYYY-MM-DD" };
    }
    if (!description || description.length > 500) return { error: "description is required (max 500 characters)" };
    if (!EXPENSE_METHODS.includes(method)) return { error: "invalid payment_method" };
    if (body.category_id && !categoryId) return { error: "invalid category_id" };
    return { value: { amount: Math.round(amount * 100) / 100, description, date, method, categoryId } };
  };
  const firstOfMonth = (date) => `${date.slice(0, 7)}-01`;
  const categoryExists = async (req, id) =>
    !id ||
    (await pool.query("SELECT 1 FROM expense_categories WHERE id = $1 AND shop_id = $2", [id, req.shopId])).rows.length > 0;

  router.get("/expenses", authenticateToken, requireShopAdminAccess, asyncHandler(async (req, res) => {
    const { from, to, kind } = req.query;
    if (kind === "monthly" && !isAdmin(req)) return res.status(403).json({ error: "Admins only" });
    // Monthly expenses need the password retyped; only asking for daily ones doesn't.
    if (isAdmin(req) && kind !== "daily" && !isReauthed(req)) return res.status(403).json({ error: "reauth_required" });
    const params = [req.shopId];
    let filter = "";
    for (const [value, op] of [[from, ">="], [to, "<="]]) {
      if (!value) continue;
      if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value))) return res.status(400).json({ error: "dates must be YYYY-MM-DD" });
      params.push(value);
      filter += ` AND e.expense_date ${op} $${params.length}::date`;
    }
    const shownKind = isAdmin(req) ? kind : "daily";
    if (shownKind) {
      params.push(shownKind);
      filter += ` AND e.kind = $${params.length}`;
    }
    const { rows } = await pool.query(
      `SELECT e.id, e.amount, to_char(e.expense_date, 'YYYY-MM-DD') AS expense_date, e.description,
              e.payment_method, e.created_at, e.kind, e.category_id, c.name AS category_name,
              ${isAdmin(req) ? "true" : `(e.expense_date = ${shopToday()})`} AS editable
       FROM expenses e
       LEFT JOIN expense_categories c ON c.id = e.category_id
       WHERE e.shop_id = $1 ${filter}
       ORDER BY e.expense_date DESC, e.created_at DESC`,
      params,
    );
    res.json(rows.map((r) => ({ ...r, amount: Number(r.amount) })));
  }, { log: "List expenses error:" }));

  router.post("/expenses", authenticateToken, requireShopAdminAccess, asyncHandler(async (req, res) => {
    const kind = req.body.kind === "monthly" ? "monthly" : "daily";
    if (kind === "monthly" && !isAdmin(req)) return res.status(403).json({ error: "Admins only" });
    if (kind === "monthly" && !isReauthed(req)) return res.status(403).json({ error: "reauth_required" });
    const parsed = parseExpense(req.body);
    if (parsed.error) return res.status(400).json({ error: parsed.error });
    const e = parsed.value;
    if (!(await categoryExists(req, e.categoryId))) return res.status(400).json({ error: "invalid category_id" });
    const { rows } = await pool.query(
      `INSERT INTO expenses (shop_id, amount, expense_date, description, payment_method, created_by_user_id, kind, category_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id`,
      [req.shopId, e.amount, kind === "monthly" ? firstOfMonth(e.date) : e.date, e.description, e.method, String(req.user.userId || ""), kind, e.categoryId],
    );
    res.status(201).json({ id: rows[0].id });
  }, { log: "Create expense error:" }));

  // What this login may change: frontdesk only today's daily expenses. Answers
  // not found for a monthly one, which frontdesk isn't meant to know exists.
  const changeableExpense = async (req, res, id) => {
    const { rows } = await pool.query(
      `SELECT kind, (expense_date = ${shopToday()}) AS is_today FROM expenses WHERE id = $1 AND shop_id = $2`,
      [id, req.shopId],
    );
    const found = rows[0];
    if (!found || (found.kind === "monthly" && !isAdmin(req))) {
      res.status(404).json({ error: "Not found" });
      return null;
    }
    if (found.kind === "monthly" && !isReauthed(req)) {
      res.status(403).json({ error: "reauth_required" });
      return null;
    }
    if (!isAdmin(req) && !found.is_today) {
      res.status(403).json({ error: "only_today" });
      return null;
    }
    return found;
  };

  router.put("/expenses/:id", authenticateToken, requireShopAdminAccess, asyncHandler(async (req, res) => {
    const id = safeUUID(req.params.id);
    if (!id) return res.status(400).json({ error: "Invalid id" });
    const parsed = parseExpense(req.body);
    if (parsed.error) return res.status(400).json({ error: parsed.error });
    const e = parsed.value;
    if (!(await categoryExists(req, e.categoryId))) return res.status(400).json({ error: "invalid category_id" });
    const found = await changeableExpense(req, res, id);
    if (!found) return;
    // Frontdesk can't move today's expense to another day, where they couldn't change it.
    const { rowCount } = await pool.query(
      `UPDATE expenses
       SET amount = $1, expense_date = COALESCE($2::date, expense_date), description = $3,
           payment_method = $4, category_id = $5, updated_at = NOW()
       WHERE id = $6 AND shop_id = $7`,
      [e.amount, !isAdmin(req) ? null : found.kind === "monthly" ? firstOfMonth(e.date) : e.date, e.description, e.method, e.categoryId, id, req.shopId],
    );
    if (!rowCount) return res.status(404).json({ error: "Not found" });
    res.json({ success: true });
  }, { log: "Update expense error:" }));

  router.delete("/expenses/:id", authenticateToken, requireShopAdminAccess, asyncHandler(async (req, res) => {
    const id = safeUUID(req.params.id);
    if (!id) return res.status(400).json({ error: "Invalid id" });
    if (!(await changeableExpense(req, res, id))) return;
    const { rowCount } = await pool.query("DELETE FROM expenses WHERE id = $1 AND shop_id = $2", [id, req.shopId]);
    if (!rowCount) return res.status(404).json({ error: "Not found" });
    res.json({ success: true });
  }, { log: "Delete expense error:" }));

  // ==================== CATEGORIES ====================
  // Everyone who adds expenses picks from the list; only admins change it.
  router.get("/expense-categories", authenticateToken, requireShopAdminAccess, asyncHandler(async (req, res) => {
    const { rows } = await pool.query(
      "SELECT id, name FROM expense_categories WHERE shop_id = $1 AND is_active ORDER BY LOWER(name)",
      [req.shopId],
    );
    res.json(rows);
  }, { log: "List expense categories error:" }));

  const parseCategoryName = (body) => {
    const name = String(body.name || "").trim();
    return name && name.length <= 100 ? name : null;
  };

  // A name used before brings that category back rather than making a second one.
  router.post("/expense-categories", authenticateToken, requireAnalyticsAccess, asyncHandler(async (req, res) => {
    const name = parseCategoryName(req.body);
    if (!name) return res.status(400).json({ error: "name is required (max 100 characters)" });
    const { rows } = await pool.query(
      `INSERT INTO expense_categories (shop_id, name) VALUES ($1, $2)
       ON CONFLICT (shop_id, LOWER(name)) DO UPDATE SET is_active = true, name = EXCLUDED.name
       RETURNING id, name`,
      [req.shopId, name],
    );
    res.status(201).json(rows[0]);
  }, { log: "Create expense category error:" }));

  router.put("/expense-categories/:id", authenticateToken, requireAnalyticsAccess, asyncHandler(async (req, res) => {
    const id = safeUUID(req.params.id);
    const name = parseCategoryName(req.body);
    if (!id || !name) return res.status(400).json({ error: "name is required (max 100 characters)" });
    const taken = await pool.query(
      "SELECT 1 FROM expense_categories WHERE shop_id = $1 AND LOWER(name) = LOWER($2) AND id <> $3",
      [req.shopId, name, id],
    );
    if (taken.rows.length) return res.status(409).json({ error: "name_taken" });
    const { rowCount } = await pool.query(
      "UPDATE expense_categories SET name = $1 WHERE id = $2 AND shop_id = $3",
      [name, id, req.shopId],
    );
    if (!rowCount) return res.status(404).json({ error: "Not found" });
    res.json({ success: true });
  }, { log: "Rename expense category error:" }));

  router.delete("/expense-categories/:id", authenticateToken, requireAnalyticsAccess, asyncHandler(async (req, res) => {
    const id = safeUUID(req.params.id);
    if (!id) return res.status(400).json({ error: "Invalid id" });
    const { rowCount } = await pool.query(
      "UPDATE expense_categories SET is_active = false WHERE id = $1 AND shop_id = $2",
      [id, req.shopId],
    );
    if (!rowCount) return res.status(404).json({ error: "Not found" });
    res.json({ success: true });
  }, { log: "Remove expense category error:" }));

  // ==================== REPORT ====================
  // One month against the month before and the same month a year earlier, by
  // category, and the twelve months up to it. Admins only.
  router.get("/reports/expenses", authenticateToken, requireSensitiveAccess, asyncHandler(async (req, res) => {
    const month = String(req.query.month || "");
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) return res.status(400).json({ error: "month must be YYYY-MM" });
    let methods = "";
    const start = `${month}-01`;

    const { rows: months } = await pool.query(
      `SELECT to_char(m, 'YYYY-MM') AS month,
              COALESCE(SUM(e.amount) FILTER (WHERE e.kind = 'daily'), 0)::float AS daily,
              COALESCE(SUM(e.amount) FILTER (WHERE e.kind = 'monthly'), 0)::float AS monthly
       FROM generate_series($2::date - INTERVAL '11 months', $2::date, INTERVAL '1 month') m
       LEFT JOIN expenses e ON e.shop_id = $1 AND date_trunc('month', e.expense_date) = m ${methods}
       GROUP BY m ORDER BY m`,
      [req.shopId, start],
    );
    const { rows: categories } = await pool.query(
      `SELECT c.name AS category,
              COALESCE(SUM(e.amount) FILTER (WHERE date_trunc('month', e.expense_date) = $2::date), 0)::float AS current,
              COALESCE(SUM(e.amount) FILTER (WHERE date_trunc('month', e.expense_date) = $2::date - INTERVAL '1 month'), 0)::float AS previous,
              COALESCE(SUM(e.amount) FILTER (WHERE date_trunc('month', e.expense_date) = $2::date - INTERVAL '1 year'), 0)::float AS last_year
       FROM expenses e
       LEFT JOIN expense_categories c ON c.id = e.category_id
       WHERE e.shop_id = $1 ${methods}
         AND date_trunc('month', e.expense_date) IN ($2::date, $2::date - INTERVAL '1 month', $2::date - INTERVAL '1 year')
       GROUP BY c.name
       ORDER BY current DESC, previous DESC, c.name`,
      [req.shopId, start],
    );
    const { rows: yearAgo } = await pool.query(
      `SELECT COALESCE(SUM(e.amount) FILTER (WHERE e.kind = 'daily'), 0)::float AS daily,
              COALESCE(SUM(e.amount) FILTER (WHERE e.kind = 'monthly'), 0)::float AS monthly
       FROM expenses e
       WHERE e.shop_id = $1 ${methods} AND date_trunc('month', e.expense_date) = $2::date - INTERVAL '1 year'`,
      [req.shopId, start],
    );
    res.json({ month, months, categories, last_year: yearAgo[0] });
  }, { log: "Expenses report error:" }));

  return router;
};
