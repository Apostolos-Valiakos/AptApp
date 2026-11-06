// Settling a client's manual debts: /api/v1/client-debts.
// Moved out of server.js; helpers that still live there are handed over when
// it mounts this router (see "Area routers" near the end of server.js).
const express = require("express");
const { HttpError, asyncHandler, withTransaction } = require("../http");

module.exports = function debtsRouter({
  authenticateToken,
  parseDebtResolution,
  recalculateClientBalance,
  requireShopAdminAccess,
  safeUUID,
  settleAmount,
}) {
  const router = express.Router();

  router.post("/client-debts/:id/resolve", authenticateToken, requireShopAdminAccess, asyncHandler(async (req, res) => {
    const id = safeUUID(req.params.id);
    const how = parseDebtResolution(req.body);
    if (!id || !how) return res.status(400).json({ error: "mode must be payment (with payment_method) or write_off" });
    const answer = await withTransaction(async (db) => {
      const debtRes = await db.query(
        `SELECT d.id, d.client_id,
                d.amount - COALESCE((SELECT SUM(t.amount) FROM transactions t WHERE t.client_debt_id = d.id), 0) AS remaining
         FROM client_debts d WHERE d.id = $1 AND d.shop_id = $2 FOR UPDATE OF d`,
        [id, req.shopId],
      );
      const debt = debtRes.rows[0];
      if (!debt) {
        throw new HttpError(404, { error: "Not found" });
      }
      const remaining = Math.round(Number(debt.remaining) * 100) / 100;
      if (!(remaining > 0)) {
        throw new HttpError(409, { error: "nothing_owed" });
      }
      const amount = settleAmount(req.body, remaining);
      if (amount === null || amount > remaining + 0.001) {
        throw new HttpError(400, { error: amount === null ? "invalid_amount" : "exceeds_owed", owed: remaining });
      }
      await db.query(
        `INSERT INTO transactions (appointment_id, client_id, client_debt_id, amount, payment_method, transaction_type, shop_id, created_by_user_id, created_at)
         VALUES (NULL, $1, $2, $3, $4, $5, $6, $7, NOW())`,
        [debt.client_id, id, amount, how.method, how.type, req.shopId, String(req.user.userId || "")],
      );
      const balance = await recalculateClientBalance(db, debt.client_id);
      return { success: true, amount, remaining: Math.round((remaining - amount) * 100) / 100, new_balance: balance };
    });
    res.json(answer);
  }, { log: "Resolve client debt error:" }));

  return router;
};
