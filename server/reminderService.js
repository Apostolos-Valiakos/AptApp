// At the very top of your cron/email file
if (process.env.NODE_ENV !== "production") {
  require("dotenv").config();
}
const cron = require("node-cron");
const { createMailTransport } = require("./domain/mailer");
const pool = require("./db");
const path = require("path");
const { sendPushToClient, recordNotification } = require("./pushService");
const { signLink } = require("./domain/linkTokens");
const { athensTime: formatTime, athensDay: formatDay } = require("./domain/greekDates");

const LOGO_PATH = path.join(__dirname, "../client/static/logo for photos-02.png");

// Local/LAN dev derives this from API_URL:PORT (same convention as
// vite.config.mjs), since there's no reverse proxy hiding the port there.
// In production this must be set explicitly — behind Nginx the app only
// listens on 127.0.0.1:3000, so a link built as https://domain:3000/...
// would be unreachable from outside the VPS. Same override pattern as
// FRONTEND_URL below (an explicit full origin, used as-is, no port math).
const PUBLIC_BASE_URL =
  process.env.PUBLIC_BASE_URL || `${process.env.API_URL}:${process.env.PORT}`;

// 1. Configure Nodemailer
const transporter = createMailTransport();




// Reminder windows are configurable per shop (1-72 hours) — phrase the
// subject/copy relative to the actual window instead of a hardcoded "1 day".
const describeReminderWindow = (hoursBefore) => {
  const hours = Number(hoursBefore);
  if (hours <= 1) return "σε 1 ώρα";
  if (hours < 24) return `σε ${hours} ώρες`;
  if (hours === 24) return "αύριο";
  return `σε ${Math.round(hours / 24)} μέρες`;
};

const isValidEmail = (email) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

// The reminders due now on one channel ("email" or "push"): for each of the
// client's chosen times before (or the shop's one), a booking starting that
// long from now, give or take 5 minutes, whose reminders aren't all sent and
// that hasn't had this one for its current start. One row per booking and
// time, about its first service. `is_last` marks the client's last reminder
// before the booking: once it's sent, the booking's flag says "all sent".
const dueRemindersSql = (channel) => {
  const flag = channel === "email" ? "email_reminder_sent" : "push_reminder_sent";
  return `
    WITH booked AS (
      SELECT a.id, a.client_id, a.shop_id,
             COALESCE(c.reminder_offsets_minutes, ARRAY[(COALESCE(s.reminder_hours_before, 24) * 60)::int]) AS offsets,
             (SELECT MIN(start_time) FROM appointment_services WHERE appointment_id = a.id) AS start_time
      FROM appointments a
      JOIN clients c ON c.id = a.client_id
      JOIN shops s ON s.id = a.shop_id
      WHERE a.${flag} = false
        AND a.status NOT IN ('cancelled', 'no-show', 'no_show')
        AND a.is_block = false
        ${channel === "email" ? "AND c.receive_emails = true" : ""}
    )
    SELECT b.id AS appointment_id, b.client_id, b.shop_id, o.mins AS offset_minutes,
           (o.mins = (SELECT MIN(x) FROM unnest(b.offsets) x)) AS is_last,
           (o.mins / 60.0) AS reminder_hours_before,
           c.first_name AS client_name, c.last_name AS client_last_name, c.email AS client_email,
           s.name AS shop_name, s.reply_email AS shop_reply_email,
           b.start_time,
           (b.start_time + (COALESCE(NULLIF(aps.duration_override, 0), ser.duration_minutes, 60)) * INTERVAL '1 minute') AS end_time,
           ser.name AS service_name, st.name AS staff_name
    FROM booked b
    CROSS JOIN LATERAL unnest(b.offsets) AS o(mins)
    JOIN clients c ON c.id = b.client_id
    JOIN shops s ON s.id = b.shop_id
    JOIN LATERAL (
      SELECT * FROM appointment_services WHERE appointment_id = b.id ORDER BY start_time LIMIT 1
    ) aps ON true
    JOIN services ser ON ser.id = aps.service_id
    LEFT JOIN staff st ON st.id = aps.staff_id
    WHERE b.start_time BETWEEN NOW() + o.mins * INTERVAL '1 minute' - INTERVAL '5 minutes'
                           AND NOW() + o.mins * INTERVAL '1 minute' + INTERVAL '5 minutes'
      AND NOT EXISTS (
        SELECT 1 FROM appointment_reminders r
        WHERE r.appointment_id = b.id AND r.channel = '${channel}' AND r.offset_minutes = o.mins AND r.start_time = b.start_time
      )
    ORDER BY b.id, o.mins`;
};

