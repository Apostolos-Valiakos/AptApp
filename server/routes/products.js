// Products, stock and product usage: /api/v1/products, /inventory, /product-inventory, /product-usage.
// Moved out of server.js; helpers that still live there are handed over when
// it mounts this router (see "Area routers" near the end of server.js).
const express = require("express");
const { asyncHandler, withTransaction } = require("../http");
const pool = require("../db");

module.exports = function productsRouter({
  authenticateToken,
  notForClients,
  requireAnalyticsAccess,
  requireShopAdminAccess,
}) {
  const router = express.Router();

  router.get(
    "/product-usage/recipes",
    authenticateToken,
    requireAnalyticsAccess,
    asyncHandler(async (req, res) => {
      const { rows } = await pool.query(
        `SELECT spr.id, spr.service_id, s.name AS service_name,
                spr.product_inventory_id, p.name AS product_name, pi.variation_name,
                spr.amount_type, spr.amount_value, spr.amount_min, spr.amount_max
         FROM service_product_recipes spr
         JOIN services s ON s.id = spr.service_id
         JOIN product_inventory pi ON pi.id = spr.product_inventory_id
         JOIN products p ON p.id = pi.product_id
         WHERE spr.shop_id = $1
         ORDER BY s.name, p.name`,
        [req.shopId],
      );
      res.json(rows);
    }),
  );

  router.post(
    "/product-inventory/:id/stocktake",
    authenticateToken,
    requireAnalyticsAccess,
    asyncHandler(async (req, res) => {
      const { remaining_amount_ml, restocked_amount_ml, notes } = req.body;
      if (remaining_amount_ml == null || Number(remaining_amount_ml) < 0) {
        return res.status(400).json({ error: "remaining_amount_ml is required and must be >= 0" });
      }
      const invRow = await pool.query(
        `SELECT p.shop_id FROM product_inventory pi JOIN products p ON p.id = pi.product_id WHERE pi.id = $1`,
        [req.params.id],
      );
      if (!invRow.rows[0] || invRow.rows[0].shop_id !== req.shopId) {
        return res.status(404).json({ error: "Product not found" });
      }
      await pool.query(
        `INSERT INTO product_usage_stocktakes
           (product_inventory_id, shop_id, remaining_amount_ml, restocked_amount_ml, notes, recorded_by_user_id)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [req.params.id, req.shopId, remaining_amount_ml, restocked_amount_ml || 0, notes || null, req.user.userId],
      );
      res.json({ success: true });
    }),
  );

  router.get(
    "/product-inventory/:id/stocktakes",
    authenticateToken,
    requireAnalyticsAccess,
    asyncHandler(async (req, res) => {
      const { rows } = await pool.query(
        `SELECT id, recorded_at, remaining_amount_ml, restocked_amount_ml, notes
         FROM product_usage_stocktakes
         WHERE product_inventory_id = $1 AND shop_id = $2
         ORDER BY recorded_at DESC LIMIT 50`,
        [req.params.id, req.shopId],
      );
      res.json(rows);
    }),
  );

  // Get all products with their inventory variations for a shop
  router.get("/products", authenticateToken, notForClients, asyncHandler(async (req, res) => {
    const { rows } = await pool.query(
      `SELECT p.id, p.name, p.description, 
        json_agg(
          json_build_object(
            'id', pi.id, 
            'variation_name', pi.variation_name, 
            'price', pi.price,
            'stock_quantity', pi.stock_quantity
          ) ORDER BY pi.price ASC
        ) as variations
       FROM products p
       LEFT JOIN product_inventory pi ON p.id = pi.product_id
       WHERE p.shop_id = $1
       GROUP BY p.id, p.name
       ORDER BY p.name ASC`,
      [req.shopId],
    );
    res.json(rows);
  }));

  // Create a new product with variations
  router.post("/products", authenticateToken, requireShopAdminAccess, asyncHandler(async (req, res) => {
    const { name, description, variations } = req.body; // variations is an array
    const answer = await withTransaction(async (client) => {
      const productRes = await client.query(
        `INSERT INTO products (name, description, shop_id) VALUES ($1, $2, $3) RETURNING id`,
        [name, description, req.shopId],
      );
      const productId = productRes.rows[0].id;

      for (const v of variations) {
        await client.query(
          `INSERT INTO product_inventory (product_id, variation_name, price, stock_quantity)
           VALUES ($1, $2, $3, $4)`,
          [productId, v.variation_name, v.price, v.stock_quantity],
        );
      }

      return { success: true, productId };
    });
    res.json(answer);
  }));

  // Update stock (Simple increment/decrement)
  router.patch(
    "/inventory/:id/stock",
    authenticateToken, requireShopAdminAccess,
    asyncHandler(async (req, res) => {
      const { quantity } = req.body; // can be negative to subtract
      const { rows } = await pool.query(
        `UPDATE product_inventory
       SET stock_quantity = stock_quantity + $1
       WHERE id = $2 RETURNING stock_quantity, product_id`,
        [quantity, req.params.id],
      );
      if (rows[0]) {
        const invRow = await pool.query(
          `SELECT p.shop_id FROM products p WHERE p.id = $1`,
          [rows[0].product_id],
        );
        // Logged so bottle-type recipes' "actual usage" report can be computed
        // from something other than a live, unhistoried number — see the
        // product_stock_adjustments table comment at startup.
        await pool.query(
          `INSERT INTO product_stock_adjustments (product_inventory_id, shop_id, delta, recorded_by_user_id)
           VALUES ($1, $2, $3, $4)`,
          [req.params.id, invRow.rows[0]?.shop_id, quantity, req.user.userId],
        );
      }
      res.json(rows[0]);
    }, { message: "Insufficient stock or update failed" }),
  );

  router.put("/products/:id", authenticateToken, requireShopAdminAccess, asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { name, description, variations } = req.body;
    const answer = await withTransaction(async (client) => {
      await client.query(
        `UPDATE products SET name = $1, description = $2, updated_at = NOW()
         WHERE id = $3 AND shop_id = $4`,
        [name, description, id, req.shopId],
      );

      // 2. Handle variations
      for (const v of variations) {
        if (v.id && !String(v.id).startsWith("temp-")) {
          // Update existing variation
          await client.query(
            `UPDATE product_inventory
             SET variation_name = $1, price = $2, stock_quantity = $3, updated_at = NOW()
             WHERE id = $4 AND product_id = $5`,
            [v.variation_name, v.price, v.stock_quantity, v.id, id],
          );
        } else {
          // Insert new variation added during edit
          await client.query(
            `INSERT INTO product_inventory (product_id, variation_name, price, stock_quantity)
             VALUES ($1, $2, $3, $4)`,
            [id, v.variation_name, v.price, v.stock_quantity],
          );
        }
      }

      return { success: true };
    });
    res.json(answer);
  }));

  router.delete("/products/:id", authenticateToken, requireShopAdminAccess, asyncHandler(async (req, res) => {
    const { id } = req.params;
    // Ensure the product belongs to the user's shop for security
    const result = await pool.query(
      "DELETE FROM products WHERE id = $1 AND shop_id = $2",
      [id, req.shopId],
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ error: "Product not found" });
    }

    res.json({ success: true });
  }, { log: "Delete Product Error:", message: "Failed to delete product" }));

  return router;
};
