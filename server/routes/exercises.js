// Exercises: /api/v1/exercises.
// Moved out of server.js; helpers that still live there are handed over when
// it mounts this router (see "Area routers" near the end of server.js).
const express = require("express");
const { asyncHandler } = require("../http");
const pool = require("../db");

module.exports = function exercisesRouter({
  authenticateToken,
  notForClients,
}) {
  const router = express.Router();

  router.get("/exercises", authenticateToken, notForClients, asyncHandler(async (req, res) => {
    const { rows } = await pool.query(
      `SELECT * FROM exercises WHERE shop_id = $1 ORDER BY category, name`,
      [req.shopId],
    );
    res.json(rows);
  }));

  // 2. Create a New Exercise (Master List)
  router.post("/exercises", authenticateToken, notForClients, asyncHandler(async (req, res) => {
    const { name, category, description } = req.body;
    const { rows } = await pool.query(
      `INSERT INTO exercises (shop_id, name, category, description) 
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [req.shopId, name, category || "General", description],
    );
    res.json(rows[0]);
  }));

  router.delete("/exercises/:id", authenticateToken, notForClients, asyncHandler(async (req, res) => {
    const { id } = req.params;

    // Security Check: Only allow Admins/Super Admins
    if (req.user.role !== "admin" && req.user.role !== "super_admin" && req.user.role !== "frontdesk") {
      return res.status(403).json({ error: "Unauthorized: Admins only" });
    }
    const result = await pool.query(
      "DELETE FROM exercises WHERE id = $1 AND shop_id = $2 RETURNING *",
      [id, req.shopId],
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ error: "Exercise not found" });
    }

    res.json({ success: true, message: "Exercise deleted" });
  }, { message: "Failed to delete exercise" }));

  return router;
};
