// Contests: /api/v1/contests.
// Moved out of server.js; helpers that still live there are handed over when
// it mounts this router (see "Area routers" near the end of server.js).
const express = require("express");
const { asyncHandler } = require("../http");
const pool = require("../db");

module.exports = function contestsRouter({
  authenticateToken,
  dbFileUpload,
  notForClients,
}) {
  const router = express.Router();

  // List all contests for the shop (admin)
  router.get("/contests", authenticateToken, notForClients, asyncHandler(async (req, res) => {
    if (req.user.role !== "admin" && req.user.role !== "super_admin") {
      return res.status(403).json({ error: "Admins only" });
    }
    const { rows } = await pool.query(
      `SELECT id, name, description, start_date, end_date, image_url, created_at
       FROM contests WHERE shop_id = $1 ORDER BY start_date DESC`,
      [req.shopId],
    );
    res.json(rows);
  }));

  // Get active contest + client entry count (authenticated)
  router.get("/contests/active", authenticateToken, asyncHandler(async (req, res) => {
    const { rows } = await pool.query(
      `SELECT id, name, description, start_date, end_date, image_url
       FROM contests
       WHERE shop_id = $1 AND NOW() BETWEEN start_date AND end_date
       ORDER BY start_date DESC LIMIT 1`,
      [req.shopId],
    );
    if (rows.length === 0) return res.json(null);

    const contest = rows[0];
    const clientId = req.user.clientId || req.query.client_id;

    // Entries now come exclusively from QR-scan check-ins at the front desk
    // (contest_entries) — the old "1 entry per completed+paid appointment"
    // auto-count has been retired entirely.
    let entries = 0;
    if (clientId) {
      const entryRes = await pool.query(
        `SELECT COUNT(*) FROM contest_entries WHERE contest_id = $1 AND client_id = $2`,
        [contest.id, clientId],
      );
      entries = parseInt(entryRes.rows[0].count) || 0;
    }

    res.json({ ...contest, entries });
  }));

  // Create contest (admin) — image is optional
  router.post(
    "/contests",
    authenticateToken, notForClients,
    dbFileUpload.single("image"),
    asyncHandler(async (req, res) => {
      if (req.user.role !== "admin" && req.user.role !== "super_admin") {
        return res.status(403).json({ error: "Admins only" });
      }
      const { name, description, start_date, end_date } = req.body;
      if (!name || !start_date || !end_date) {
        return res
          .status(400)
          .json({ error: "name, start_date and end_date are required" });
      }
      const imageUrl = req.file
        ? `data:${req.file.mimetype};base64,${req.file.buffer.toString("base64")}`
        : null;
      const { rows } = await pool.query(
        `INSERT INTO contests (shop_id, name, description, start_date, end_date, image_url)
         VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
        [req.shopId, name, description || null, start_date, end_date, imageUrl],
      );
      res.json(rows[0]);
    }),
  );

  // Update contest (admin) — image is optional
  router.put(
    "/contests/:id",
    authenticateToken, notForClients,
    dbFileUpload.single("image"),
    asyncHandler(async (req, res) => {
      if (req.user.role !== "admin" && req.user.role !== "super_admin") {
        return res.status(403).json({ error: "Admins only" });
      }
      const { name, description, start_date, end_date } = req.body;
      const imageUrl = req.file
        ? `data:${req.file.mimetype};base64,${req.file.buffer.toString("base64")}`
        : undefined;
      const setClauses = [
        "name = $2",
        "description = $3",
        "start_date = $4",
        "end_date = $5",
      ];
      const params = [
        req.params.id,
        name,
        description || null,
        start_date,
        end_date,
        req.shopId,
      ];

      if (imageUrl !== undefined) {
        setClauses.push(`image_url = $${params.length}`);
        params.splice(params.length - 1, 0, imageUrl);
      }

      const { rows } = await pool.query(
        `UPDATE contests SET ${setClauses.join(", ")}
         WHERE id = $1 AND shop_id = $${params.length} RETURNING *`,
        params,
      );
      if (rows.length === 0)
        return res.status(404).json({ error: "Contest not found" });
      res.json(rows[0]);
    }),
  );

  // Delete contest (admin)
  router.delete("/contests/:id", authenticateToken, notForClients, asyncHandler(async (req, res) => {
    if (req.user.role !== "admin" && req.user.role !== "super_admin") {
      return res.status(403).json({ error: "Admins only" });
    }
    const { rowCount } = await pool.query(
      `DELETE FROM contests WHERE id = $1 AND shop_id = $2`,
      [req.params.id, req.shopId],
    );
    if (rowCount === 0)
      return res.status(404).json({ error: "Contest not found" });
    res.json({ success: true });
  }));

  return router;
};
