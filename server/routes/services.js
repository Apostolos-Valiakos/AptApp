// Services and service categories: /api/v1/services, /service-categories.
// Moved out of server.js; helpers that still live there are handed over when
// it mounts this router (see "Area routers" near the end of server.js).
const express = require("express");
const { HttpError, asyncHandler, withTransaction } = require("../http");
const pool = require("../db");

module.exports = function servicesRouter({
  authenticateToken,
  notForClients,
  requireAnalyticsAccess,
  requireShopAdminAccess,
  safeUUID,
  SAUNA_HAMAM_BASE_NAMES,
}) {
  const router = express.Router();

  const SAUNA_HAMAM_PATTERN = /σαουνα|sauna|χαμ[αά]μ|χαμμαμ|ham+am/i;

  const stripAccentsLower = (s) =>
    (s || "")
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .trim();

  // Fallback combo-splitting for services with Σάουνα/Χαμάμ hardcoded into
  // their own name instead of an explicit combo configured (e.g. a Treatwell
  // import like "ΘΕΡΑΠΕΥΤΙΚΟ+SAUNA+SCRUB+ALOE"). Mutates `byService` in place,
  // adding a synthesized single-component entry — the real sauna/hamam "...ΣΕ
  // ΥΠΗΡΕΣΙΑ" service's own current price/duration/default_staff_id, so it
  // always reflects whatever that service is configured as, same as the
  // explicit combos already use. Only applies when the service has zero real
  // configured components, so an explicit combo always takes precedence, and
  // never applies to the sauna/hamam resource services themselves.
  const attachSaunaHamamFallback = (allServices, byService) => {
    const saunaBase = allServices.find(
      (s) => stripAccentsLower(s.name) === "σαουνα σε υπηρεσια",
    );
    const hamamBase = allServices.find(
      (s) => stripAccentsLower(s.name) === "ηαμαμ σε υπηρεσια",
    );
    const toComponent = (base) => ({
      id: base.id,
      name: base.name,
      duration_minutes: base.duration_minutes,
      price: base.price,
      default_staff_id: base.default_staff_id,
    });

    for (const service of allServices) {
      if (byService[service.id]?.length) continue; // explicit combo wins
      const normName = stripAccentsLower(service.name);
      if (SAUNA_HAMAM_BASE_NAMES.has(normName)) continue; // the resource itself
      if (!SAUNA_HAMAM_PATTERN.test(service.name)) continue;

      const isHamam = /χαμ[αά]μ|χαμμαμ|ham+am/i.test(service.name);
      const base = isHamam ? hamamBase : saunaBase;
      if (!base || base.id === service.id) continue;

      byService[service.id] = [toComponent(base)];
    }
  };

  // Replace-all upsert of a combo's component list — keeps combo config a
  // single ordered list of real service ids rather than a diffing dance.
  const setComboComponents = async (dbClient, serviceId, componentIds) => {
    await dbClient.query(
      "DELETE FROM service_combo_components WHERE service_id = $1",
      [serviceId],
    );
    const ids = (componentIds || [])
      .map((cid) => safeUUID(cid))
      .filter((cid) => cid && cid !== serviceId);
    for (let i = 0; i < ids.length; i++) {
      await dbClient.query(
        `INSERT INTO service_combo_components (service_id, component_service_id, sort_order)
         VALUES ($1, $2, $3) ON CONFLICT (service_id, component_service_id) DO NOTHING`,
        [serviceId, ids[i], i],
      );
    }
  };

  // Replace-all upsert of a service's variation list (e.g. "30 min" / "60
  // min" priced options) — same pattern as combo components.
  const setServiceVariations = async (dbClient, serviceId, variations) => {
    await dbClient.query("DELETE FROM service_variations WHERE service_id = $1", [
      serviceId,
    ]);
    const list = (variations || []).filter(
      (v) => v?.name?.trim() && Number(v.duration_minutes) > 0 && Number(v.price) >= 0,
    );
    for (let i = 0; i < list.length; i++) {
      await dbClient.query(
        `INSERT INTO service_variations (service_id, name, duration_minutes, price, sort_order)
         VALUES ($1, $2, $3, $4, $5)`,
        [serviceId, list[i].name.trim(), list[i].duration_minutes, list[i].price, i],
      );
    }
  };

  router.get("/services", authenticateToken, notForClients, asyncHandler(async (req, res) => {
    const { rows } = await pool.query(
      `SELECT s.*, COALESCE(sc.sort_order, 999999) AS category_sort_order, sc.color_code AS category_color_code
       FROM services s
       LEFT JOIN service_categories sc ON sc.shop_id = s.shop_id AND sc.name = s.category
       WHERE s.shop_id = $1 AND s.is_active = true
       ORDER BY category_sort_order, s.sort_order, s.name`,
      [req.shopId],
    );
    const { rows: eligibilityRows } = await pool.query(
      `SELECT st.id AS staff_id, s.id AS service_id
       FROM staff st
       CROSS JOIN services s
       WHERE st.shop_id = $1 AND s.shop_id = $1 AND st.is_active = true
       AND (
         NOT EXISTS (SELECT 1 FROM staff_services ss WHERE ss.staff_id = st.id)
         OR EXISTS (SELECT 1 FROM staff_services ss WHERE ss.staff_id = st.id AND ss.service_id = s.id)
       )`,
      [req.shopId],
    );
    const eligibleStaffByService = {};
    for (const row of eligibilityRows) {
      if (!eligibleStaffByService[row.service_id]) eligibleStaffByService[row.service_id] = [];
      eligibleStaffByService[row.service_id].push(row.staff_id);
    }
    const { rows: comboRows } = await pool.query(
      `SELECT scc.service_id, scc.sort_order, s.id, s.name, s.duration_minutes, s.price, s.default_staff_id
       FROM service_combo_components scc
       JOIN services s ON s.id = scc.component_service_id
       WHERE scc.service_id = ANY($1::uuid[])
       ORDER BY scc.service_id, scc.sort_order`,
      [rows.map((r) => r.id)],
    );
    const byService = {};
    for (const row of comboRows) {
      if (!byService[row.service_id]) byService[row.service_id] = [];
      byService[row.service_id].push({
        id: row.id,
        name: row.name,
        duration_minutes: row.duration_minutes,
        price: row.price,
        default_staff_id: row.default_staff_id,
      });
    }

    // Fallback auto-split for services that bake "Σάουνα"/"Χαμάμ" straight
    // into their own name (e.g. "ΘΕΡΑΠΕΥΤΙΚΟ+SAUNA+SCRUB+ALOE") instead of
    // having an explicit combo configured — only applies when NO real
    // components exist for that service, so any explicitly-configured combo
    // always wins. Carves out the real "...ΣΕ ΥΠΗΡΕΣΙΑ" sauna/hamam service's
    // own price/duration (same figures the 3 already-explicit combos use),
    // assigned to that resource's dedicated staff member.
    attachSaunaHamamFallback(rows, byService);
    const { rows: variationRows } = await pool.query(
      `SELECT * FROM service_variations WHERE service_id = ANY($1::uuid[]) ORDER BY service_id, sort_order`,
      [rows.map((r) => r.id)],
    );
    const variationsByService = {};
    for (const row of variationRows) {
      if (!variationsByService[row.service_id]) variationsByService[row.service_id] = [];
      variationsByService[row.service_id].push({
        id: row.id,
        name: row.name,
        duration_minutes: row.duration_minutes,
        price: row.price,
      });
    }
    res.json(
      rows.map((r) => ({
        ...r,
        combo_components: byService[r.id] || [],
        variations: variationsByService[r.id] || [],
        eligible_staff_ids: eligibleStaffByService[r.id] || [],
      })),
    );
  }));

  // Ensures `category` has a row in service_categories (appending it to the
  // end of the shop's category order the first time it's used), so a
  // brand-new category typed into the edit dialog is immediately draggable.
  const ensureCategoryExists = async (dbClient, shopId, category) => {
    if (!category?.trim()) return;
    const { rows } = await dbClient.query(
      "SELECT COALESCE(MAX(sort_order), -1) + 1 AS next FROM service_categories WHERE shop_id = $1",
      [shopId],
    );
    await dbClient.query(
      `INSERT INTO service_categories (shop_id, name, sort_order) VALUES ($1, $2, $3)
       ON CONFLICT (shop_id, name) DO NOTHING`,
      [shopId, category, rows[0].next],
    );
  };

  router.get("/service-categories", authenticateToken, notForClients, asyncHandler(async (req, res) => {
    const { rows } = await pool.query(
      "SELECT id, name, sort_order, color_code FROM service_categories WHERE shop_id = $1 ORDER BY sort_order",
      [req.shopId],
    );
    res.json(rows);
  }));

  // Renaming a category renames it on all its services too, so it keeps its
  // colour and position (both stored by name in service_categories). A name
  // another category already has (ignoring case) is refused.
  router.put("/service-categories/rename", authenticateToken, requireShopAdminAccess, asyncHandler(async (req, res) => {
    const from = String(req.body.from || "").trim();
    const to = String(req.body.to || "").trim().slice(0, 100);
    if (!from || !to) return res.status(400).json({ error: "from and to are required" });
    if (from === to) return res.json({ success: true, services: 0 });
    const result = await withTransaction(async (db) => {
      const taken = await db.query(
        `SELECT 1 FROM (
           SELECT name FROM service_categories WHERE shop_id = $1
           UNION SELECT category FROM services WHERE shop_id = $1 AND category IS NOT NULL
         ) n WHERE lower(trim(name)) = lower($2) AND trim(name) <> $3`,
        [req.shopId, to, from],
      );
      if (taken.rowCount > 0) throw new HttpError(409, { error: "category_exists" });
      await db.query("UPDATE service_categories SET name = $3 WHERE shop_id = $1 AND name = $2", [req.shopId, from, to]);
      const services = await db.query(
        "UPDATE services SET category = $3 WHERE shop_id = $1 AND trim(category) = $2",
        [req.shopId, from, to],
      );
      return { success: true, services: services.rowCount };
    });
    res.json(result);
  }, { log: "Rename category error:" }));

  router.put("/service-categories/color", authenticateToken, requireShopAdminAccess, asyncHandler(async (req, res) => {
    const { name, color_code } = req.body;
    if (!name?.trim()) return res.status(400).json({ error: "name is required" });
    if (color_code !== null && !/^#[0-9a-f]{6}$/i.test(color_code || "")) {
      return res.status(400).json({ error: "color_code must be a #rrggbb hex color or null" });
    }
    await pool.query(
      `INSERT INTO service_categories (shop_id, name, sort_order, color_code)
       VALUES ($1, $2, (SELECT COALESCE(MAX(sort_order), -1) + 1 FROM service_categories WHERE shop_id = $1), $3)
       ON CONFLICT (shop_id, name) DO UPDATE SET color_code = $3`,
      [req.shopId, name.trim(), color_code],
    );
    res.json({ success: true });
  }));

  router.put("/service-categories/reorder", authenticateToken, requireShopAdminAccess, asyncHandler(async (req, res) => {
    const { order } = req.body;
    if (!Array.isArray(order)) {
      return res.status(400).json({ error: "order must be an array of category names" });
    }
    const answer = await withTransaction(async (client) => {
      for (let i = 0; i < order.length; i++) {
        await client.query(
          `INSERT INTO service_categories (shop_id, name, sort_order) VALUES ($1, $2, $3)
           ON CONFLICT (shop_id, name) DO UPDATE SET sort_order = $3`,
          [req.shopId, order[i], i],
        );
      }
      return { success: true };
    });
    res.json(answer);
  }, { message: "Reorder failed" }));

  router.put("/services/reorder", authenticateToken, requireShopAdminAccess, asyncHandler(async (req, res) => {
    const { order } = req.body;
    if (!Array.isArray(order)) {
      return res.status(400).json({ error: "order must be an array of service ids" });
    }
    const answer = await withTransaction(async (client) => {
      for (let i = 0; i < order.length; i++) {
        const svcId = safeUUID(order[i]);
        if (!svcId) continue;
        await client.query(
          "UPDATE services SET sort_order = $1 WHERE id = $2 AND shop_id = $3",
          [i, svcId, req.shopId],
        );
      }
      return { success: true };
    });
    res.json(answer);
  }, { message: "Reorder failed" }));

  router.post("/services", authenticateToken, requireShopAdminAccess, asyncHandler(async (req, res) => {
    const {
      name,
      duration_minutes,
      price,
      category,
      color_code,
      bookable_online,
      default_staff_id,
      combo_component_ids,
      variations,
      staff_ids,
    } = req.body;

    if (!name?.trim()) {
      return res.status(400).json({ error: "Service name is required" });
    }
    if (!duration_minutes || Number(duration_minutes) <= 0) {
      return res
        .status(400)
        .json({ error: "Duration must be a positive number" });
    }
    if (price == null || Number(price) < 0) {
      return res
        .status(400)
        .json({ error: "Price must be a non-negative number" });
    }
    await ensureCategoryExists(pool, req.shopId, category);
    const { rows: sortRows } = await pool.query(
      "SELECT COALESCE(MAX(sort_order), -1) + 1 AS next FROM services WHERE shop_id = $1 AND category = $2",
      [req.shopId, category],
    );
    const { rows } = await pool.query(
      `INSERT INTO services (name, duration_minutes, price, category, color_code, shop_id, bookable_online, default_staff_id, sort_order)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING id`,
      [
        name,
        duration_minutes,
        price,
        category,
        color_code,
        req.shopId,
        !!bookable_online,
        safeUUID(default_staff_id),
        sortRows[0].next,
      ],
    );
    if (Array.isArray(combo_component_ids)) {
      await setComboComponents(pool, rows[0].id, combo_component_ids);
    }
    if (Array.isArray(variations)) {
      await setServiceVariations(pool, rows[0].id, variations);
    }
    if (Array.isArray(staff_ids)) {
      await setServiceStaffEligibility(pool, req.shopId, rows[0].id, staff_ids);
    }
    res.json({ success: true, id: rows[0].id });
  }));

  router.put("/services/:id", authenticateToken, requireShopAdminAccess, asyncHandler(async (req, res) => {
    const { id } = req.params;
    const {
      name,
      duration_minutes,
      price,
      category,
      color_code,
      bookable_online,
      default_staff_id,
      combo_component_ids,
      variations,
      staff_ids,
    } = req.body;
    await ensureCategoryExists(pool, req.shopId, category);
    await pool.query(
      `UPDATE services SET name=$1, duration_minutes=$2, price=$3, category=$4, color_code=$5, bookable_online=$6, default_staff_id=$7 WHERE id=$8 AND shop_id=$9`,
      [
        name,
        duration_minutes,
        price,
        category,
        color_code,
        !!bookable_online,
        safeUUID(default_staff_id),
        id,
        req.shopId,
      ],
    );
    if (Array.isArray(combo_component_ids)) {
      await setComboComponents(pool, id, combo_component_ids);
    }
    if (Array.isArray(variations)) {
      await setServiceVariations(pool, id, variations);
    }
    if (Array.isArray(staff_ids)) {
      await setServiceStaffEligibility(pool, req.shopId, id, staff_ids);
    }
    res.json({ success: true });
  }, { message: "Update failed" }));

  router.delete("/services/:id", authenticateToken, requireShopAdminAccess, async (req, res) => {
    try {
      await pool.query("DELETE FROM services WHERE id = $1 AND shop_id = $2", [
        req.params.id,
        req.shopId,
      ]);
      res.json({ success: true, archived: false });
    } catch (err) {
      if (err.code !== "23503") {
        console.error(err);
        return res.status(500).json({ error: "Internal server error" });
      }
      // Referenced by past bookings/packages/memberships (NO ACTION FKs) — keep
      // the row and hide it via is_active instead of breaking that history.
      await pool.query("UPDATE services SET is_active = false WHERE id = $1 AND shop_id = $2", [
        req.params.id,
        req.shopId,
      ]);
      res.json({ success: true, archived: true });
    }
  });

  // Replaces every recipe row for one service in a single call — the admin
  // page always submits the full current list for that service, same
  // wholesale-replace convention as e.g. staff working-hours saves.
  router.put(
    "/services/:id/recipes",
    authenticateToken,
    requireAnalyticsAccess,
    asyncHandler(async (req, res) => {
      const { id } = req.params;
      const recipes = Array.isArray(req.body.recipes) ? req.body.recipes : [];
      for (const r of recipes) {
        if (!["exact", "range", "bottle"].includes(r.amount_type)) {
          return res.status(400).json({ error: `Invalid amount_type: ${r.amount_type}` });
        }
        if (r.amount_type === "range" && !(r.amount_min < r.amount_max)) {
          return res.status(400).json({ error: "Range minimum must be less than maximum" });
        }
      }
      const answer = await withTransaction(async (client) => {
      await client.query(
          `DELETE FROM service_product_recipes WHERE service_id = $1 AND shop_id = $2`,
          [id, req.shopId],
        );
        for (const r of recipes) {
          await client.query(
            `INSERT INTO service_product_recipes
               (service_id, product_inventory_id, shop_id, amount_type, amount_value, amount_min, amount_max)
             VALUES ($1, $2, $3, $4, $5, $6, $7)`,
            [
              id,
              r.product_inventory_id,
              req.shopId,
              r.amount_type,
              r.amount_type === "range" ? null : r.amount_value,
              r.amount_type === "range" ? r.amount_min : null,
              r.amount_type === "range" ? r.amount_max : null,
            ],
          );
        }
        return { success: true };
    });
    res.json(answer);
  }),
  );

  // Sets exactly which staff are eligible for `serviceId`, safely preserving
  // each staff member's existing eligibility for every OTHER service.
  // staff_services' only convention (see assertStaffAvailable / self-booking
  // eligibility checks) is "a staff member with zero rows at all is eligible
  // for everything" — a GLOBAL per-staff flag, not decomposable per-service.
  // So a staff member who is currently unrestricted and is being EXCLUDED from
  // this one service must first have their eligibility for every OTHER active
  // service materialized into explicit rows — otherwise simply not inserting a
  // row for this service would flip them to "restricted" and silently make
  // them ineligible for every other service too.
  const setServiceStaffEligibility = async (dbClient, shopId, serviceId, staffIds) => {
    const allStaffRes = await dbClient.query(
      "SELECT id FROM staff WHERE shop_id = $1 AND is_active = true",
      [shopId],
    );
    const checkedSet = new Set(staffIds);

    const otherServicesRes = await dbClient.query(
      "SELECT id FROM services WHERE shop_id = $1 AND id != $2",
      [shopId, serviceId],
    );
    const otherServiceIds = otherServicesRes.rows.map((r) => r.id);

    for (const { id: staffId } of allStaffRes.rows) {
      const isChecked = checkedSet.has(staffId);
      const existingRes = await dbClient.query(
        "SELECT 1 FROM staff_services WHERE staff_id = $1 LIMIT 1",
        [staffId],
      );
      const isCurrentlyUnrestricted = existingRes.rows.length === 0;

      if (!isChecked) {
        if (isCurrentlyUnrestricted && otherServiceIds.length > 0) {
          for (const otherId of otherServiceIds) {
            await dbClient.query(
              `INSERT INTO staff_services (staff_id, service_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
              [staffId, otherId],
            );
          }
        }
        await dbClient.query(
          "DELETE FROM staff_services WHERE staff_id = $1 AND service_id = $2",
          [staffId, serviceId],
        );
      } else if (!isCurrentlyUnrestricted) {
        await dbClient.query(
          `INSERT INTO staff_services (staff_id, service_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
          [staffId, serviceId],
        );
      }
      // else: checked and already unrestricted -> already implicitly eligible, no row needed.
    }
  };

  return router;
};
