// Self-contained Web Push concern, mirroring reminderService.js's pattern:
// a pure module the rest of the app calls into, not an Express router.
if (process.env.NODE_ENV !== "production") {
  require("dotenv").config();
}
const webpush = require("web-push");
const pool = require("./db");

if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
  webpush.setVapidDetails(
    `mailto:${process.env.VAPID_CONTACT_EMAIL || "support@example.com"}`,
    process.env.VAPID_PUBLIC_KEY,
    process.env.VAPID_PRIVATE_KEY,
  );
}

// Sends one payload to every subscription in `subscriptions` (rows with
// endpoint/p256dh/auth), pruning subscriptions the push service reports as
// gone (410/404 — the browser unsubscribed or the endpoint expired) so dead
// rows don't accumulate and get retried forever. Returns how many succeeded.
const sendToSubscriptions = async (subscriptions, payload) => {
  let sent = 0;
  await Promise.all(
    subscriptions.map(async (sub) => {
      try {
        await webpush.sendNotification(
          {
            endpoint: sub.endpoint,
            keys: { p256dh: sub.p256dh, auth: sub.auth },
          },
          JSON.stringify(payload),
        );
        sent += 1;
      } catch (err) {
        if (err.statusCode === 404 || err.statusCode === 410) {
          await pool
            .query("DELETE FROM push_subscriptions WHERE endpoint = $1", [
              sub.endpoint,
            ])
            .catch(() => {});
        } else {
          console.error("Push send error:", err.statusCode, err.body || err.message);
        }
      }
    }),
  );
  return sent;
};

const sendPushToClient = async (clientId, payload) => {
  const { rows } = await pool.query(
    "SELECT endpoint, p256dh, auth FROM push_subscriptions WHERE client_id = $1",
    [clientId],
  );
  if (rows.length === 0) return 0;
  return sendToSubscriptions(rows, payload);
};

const sendPushToShop = async (shopId, payload) => {
  const { rows } = await pool.query(
    "SELECT endpoint, p256dh, auth FROM push_subscriptions WHERE shop_id = $1",
    [shopId],
  );
  if (rows.length === 0) return 0;
  return sendToSubscriptions(rows, payload);
};

// Records one row in the client portal's in-app notification history —
// deliberately independent of whether the OS push above actually reached the
// client (no subscription yet, permission denied, endpoint gone). The bell
// icon in the client portal reads this table, not the transient OS tray, so
// every reminder/broadcast should still show up there even for a client who
// never enabled push.
const recordNotification = async (
  clientId,
  shopId,
  { type, title, body, url },
) => {
  await pool.query(
    `INSERT INTO notification_deliveries (client_id, shop_id, type, title, body, url)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [clientId, shopId, type, title, body, url || null],
  );
};

// Same as recordNotification, but for every active client of a shop at once
// (used by broadcasts) — one INSERT...SELECT instead of one row per client.
const recordNotificationForShop = async (shopId, { type, title, body, url }) => {
  await pool.query(
    `INSERT INTO notification_deliveries (client_id, shop_id, type, title, body, url)
     SELECT id, $1, $2, $3, $4, $5 FROM clients
     WHERE shop_id = $1 AND is_deleted IS NOT TRUE`,
    [shopId, type, title, body, url || null],
  );
};

module.exports = {
  sendPushToClient,
  sendPushToShop,
  recordNotification,
  recordNotificationForShop,
};