// Takes one reminder for this run (whoever records it first sends it, so an
// overlapping run can't send it too). False when another run already has.
const claimReminder = async (channel, appt) =>
  (
    await pool.query(
      `INSERT INTO appointment_reminders (appointment_id, channel, offset_minutes, start_time)
       VALUES ($1, $2, $3, $4) ON CONFLICT DO NOTHING RETURNING appointment_id`,
      [appt.appointment_id, channel, appt.offset_minutes, appt.start_time],
    )
  ).rowCount === 1;

// A failed send gives it back for the next run.
const releaseReminder = (channel, appt) =>
  pool
    .query("DELETE FROM appointment_reminders WHERE appointment_id = $1 AND channel = $2 AND offset_minutes = $3 AND start_time = $4", [
      appt.appointment_id, channel, appt.offset_minutes, appt.start_time,
    ])
    .catch((err) => console.error("Reminder retry mark error:", err));

const markAllSent = (channel, appt) =>
  appt.is_last &&
  pool.query(`UPDATE appointments SET ${channel === "email" ? "email_reminder_sent" : "push_reminder_sent"} = true WHERE id = $1`, [appt.appointment_id]);

// The reminder email for one appointment: its subject and its page, with
// links to confirm, to add it to a calendar and to stop these emails.
const reminderEmail = (appt) => {
  const startTimeStr = formatTime(appt.start_time);
  const endTimeStr = formatTime(appt.end_time);
  const dayStr = formatDay(appt.start_time);
  const windowText = describeReminderWindow(appt.reminder_hours_before);
  const formatCalendarDate = (date) => {
    return new Date(date).toISOString().replace(/-|:|\.\d\d\d/g, "");
  };
  const gStart = formatCalendarDate(appt.start_time);
  const gEnd = formatCalendarDate(appt.end_time);
  const title = encodeURIComponent(`Ραντεβού: ${appt.service_name}`);
  const location = encodeURIComponent(appt.shop_name);
  const details = encodeURIComponent(`Ραντεβού στο ${location}`);

  const token = signLink(appt.client_id);
  const unsubUrl = `${PUBLIC_BASE_URL}/api/v1/unsubscribe?id=${appt.client_id}&token=${token}`;
  const confirmToken = signLink(appt.appointment_id);
  const confirmUrl = `${PUBLIC_BASE_URL}/api/v1/confirm-appointment?id=${appt.appointment_id}&token=${confirmToken}`;
  const confirmButtonHtml = `
    <div style="text-align: center; margin: 0 0 32px 0;">
        <a href="${confirmUrl}"
          style="display: block; background-color: #8B6F4E; color: white; padding: 16px 32px; border-radius: 16px; text-decoration: none; font-weight: 800; font-size: 16px; box-shadow: 0 4px 6px rgba(139, 111, 78, 0.25);">
          ΕΠΙΒΕΒΑΙΩΣΗ ΡΑΝΤΕΒΟΥ
        </a>
        <p style="color: #7A6A5A; font-size: 12px; margin-top: 12px;">
            Πατήστε το παραπάνω κουμπί για να επιβεβαιώσετε την παρουσία σας.
        </p>
    </div>
`;

  // Google Calendar Link
  const googleUrl = `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${title}&dates=${gStart}/${gEnd}&details=${details}`;

  // Outlook Link
  const outlookUrl = `https://outlook.live.com/calendar/0/deeplink/compose?subject=${title}&startdt=${appt.start_time.toISOString()}&enddt=${appt.end_time.toISOString()}&body=${details}`;

  const htmlContent = `
       <!doctype html>
        <html>
          <head>
            <link
              href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;700;800&family=Georgia&display=swap"
              rel="stylesheet"
            />
            <style>
              /* Fallback for email clients that support style blocks */
              @media only screen and (max-width: 600px) {
                .inner-padding {
                  padding: 30px 15px !important;
                }
                .button-stack {
                  display: block !important;
                  width: 100% !important;
                  margin: 10px 0 !important;
                  box-sizing: border-box !important;
                }
              }
            </style>
          </head>
          <body
            style="
              font-family:
                &quot;Inter&quot;,
                -apple-system,
                BlinkMacSystemFont,
                &quot;Segoe UI&quot;,
                Roboto,
                sans-serif;
              background-color: #F9F5F0;
              padding: 40px 10px;
              margin: 0;
              -webkit-font-smoothing: antialiased;
            "
          >
            <div
              style="
                max-width: 600px;
                margin: 0 auto;
                background: white;
                border-radius: 32px;
                overflow: hidden;
                box-shadow:
                  0 20px 25px -5px rgba(139, 111, 78, 0.12),
                  0 10px 10px -5px rgba(0, 0, 0, 0.04);
              "
            >
              <div style="padding: 40px 40px 20px 40px; text-align: left">
                <img
                  src="cid:brand-logo"
                  alt="Pure Spa & Massage Experience"
                  width="48"
                  height="48"
                  style="width: 48px; height: 48px; object-fit: contain; margin-bottom: 16px;"
                />
                <div
                  style="
                    display: inline-block;
                    background-color: #8B6F4E;
                    color: white;
                    padding: 4px 12px;
                    border-radius: 9999px;
                    font-size: 12px;
                    font-weight: 700;
                    margin-bottom: 16px;
                    text-transform: uppercase;
                    letter-spacing: 0.05em;
                  "
                >
                  Υπενθυμιση
                </div>
                <h2
                  style="
                    margin: 0;
                    font-family: Georgia, serif;
                    font-size: 24px;
                    font-weight: 700;
                    letter-spacing: -0.025em;
                  "
                >
                  <span style="color: #8B6F4E">Pure</span
                  ><span style="color: #2C2C2C"> Spa &amp; Massage Experience</span>
                </h2>
              </div>

              <div class="inner-padding" style="padding: 0 40px 40px 40px">
                <h1
                  style="
                    color: #2C2C2C;
                    font-family: Georgia, serif;
                    font-size: 32px;
                    font-weight: 700;
                    margin-bottom: 24px;
                    line-height: 1.1;
                    letter-spacing: -1px;
                  "
                >
                  Υπενθύμιση <span style="color: #D4A97A">Ραντεβού</span>
                </h1>

                <p
                  style="
                    color: #5C4A3A;
                    font-size: 16px;
                    line-height: 1.6;
                    margin-bottom: 8px;
                  "
                >
                  Γεια σας,
                </p>
                <p style="color: #5C4A3A; font-size: 16px; line-height: 1.6">
                  Αυτή είναι μια φιλική υπενθύμιση ${windowText} για το ραντεβού σας στο
                  <strong style="color: #2C2C2C">${appt.shop_name}</strong>.
                </p>

                <div
                  style="
                    background-color: #F9F5F0;
                    border-radius: 24px;
                    padding: 30px;
                    margin: 32px 0;
                    border: 1px solid rgba(212, 169, 122, 0.3);
                  "
                >
                  <div
                    style="
                      margin-bottom: 20px;
                      border-bottom: 1px solid rgba(212, 169, 122, 0.25);
                      padding-bottom: 15px;
                    "
                  >
                    <div
                      style="
                        color: #8B6F4E;
                        font-size: 11px;
                        text-transform: uppercase;
                        font-weight: 800;
                        margin-bottom: 4px;
                        letter-spacing: 0.05em;
                      "
                    >
                      Πότε
                    </div>
                    <div style="color: #2C2C2C; font-size: 18px; font-weight: 700">
                      ${dayStr}, ${startTimeStr} - ${endTimeStr}
                    </div>
                  </div>

                  <div
                    style="margin-bottom: 0px; border-bottom: none; padding-bottom: 0px"
                  >
                    <div
                      style="
                        color: #8B6F4E;
                        font-size: 11px;
                        text-transform: uppercase;
                        font-weight: 800;
                        margin-bottom: 4px;
                        letter-spacing: 0.05em;
                      "
                    >
                      Υπηρεσία
                    </div>
                    <div style="color: #2C2C2C; font-size: 18px; font-weight: 700">
                      ${appt.service_name}
                    </div>
                  </div>
                </div>
                  ${confirmButtonHtml}

                <div
                  style="
                    border-left: 4px solid #D4A97A;
                    padding-left: 20px;
                    margin: 32px 0;
                  "
                >
                  <h4 style="margin: 0 0 8px 0; color: #2C2C2C; font-weight: 700">
                    Χρήσιμες Πληροφορίες:
                  </h4>
                  <ul
                    style="
                      color: #7A6A5A;
                      font-size: 15px;
                      padding-left: 0;
                      list-style: none;
                      margin: 0;
                    "
                  >
                    <li style="display: flex; align-items: center">
                      <span style="color: #8B6F4E; margin-right: 8px">✓</span>
                      Παρακαλούμε να προσέλθετε 5-10 λεπτά νωρίτερα.
                    </li>
                  </ul>
                </div>

                <div
                  style="
                    margin-top: 40px;
                    text-align: center;
                    border-top: 1px solid #EDE8E1;
                    padding-top: 32px;
                  "
                >
                  <p
                    style="
                      color: #2C2C2C;
                      font-size: 14px;
                      font-weight: 700;
                      margin-bottom: 20px;
                    "
                  >
                    Προσθήκη στο ημερολόγιο:
                  </p>

                  <a
                    href="${googleUrl}"
                    target="_blank"
                    class="button-stack"
                    style="
                      display: inline-block;
                      background-color: #2C2C2C;
                      color: white;
                      padding: 12px 24px;
                      border-radius: 12px;
                      text-decoration: none;
                      font-weight: 600;
                      font-size: 14px;
                      margin: 0 5px 10px 5px;
                      transition: background-color 0.2s;
                    "
                  >
                    <img
                      src="https://upload.wikimedia.org/wikipedia/commons/a/a5/Google_Calendar_icon_%282020%29.svg"
                      width="16"
                      style="
                        vertical-align: middle;
                        margin-right: 8px;
                        filter: brightness(0) invert(1);
                      "
                    />
                    Google Calendar
                  </a>

                  <a
                    href="${outlookUrl}"
                    target="_blank"
                    class="button-stack"
                    style="
                      display: inline-block;
                      background-color: white;
                      color: #2C2C2C;
                      border: 2px solid #EDE8E1;
                      padding: 10px 24px;
                      border-radius: 12px;
                      text-decoration: none;
                      font-weight: 600;
                      font-size: 14px;
                      margin: 0 5px 10px 5px;
                    "
                  >
                    <img
                      src="https://upload.wikimedia.org/wikipedia/commons/4/45/Microsoft_Office_Outlook_%282018%E2%80%932024%29.svg"
                      width="16"
                      style="vertical-align: middle; margin-right: 8px"
                    />
                    Outlook
                  </a>
                </div>
                <div
                  style="
                    margin-top: 20px;
                    padding-top: 20px;
                    border-top: 1px solid #EDE8E1;
                    text-align: center;
                  "
                >
                  <p style="color: #A89A8A; font-size: 11px; line-height: 1.4">
                    Λαμβάνετε αυτό το email ως υπενθύμιση για το ραντεβού σας.<br />
                    Αν δεν επιθυμείτε να λαμβάνετε πλέον ειδοποιήσεις,
                    <a
                      href="${unsubUrl}"
                      style="color: #8B6F4E; text-decoration: underline"
                      >πατήστε εδώ για διαγραφή</a
                    >.
                  </p>
                </div>
              </div>

              <div
                style="
                  background-color: #fff;
                  padding: 40px;
                  text-align: center;
                  border-top: 1px solid rgba(212, 169, 122, 0.3);
                "
              >
                <div style="margin-bottom: 20px">
                  <span
                    style="
                      color: #2C2C2C;
                      font-family: Georgia, serif;
                      font-size: 18px;
                      font-weight: 700;
                      letter-spacing: -0.025em;
                    "
                  >
                    ${appt.shop_name}
                  </span>
                </div>
                <p
                  style="
                    color: #8B6F4E;
                    margin-bottom: 12px;
                    font-size: 13px;
                    font-weight: 700;
                    text-transform: uppercase;
                    letter-spacing: 0.05em;
                  "
                >
                  Powered by Pure Spa &amp; Massage Experience
                </p>

                <p style="color: #A89A8A; font-size: 12px; margin: 0; line-height: 1.5">
                  © ${new Date().getFullYear()} Pure Spa &amp; Massage Experience.<br />
                  All rights reserved.
                </p>
              </div>
            </div>
          </body>
        </html>
        `;

  return { subject: `Υπενθύμιση Ραντεβού - ${windowText}`, html: htmlContent };
};

