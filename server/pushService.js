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

// --- The Android app: Firebase Cloud Messaging (docs/redesign/ANDROID_HANDOFF.md §1) ---
// On only when FIREBASE_SERVICE_ACCOUNT holds the Firebase service account (its
// JSON, or the path to its file). Without it, app devices are skipped silently
// and everything else works as before.
let fcmSend = null; // (token, payload) => Promise
let fcmChecked = false;
const fcmSender = () => {
  if (fcmChecked) return fcmSend;
  fcmChecked = true;
  const raw = (process.env.FIREBASE_SERVICE_ACCOUNT || "").trim();
  if (!raw) return null;
  try {
    const admin = require("firebase-admin");
    const account = JSON.parse(raw.startsWith("{") ? raw : require("fs").readFileSync(raw, "utf8"));
    const app = admin.initializeApp({ credential: admin.credential.cert(account) }, "pure-app-push");
    const messaging = admin.messaging(app);
    // Kept minimal (no treatment names): the app shows the details. `url` is
    // the portal page the app opens when the notification is tapped.
    fcmSend = (token, payload) =>
      messaging.send({
        token,
        notification: { title: payload.title, body: payload.body },
        data: { url: payload.url || "/portal/home" },
        android: { priority: "high", notification: { icon: "ic_stat_icon", color: "#8B6F4E" } },
      });
  } catch (err) {
    console.error("App push (FCM) not started:", err.message);
  }
  return fcmSend;
};
// Tests send through a fake instead of Google's servers.
const setFcmSender = (send) => {
  fcmSend = send;
  fcmChecked = true;
};

// FCM's answers for a token that will never work again: the app was
// uninstalled, or the token was replaced.
const DEAD_TOKEN_CODES = new Set(["messaging/registration-token-not-registered", "messaging/invalid-registration-token"]);

// Sends one payload to app devices (rows with `token`), dropping dead tokens.
// Returns how many succeeded.
const sendToAppDevices = async (devices, payload) => {
  const send = fcmSender();
  if (!send || devices.length === 0) return 0;
  let sent = 0;
  await Promise.all(
    devices.map(async ({ token }) => {
      try {
        await send(token, { title: payload.title, body: payload.body, url: payload.url });
        sent += 1;
      } catch (err) {
        if (DEAD_TOKEN_CODES.has(err?.code || err?.errorInfo?.code)) {
          await pool.query("DELETE FROM push_devices WHERE token = $1", [token]).catch(() => {});
        } else {
          console.error("App push send error:", err?.code || err?.message);
        }
      }
    }),
  );
  return sent;
};

// Every device of one client, or of one shop: browsers (web push) and, unless
// `appDevices` is false, the Android app (FCM). `column` is one of the two
// fixed names below, never user input. Reminders leave the app out: the app
// schedules its own on the phone, so it would otherwise get each one twice.
const sendPushWhere = (column) => async (id, payload, { appDevices = true } = {}) => {
  const { rows } = await pool.query(
    `SELECT endpoint, p256dh, auth FROM push_subscriptions WHERE ${column} = $1`,
    [id],
  );
  let sent = rows.length ? await sendToSubscriptions(rows, payload) : 0;
  if (appDevices && fcmSender()) {
    const devices = await pool.query(`SELECT token FROM push_devices WHERE ${column} = $1`, [id]);
    sent += await sendToAppDevices(devices.rows, payload);
  }
  return sent;
};
const sendPushToClient = sendPushWhere("client_id");
const sendPushToShop = sendPushWhere("shop_id");

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
  setFcmSender,
  sendPushToClient,
  sendPushToShop,
  recordNotification,
  recordNotificationForShop,
};
