// The AI assistant's side of the API: the shop's on/off switch (admins) and
// /ai/context, which the AI service (ai/) calls with the client's own token to
// learn who is asking. The service holds no JWT secret and no database access;
// every change it proposes is made by the client's browser through the
// ordinary portal routes, after the client presses Confirm.
const express = require("express");
const rateLimit = require("express-rate-limit");
const { asyncHandler } = require("../http");
const pool = require("../db");

module.exports = function aiRouter({ authenticateToken, requireAnalyticsAccess }) {
  const router = express.Router();

  // One count per chat message (the service calls /ai/context once per
  // message): 30 an hour per client. Staff calls aren't limited.
  const aiChatLimiter = rateLimit({
    windowMs: 60 * 60 * 1000,
    max: 30,
    keyGenerator: (req) => `ai:${req.user.clientId}`,
    skip: (req) => req.user.role !== "client",
    message: { error: "ai_rate_limited" },
    standardHeaders: true,
    legacyHeaders: false,
  });

  router.put("/shop/ai-assistant", authenticateToken, requireAnalyticsAccess, asyncHandler(async (req, res) => {
    await pool.query("UPDATE shops SET ai_assistant_enabled = $1 WHERE id = $2", [req.body.ai_assistant_enabled === true, req.shopId]);
    res.json({ success: true });
  }, { log: "AI assistant setting error:" }));

  router.get("/ai/context", authenticateToken, aiChatLimiter, asyncHandler(async (req, res) => {
    const { rows } = await pool.query(
      "SELECT name, ai_assistant_enabled, self_booking_enabled FROM shops WHERE id = $1",
      [req.shopId],
    );
    const shop = rows[0];
    if (!shop) return res.status(404).json({ error: "shop_not_found" });
    let clientFirstName = null;
    if (req.user.role === "client" && req.user.clientId) {
      const client = await pool.query("SELECT first_name FROM clients WHERE id = $1 AND shop_id = $2", [req.user.clientId, req.shopId]);
      clientFirstName = client.rows[0]?.first_name || null;
    }
    res.json({
      role: req.user.role,
      client_id: req.user.clientId || null,
      shop_id: req.shopId,
      shop_name: shop.name,
      client_first_name: clientFirstName,
      ai_assistant_enabled: shop.ai_assistant_enabled,
      self_booking_enabled: shop.self_booking_enabled,
      timezone: process.env.TZ || "Europe/Athens",
    });
  }, { log: "AI context error:" }));

  return router;
};