// Sends one email reminder.
const sendReminder = async (appt) => {
  if (!(await claimReminder("email", appt))) return;
  const { subject, html } = reminderEmail(appt);
  try {
    await transporter.sendMail({
      from: `"${appt.shop_name}" <${process.env.EMAIL_USER}>`,
      ...(appt.shop_reply_email && { replyTo: appt.shop_reply_email }),
      to: appt.client_email,
      subject,
      html,
      attachments: [{ filename: "logo.png", path: LOGO_PATH, cid: "brand-logo" }],
    });
    await markAllSent("email", appt);
  } catch (mailErr) {
    console.error("Mail send error:", mailErr);
    await releaseReminder("email", appt);
  }
};

const processReminders = async () => {
  try {
    const { rows } = await pool.query(dueRemindersSql("email"));
    for (const appt of rows) {
      if (!appt.client_email || !isValidEmail(appt.client_email)) continue;
      await sendReminder(appt);
    }
  } catch (err) {
    console.error("Cron Job DB Error:", err);
  }
};

// The same times as the emails, on their own record (a client can have push
// on with emails off, or the other way round). Runs for every client due a
// reminder, not only those with a push subscription: the portal's
// notification history shows it either way, and sendPushToClient does
// nothing without a subscription.
const processPushReminders = async () => {
  try {
    const { rows } = await pool.query(dueRemindersSql("push"));
    for (const appt of rows) {
      if (!(await claimReminder("push", appt))) continue;
      try {
        const title = `Ραντεβού: ${appt.service_name}`;
        const body = `${appt.shop_name} · ${formatTime(appt.start_time)}`;
        // Opens the booking's details (the old portal sends it to its list).
        const url = `/portal/bookings/${appt.appointment_id}`;
        await recordNotification(appt.client_id, appt.shop_id, { type: "reminder", title, body, url });
        await sendPushToClient(appt.client_id, { title, body, url });
        await markAllSent("push", appt);
      } catch (pushErr) {
        console.error("Push reminder error:", pushErr);
        await releaseReminder("push", appt);
      }
    }
  } catch (err) {
    console.error("Push reminder cron DB error:", err);
  }
};

// Runs every 1 minute, matching the ±5 minute window used in the queries above.
// RUN_JOBS=0 turns the schedule off (test servers run on copies of real data
// and must never email or notify real clients).
if (process.env.RUN_JOBS !== "0") {
  cron.schedule("*/1 * * * *", processReminders);
  cron.schedule("*/1 * * * *", processPushReminders);
}

module.exports = { processReminders, processPushReminders, PUBLIC_BASE_URL };
