// Payments routes (/api/v1/transactions*), moved out of server.js unchanged.
// Helpers that still live in server.js are handed over when it mounts this
// router (see "Area routers" near the end of server.js).
const express = require("express");
const crypto = require("crypto");
const { HttpError, asyncHandler, withTransaction } = require("../http");

module.exports = function transactionsRouter({
  authenticateToken,
  canSellExtras,
  checkIdempotency,
  pool,
  recalculateClientBalance,
  safeUUID,
  saveIdempotency,
}) {
  const router = express.Router();

  router.post("/", authenticateToken, asyncHandler(async (req, res) => {
    const {
      appointment_id,
      appointment_ids, // string[] | undefined — explicit ordered list for a combined same-day payment; appointment_id must be one of its entries
      client_id,
      amount,
      payment_method = "card",
      gift_card_id,
      redemptions, // [{ service_id, count }] — required when payment_method === 'membership'
      amount2,
      payment_method2,
      gift_card_id2,
      redemptions2,
      package_purchases, // [{ package_type_id }] — sold alongside this payment, same leg1 method
      gift_card_purchases, // [{ card_number, customer_name, initial_amount }] — same idea, for gift cards
    } = req.body;

    const hasPackagePurchases =
      Array.isArray(package_purchases) && package_purchases.length > 0;
    const hasGiftCardPurchases =
      Array.isArray(gift_card_purchases) && gift_card_purchases.length > 0;
    const hasExtras = hasPackagePurchases || hasGiftCardPurchases;

    // Membership legs derive their own amount server-side from validated
    // quota redemptions — the client never gets to assert an amount for them.
    // An extras-only payment (service already fully paid, or amount = 0) is
    // valid, so the amount requirement is waived when packages/gift cards are
    // attached.
    if (
      payment_method !== "membership" &&
      !hasExtras &&
      (!amount || Number(amount) <= 0)
    ) {
      return res.status(400).json({ error: "Invalid payment amount" });
    }
    if (hasExtras && !["cash", "card", "bank-transfer"].includes(payment_method)) {
      return res.status(400).json({ error: "Packages and gift cards can only be purchased with cash, card, or bank transfer" });
    }
    if (hasExtras && !canSellExtras(req.user)) {
      return res.status(403).json({ error: "Not allowed to sell packages or gift cards" });
    }
    if (payment_method === "gift-card" && !gift_card_id) {
      return res
        .status(400)
        .json({ error: "gift_card_id is required for gift-card payments" });
    }
    if (payment_method === "membership" && (!redemptions || !redemptions.length)) {
      return res.status(400).json({ error: "redemptions is required for membership payments" });
    }
    const hasSecondLeg =
      (amount2 !== undefined && amount2 !== null && Number(amount2) > 0) ||
      (payment_method2 === "membership" && redemptions2 && redemptions2.length > 0);
    if (hasSecondLeg) {
      if (!payment_method2) {
        return res
          .status(400)
          .json({ error: "payment_method2 is required when amount2 is set" });
      }
      if (payment_method2 === "gift-card" && !gift_card_id2) {
        return res
          .status(400)
          .json({
            error: "gift_card_id2 is required for a gift-card second payment",
          });
      }
      if (payment_method2 === "membership" && (!redemptions2 || !redemptions2.length)) {
        return res.status(400).json({ error: "redemptions2 is required for a membership second payment" });
      }
    }

    // A combined same-day payment: explicit, caller-ordered list of every
    // appointment this one payment covers (the primary appointment_id plus
    // any selected same-day siblings). Validated up front — every id must be
    // real, belong to this client+shop, and be active — so a bad id rejects
    // the whole request before any DB write, rather than silently applying a
    // partial payment. appointment_id (singular) is still always required and
    // must be one of the list's entries, since membership redemption (below)
    // only ever targets it specifically, never the rest of the list.
    let validatedApptIds = null;
    if (Array.isArray(appointment_ids) && appointment_ids.length > 0) {
      const ids = appointment_ids.map(safeUUID);
      if (ids.some((id) => !id)) {
        return res.status(400).json({ error: "Invalid appointment_ids" });
      }
      if (!ids.includes(appointment_id)) {
        return res.status(400).json({ error: "appointment_id must be included in appointment_ids" });
      }
      const checkRes = await pool.query(
        `SELECT id FROM appointments WHERE id = ANY($1::uuid[]) AND client_id = $2 AND shop_id = $3
           AND status NOT IN ('cancelled', 'no-show')`,
        [ids, client_id, req.shopId],
      );
      if (checkRes.rows.length !== ids.length) {
        return res.status(400).json({ error: "One or more appointments are invalid, cancelled, or belong to a different client" });
      }
      validatedApptIds = ids;
    }

    const idempotencyKey = req.headers["idempotency-key"] || null;
    const { status, body } = await withTransaction(async (client) => {

      // Processes ONE payment leg against the client's current owed appointments
      // (current appointment first, then oldest debt first). Re-reads owed state
      // fresh on every call, so calling it twice in sequence for a split payment
      // naturally continues the FIFO allocation from where the first leg left off.
      // Returns an error message string on failure, or null on success.
      const processLeg = async ({
        legAmount,
        legMethod,
        legGiftCardId,
        splitGroupId,
      }) => {
        if (legMethod === "gift-card") {
          const cardRes = await client.query(
            `SELECT * FROM gift_cards WHERE id = $1 AND shop_id = $2`,
            [legGiftCardId, req.shopId],
          );
          if (cardRes.rows.length === 0) return "Gift card not found";
          const card = cardRes.rows[0];
          if (new Date(card.expires_at) < new Date())
            return "This gift card has expired";
          if (Number(legAmount) > Number(card.remaining_balance) + 0.01) {
            return `Amount exceeds the card's remaining balance (€${Number(card.remaining_balance).toFixed(2)})`;
          }
        }

        const applyPaymentToAppointment = async (apptId, paymentAmount) => {
          await client.query(
            `INSERT INTO transactions (appointment_id, client_id, amount, payment_method, transaction_type, shop_id, gift_card_id, split_group_id, created_at)
             VALUES ($1, $2, $3, $4, 'payment', $5, $6, $7, NOW())`,
            [
              apptId,
              client_id,
              paymentAmount,
              legMethod,
              req.shopId,
              legGiftCardId || null,
              splitGroupId,
            ],
          );

          const priceRes = await client.query(
            `SELECT
               COALESCE((SELECT SUM(price_override) FROM appointment_services WHERE appointment_id = $1), 0)
               + COALESCE((SELECT SUM(total_price) FROM product_sales WHERE appointment_id = $1), 0) as total_price`,
            [apptId],
          );
          const totalPrice = Number(priceRes.rows[0].total_price);

          const alreadyPaidRes = await client.query(
            `SELECT COALESCE(SUM(amount), 0) as paid
             FROM transactions WHERE appointment_id = $1`,
            [apptId],
          );
          const totalPaid = Number(alreadyPaidRes.rows[0].paid);

          const isFullyPaid = totalPaid >= totalPrice - 0.01;
          await client.query(
            `UPDATE appointments
             SET payment_status = $1,
                 status = CASE WHEN status = 'completed' THEN 'completed' ELSE $2 END,
                 deposit_amount = deposit_amount + $3
             WHERE id = $4 AND shop_id = $5`,
            [
              isFullyPaid ? "paid" : "partial",
              isFullyPaid ? "completed" : "confirmed",
              paymentAmount,
              apptId,
              req.shopId,
            ],
          );
        };

        // Explicit list this payment is clearly for — the single appointment_id
        // when no combined-day list was given (degenerates to exactly today's
        // single-row lookup), or appointment_id + its selected same-day siblings
        // in caller-supplied order. Either way, paid down first before any
        // remainder falls through to the old-debt FIFO loop below.
        const explicitIds = validatedApptIds && validatedApptIds.length
          ? validatedApptIds
          : [appointment_id];

        const explicitRowsRes = await client.query(
          `SELECT
             a.id,
             COALESCE(SUM(aps.price_override), 0)
               + COALESCE((SELECT SUM(total_price) FROM product_sales WHERE appointment_id = a.id), 0) as total_cost,
             COALESCE((SELECT SUM(t2.amount) FROM transactions t2 WHERE t2.appointment_id = a.id), 0) as total_paid
           FROM appointments a
           JOIN appointment_services aps ON aps.appointment_id = a.id
           WHERE a.id = ANY($1::uuid[]) AND a.shop_id = $2
           GROUP BY a.id`,
          [explicitIds, req.shopId],
        );
        // SQL's ANY() doesn't preserve array order — re-sort to match explicitIds
        // so allocation happens in the caller-supplied order (primary first).
        const explicitRowsById = new Map(
          explicitRowsRes.rows.map((row) => [row.id, row]),
        );
        const explicitRows = explicitIds
          .map((id) => explicitRowsById.get(id))
          .filter(Boolean);

        const explicitOwedTotal = explicitRows.reduce(
          (sum, row) =>
            sum + Math.max(0, Number(row.total_cost) - Number(row.total_paid)),
          0,
        );

        // Other unpaid appointments (oldest first, March 1 2026+), excluding
        // whatever's already covered by explicitRows above so nothing is ever
        // double-paid. Completed appointments are included: marking one
        // completed must not make its debt uncollectable (the balance formula
        // counts it too).
        const oldAppts = await client.query(
          `SELECT
             a.id,
             COALESCE(SUM(aps.price_override), 0)
               + COALESCE((SELECT SUM(total_price) FROM product_sales WHERE appointment_id = a.id), 0) as total_cost,
             COALESCE((SELECT SUM(t2.amount) FROM transactions t2 WHERE t2.appointment_id = a.id), 0) as total_paid
           FROM appointments a
           JOIN appointment_services aps ON aps.appointment_id = a.id
           WHERE a.client_id = $1
             AND a.id != ALL($2::uuid[])
             AND a.shop_id = $3
             AND a.status != 'cancelled'
             AND (SELECT MIN(start_time) FROM appointment_services WHERE appointment_id = a.id) >= '2026-03-01 00:00:00'
           GROUP BY a.id
           ORDER BY (SELECT MIN(start_time) FROM appointment_services WHERE appointment_id = a.id) ASC`,
          [client_id, explicitIds, req.shopId],
        );

        const oldOwedTotal = oldAppts.rows.reduce(
          (sum, row) =>
            sum + Math.max(0, Number(row.total_cost) - Number(row.total_paid)),
          0,
        );
        const totalOwed = explicitOwedTotal + oldOwedTotal;
        if (Number(legAmount) > totalOwed + 0.01) {
          return `Amount exceeds total owed (€${totalOwed.toFixed(2)}). Refresh and try again.`;
        }

        // Allocate: pay the explicit list first (caller-supplied order), then
        // apply any remainder to old debt (FIFO).
        let remaining = Number(legAmount);

        for (const row of explicitRows) {
          if (remaining <= 0.009) break;
          const owed = Math.max(0, Number(row.total_cost) - Number(row.total_paid));
          if (owed <= 0.009) continue;
          const forThisAppt = Math.min(remaining, owed);
          await applyPaymentToAppointment(row.id, forThisAppt);
          remaining -= forThisAppt;
        }

        for (const row of oldAppts.rows) {
          if (remaining <= 0.009) break;
          const owed = Number(row.total_cost) - Number(row.total_paid);
          if (owed <= 0.009) continue;

          const forThisAppt = Math.min(remaining, owed);
          await applyPaymentToAppointment(row.id, forThisAppt);
          remaining -= forThisAppt;
        }

        if (legMethod === "gift-card") {
          const deductRes = await client.query(
            `UPDATE gift_cards SET remaining_balance = remaining_balance - $1
             WHERE id = $2 AND remaining_balance >= $1
             RETURNING id`,
            [Number(legAmount), legGiftCardId],
          );
          if (deductRes.rows.length === 0) {
            return "Gift card balance changed — please retry";
          }
        }

        return null;
      };

      // Membership redemption is deliberately its own path rather than a variant
      // of processLeg above: it only ever pays for services in THIS appointment
      // (never old debt — quota is tied to specific covered services in this
      // visit), and its "amount" is derived from validated quota usage, not
      // asserted by the client. Mirrors applyPaymentToAppointment's bookkeeping
      // (transactions row + appointment payment_status/deposit_amount) without
      // touching the FIFO cash/card/gift-card logic above at all.
      const processMembershipLeg = async (redemptionList, splitGroupId) => {
        const membershipRes = await client.query(
          `SELECT * FROM client_memberships WHERE client_id = $1 AND shop_id = $2 AND status = 'active'`,
          [client_id, req.shopId],
        );
        if (membershipRes.rows.length === 0) return { error: "No active membership found for this client" };
        const membership = membershipRes.rows[0];

        const tierServicesRes = await client.query(
          `SELECT service_id, quota_per_month FROM membership_tier_services WHERE tier_id = $1`,
          [membership.tier_id],
        );
        const coverage = new Map(tierServicesRes.rows.map((r) => [r.service_id, r.quota_per_month]));

        let totalAmount = 0;
        const usageRowsToInsert = []; // { service_id }

        for (const redemption of redemptionList) {
          const { service_id, count } = redemption;
          const qty = Number(count) || 0;
          if (qty <= 0) continue;

          if (!coverage.has(service_id)) {
            return { error: "One of the selected services isn't covered by this membership" };
          }
          const quotaPerMonth = coverage.get(service_id);

          if (quotaPerMonth !== null) {
            const usedRes = await client.query(
              `SELECT COUNT(*) FROM membership_usage
               WHERE client_membership_id = $1 AND service_id = $2 AND used_at >= date_trunc('month', NOW())`,
              [membership.id, service_id],
            );
            const usedThisMonth = parseInt(usedRes.rows[0].count);
            if (usedThisMonth + qty > quotaPerMonth) {
              return { error: "Not enough remaining membership quota for one of the selected services" };
            }
          }

          const apptServicesRes = await client.query(
            `SELECT id, COALESCE(price_override, (SELECT price FROM services WHERE id = $2)) as price
             FROM appointment_services WHERE appointment_id = $1 AND service_id = $2
             ORDER BY id LIMIT $3`,
            [appointment_id, service_id, qty],
          );
          if (apptServicesRes.rows.length < qty) {
            return { error: "This appointment doesn't have that many occurrences of one of the selected services" };
          }

          for (const row of apptServicesRes.rows) {
            totalAmount += Number(row.price);
            usageRowsToInsert.push({ service_id });
          }
        }

        if (usageRowsToInsert.length === 0) {
          return { error: "Nothing was selected to redeem via membership" };
        }

        for (const usage of usageRowsToInsert) {
          await client.query(
            `INSERT INTO membership_usage (client_membership_id, service_id, appointment_id, used_at)
             VALUES ($1, $2, $3, NOW())`,
            [membership.id, usage.service_id, appointment_id],
          );
        }

        await client.query(
          `INSERT INTO transactions (appointment_id, client_id, amount, payment_method, transaction_type, shop_id, split_group_id, created_at)
           VALUES ($1, $2, $3, 'membership', 'payment', $4, $5, NOW())`,
          [appointment_id, client_id, totalAmount, req.shopId, splitGroupId],
        );

        const priceRes = await client.query(
          `SELECT
             COALESCE((SELECT SUM(price_override) FROM appointment_services WHERE appointment_id = $1), 0)
             + COALESCE((SELECT SUM(total_price) FROM product_sales WHERE appointment_id = $1), 0) as total_price`,
          [appointment_id],
        );
        const totalPrice = Number(priceRes.rows[0].total_price);

        const alreadyPaidRes = await client.query(
          `SELECT COALESCE(SUM(amount), 0) as paid FROM transactions WHERE appointment_id = $1`,
          [appointment_id],
        );
        const totalPaid = Number(alreadyPaidRes.rows[0].paid);
        const isFullyPaid = totalPaid >= totalPrice - 0.01;

        await client.query(
          `UPDATE appointments
           SET payment_status = $1,
               status = CASE WHEN status = 'completed' THEN 'completed' ELSE $2 END,
               deposit_amount = deposit_amount + $3
           WHERE id = $4 AND shop_id = $5`,
          [
            isFullyPaid ? "paid" : "partial",
            isFullyPaid ? "completed" : "confirmed",
            totalAmount,
            appointment_id,
            req.shopId,
          ],
        );

        return { error: null };
      };


      const cached = await checkIdempotency(client, idempotencyKey, req.shopId);
      if (cached) return { status: cached.response_status, body: cached.response_body };

      // A shared id links both rows of a split payment so reports can flag them
      const splitGroupId = hasSecondLeg ? crypto.randomUUID() : null;

      // Packages are sold in full immediately, independent of the FIFO debt
      // cap below (same as the standalone sell-package endpoint) — a package
      // purchase is its own sale, not part of what this appointment "owes".
      let packageAmount = 0;
      const purchasedPackages = [];
      if (hasPackagePurchases) {
        for (const item of package_purchases) {
          const typeId = safeUUID(item?.package_type_id);
          if (!typeId) {
            throw new HttpError(400, { error: "Invalid package_type_id" });
          }
          const t = await client.query(
            "SELECT * FROM package_types WHERE id = $1 AND shop_id = $2 AND is_active = true",
            [typeId, req.shopId],
          );
          if (!t.rows[0]) {
            throw new HttpError(404, { error: "Package type not found" });
          }
          const pt = t.rows[0];
          const ins = await client.query(
            `INSERT INTO client_packages
               (shop_id, client_id, package_type_id, name, service_id, total_visits, price_paid, expires_at)
             VALUES ($1, $2, $3, $4, $5, $6, $7,
                     CASE WHEN $8::int IS NULL THEN NULL ELSE NOW() + ($8::int * INTERVAL '1 day') END)
             RETURNING id`,
            [req.shopId, client_id, pt.id, pt.name, pt.service_id, pt.visits, pt.price, pt.validity_days],
          );
          await client.query(
            `INSERT INTO transactions (appointment_id, client_id, amount, payment_method, transaction_type, shop_id, created_at)
             VALUES (NULL, $1, $2, $3, 'package_sale', $4, NOW())`,
            [client_id, pt.price, payment_method, req.shopId],
          );
          packageAmount += Number(pt.price);
          purchasedPackages.push({ id: ins.rows[0].id, name: pt.name });
        }
      }

      // Gift cards sold alongside this payment — same "own sale, not part of
      // the appointment's debt" treatment as packages above.
      let giftCardAmount = 0;
      const purchasedGiftCards = [];
      if (hasGiftCardPurchases) {
        for (const item of gift_card_purchases) {
          const cardNumber = String(item?.card_number || "").trim();
          const customerName = String(item?.customer_name || "").trim();
          const initialAmount = Number(item?.initial_amount);
          if (!cardNumber || !customerName || !(initialAmount > 0)) {
            throw new HttpError(400, {
              error: "Each gift card needs a card_number, customer_name and a positive initial_amount",
            });
          }
          const ins = await client.query(
            `INSERT INTO gift_cards
               (card_number, client_id, customer_name, initial_amount, remaining_balance,
                purchase_payment_method, shop_id, issued_at, expires_at, sold_by_staff_id)
             VALUES ($1, $2, $3, $4, $4, $5, $6, NOW(), NOW() + INTERVAL '3 months', $7)
             RETURNING id, card_number`,
            [cardNumber, client_id || null, customerName, initialAmount, payment_method, req.shopId, req.user.staffId || null],
          );
          await client.query(
            `INSERT INTO transactions
               (appointment_id, client_id, amount, payment_method, transaction_type, shop_id, gift_card_id, created_at)
             VALUES (NULL, $1, $2, $3, 'gift_card_sale', $4, $5, NOW())`,
            [client_id || null, initialAmount, payment_method, req.shopId, ins.rows[0].id],
          );
          giftCardAmount += initialAmount;
          purchasedGiftCards.push({ id: ins.rows[0].id, card_number: ins.rows[0].card_number });
        }
      }

      // The service leg only ever covers the appointment's own debt cap, never
      // the package/gift-card price — pass 0 when the caller's "amount" was extras-only.
      const serviceLegAmount = Number(amount) || 0;

      const leg1Error =
        payment_method === "membership"
          ? (await processMembershipLeg(redemptions, splitGroupId)).error
          : await processLeg({
              legAmount: serviceLegAmount,
              legMethod: payment_method,
              legGiftCardId: gift_card_id,
              splitGroupId,
            });
      if (leg1Error) {
        throw new HttpError(400, { error: leg1Error });
      }

      if (hasSecondLeg) {
        const leg2Error =
          payment_method2 === "membership"
            ? (await processMembershipLeg(redemptions2, splitGroupId)).error
            : await processLeg({
                legAmount: amount2,
                legMethod: payment_method2,
                legGiftCardId: gift_card_id2,
                splitGroupId,
              });
        if (leg2Error) {
          throw new HttpError(400, { error: leg2Error });
        }
      }

      // Recalculate client balance and return it so the frontend can update without guessing
      const newBalance = await recalculateClientBalance(client, client_id);

      // The appointment's version after the payment (it changes with every
      // payment), so the booking dialog can keep editing without a false
      // "changed meanwhile" conflict against its own payment.
      const apptVersionRes = appointment_id && safeUUID(appointment_id)
        ? await client.query("SELECT version FROM appointments WHERE id = $1", [appointment_id])
        : { rows: [] };
      const responseBody = {
        success: true,
        new_balance: newBalance,
        appointment_version: apptVersionRes.rows[0] ? Number(apptVersionRes.rows[0].version) : null,
        package_amount: Math.round(packageAmount * 100) / 100,
        packages_purchased: purchasedPackages,
        gift_card_amount: Math.round(giftCardAmount * 100) / 100,
        gift_cards_purchased: purchasedGiftCards,
      };
      await saveIdempotency(client, idempotencyKey, req.shopId, 200, responseBody);

      return { status: 200, body: responseBody };
    });
    res.status(status).json(body);
  }, { log: "Payment error:", message: "Payment failed" }));

  return router;
};
