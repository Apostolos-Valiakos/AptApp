// Gift cards: /api/v1/gift-cards.
// Moved out of server.js; helpers that still live there are handed over when
// it mounts this router (see "Area routers" near the end of server.js).
const express = require("express");
const { asyncHandler, withTransaction } = require("../http");
const pool = require("../db");

module.exports = function giftCardsRouter({
  authenticateToken,
  canSellExtras,
  notForClients,
}) {
  const router = express.Router();

  const giftCardStatus = (card) => {
    if (Number(card.remaining_balance) <= 0) return "depleted";
    if (new Date(card.expires_at) < new Date()) return "expired";
    return "active";
  };

  // List all gift cards for the shop (admin)
  router.get("/gift-cards", authenticateToken, notForClients, asyncHandler(async (req, res) => {
    if (!canSellExtras(req.user)) {
      return res.status(403).json({ error: "Not allowed" });
    }
    const { rows } = await pool.query(
      `SELECT gc.id, gc.card_number, gc.client_id, gc.customer_name, gc.initial_amount,
              gc.remaining_balance, gc.purchase_payment_method, gc.issued_at, gc.expires_at,
              gc.sold_by_staff_id, st.name as sold_by_name,
              (
                SELECT MAX(t.created_at) FROM transactions t
                WHERE t.gift_card_id = gc.id AND t.payment_method = 'gift-card'
              ) as last_used_at
       FROM gift_cards gc
       LEFT JOIN staff st ON st.id = gc.sold_by_staff_id
       WHERE gc.shop_id = $1 ORDER BY gc.issued_at DESC`,
      [req.shopId],
    );
    res.json(rows.map((c) => ({ ...c, status: giftCardStatus(c) })));
  }));

  // Search redeemable gift cards (any authenticated staff — used at checkout)
  router.get("/gift-cards/search", authenticateToken, notForClients, asyncHandler(async (req, res) => {
    const q = (req.query.q || "").trim();
    if (!q) return res.json([]);
    const { rows } = await pool.query(
      `SELECT id, card_number, customer_name, remaining_balance, expires_at
         FROM gift_cards
         WHERE shop_id = $1
           AND remaining_balance > 0
           AND expires_at > NOW()
           AND (card_number ILIKE $2 OR customer_name ILIKE $2)
         ORDER BY issued_at DESC
         LIMIT 10`,
      [req.shopId, `%${q}%`],
    );
    res.json(rows);
  }));

  // Create (sell) a gift card — admin only
  router.post("/gift-cards", authenticateToken, notForClients, asyncHandler(async (req, res) => {
    if (!canSellExtras(req.user)) {
      return res.status(403).json({ error: "Not allowed" });
    }
    const {
      card_number,
      client_id,
      customer_name,
      initial_amount,
      purchase_payment_method,
      sold_by_staff_id,
    } = req.body;

    if (
      !card_number ||
      !customer_name ||
      !initial_amount ||
      Number(initial_amount) <= 0
    ) {
      return res.status(400).json({
        error:
          "card_number, customer_name and a positive initial_amount are required",
      });
    }
    // sold_by_staff_id is a required field in the app: either a real staff id or
    // null for "Frontdesk". Only a genuinely missing key is rejected.
    if (sold_by_staff_id === undefined) {
      return res.status(400).json({
        error: "sold_by_staff_id is required (use null for Frontdesk)",
      });
    }

    const answer = await withTransaction(async (client) => {
      const { rows } = await client.query(
        `INSERT INTO gift_cards
           (card_number, client_id, customer_name, initial_amount, remaining_balance,
            purchase_payment_method, shop_id, issued_at, expires_at, sold_by_staff_id)
         VALUES ($1, $2, $3, $4, $4, $5, $6, NOW(), NOW() + INTERVAL '3 months', $7)
         RETURNING *`,
        [
          card_number,
          client_id || null,
          customer_name,
          initial_amount,
          purchase_payment_method || "cash",
          req.shopId,
          sold_by_staff_id || null,
        ],
      );
      const card = rows[0];

      // Recognize revenue immediately at time of sale (no linked appointment)
      await client.query(
        `INSERT INTO transactions
           (appointment_id, client_id, amount, payment_method, transaction_type, shop_id, gift_card_id, created_at)
         VALUES (NULL, $1, $2, $3, 'gift_card_sale', $4, $5, NOW())`,
        [
          client_id || null,
          initial_amount,
          purchase_payment_method || "cash",
          req.shopId,
          card.id,
        ],
      );

      return { ...card, status: giftCardStatus(card) };
    });
    res.json(answer);
  }));

  // Edit gift card metadata (admin only) — balance/expiry are not editable here
  router.put("/gift-cards/:id", authenticateToken, notForClients, asyncHandler(async (req, res) => {
    if (req.user.role !== "admin" && req.user.role !== "super_admin") {
      return res.status(403).json({ error: "Admins only" });
    }
    const { card_number, customer_name, client_id, sold_by_staff_id } = req.body;
    const { rows } = await pool.query(
      `UPDATE gift_cards
       SET card_number = $1, customer_name = $2, client_id = $3, sold_by_staff_id = $4
       WHERE id = $5 AND shop_id = $6
       RETURNING *`,
      [
        card_number,
        customer_name,
        client_id || null,
        sold_by_staff_id || null,
        req.params.id,
        req.shopId,
      ],
    );
    if (rows.length === 0)
      return res.status(404).json({ error: "Gift card not found" });
    res.json({ ...rows[0], status: giftCardStatus(rows[0]) });
  }));

  // Delete a gift card (admin only)
  router.delete("/gift-cards/:id", authenticateToken, notForClients, asyncHandler(async (req, res) => {
    if (req.user.role !== "admin" && req.user.role !== "super_admin") {
      return res.status(403).json({ error: "Admins only" });
    }
    const { rowCount } = await pool.query(
      `DELETE FROM gift_cards WHERE id = $1 AND shop_id = $2`,
      [req.params.id, req.shopId],
    );
    if (rowCount === 0)
      return res.status(404).json({ error: "Gift card not found" });
    res.json({ success: true });
  }));

  return router;
};
