// At the very top of your cron/email file
if (process.env.NODE_ENV !== "production") {
  require("dotenv").config();
}
const cron = require("node-cron");
const nodemailer = require("nodemailer");
const pool = require("./db");
const crypto = require("crypto");

// Same convention as vite.config.mjs (${env.API_URL}:${env.PORT}) — API_URL
// is the bare host, the port is appended separately so this never needs to
// be touched when moving between local/dev/production environments.
const PUBLIC_BASE_URL = `${process.env.API_URL}:${process.env.PORT}`;

// 1. Configure Nodemailer
const transporter = nodemailer.createTransport({
  host: process.env.EMAIL_HOST,
  port: process.env.EMAIL_PORT,
  secure: process.env.EMAIL_PORT == 465,
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

const generateUnsubToken = (clientId) => {
  if (!clientId) return "";
  return crypto
    .createHmac("sha256", process.env.JWT_SECRET)
    .update(clientId.toString())
    .digest("hex");
};
const generateConfirmToken = (appointmentId) => {
  if (!appointmentId) return "";
  return crypto
    .createHmac("sha256", process.env.JWT_SECRET)
    .update(appointmentId.toString())
    .digest("hex");
};

// Helper: Format time to Greek standard HH:MM
const formatTime = (date) => {
  return new Intl.DateTimeFormat("el-GR", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "Europe/Athens", // Adjust based on your VPS timezone
  }).format(new Date(date));
};

// Full weekday + date, e.g. "Παρασκευή, 10 Ιουλίου" — always correct
// regardless of how far out the shop's reminder window is configured.
const formatDay = (date) => {
  return new Intl.DateTimeFormat("el-GR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: "Europe/Athens",
  }).format(new Date(date));
};

// Reminder windows are configurable per shop (1-72 hours) — phrase the
// subject/copy relative to the actual window instead of a hardcoded "1 day".
const describeReminderWindow = (hoursBefore) => {
  const hours = Number(hoursBefore);
  if (hours <= 1) return "σε 1 ώρα";
  if (hours < 24) return `σε ${hours} ώρες`;
  if (hours === 24) return "αύριο";
  return `σε ${Math.round(hours / 24)} μέρες`;
};

const processReminders = async () => {
  try {
    const query = `
        SELECT
            a.id AS appointment_id,
            c.first_name AS client_name,
            c.id AS client_id,
			c.last_name AS client_last_name,
            c.email AS client_email,
            s.name AS shop_name,
            s.reply_email AS shop_reply_email,
            s.reminder_hours_before AS reminder_hours_before,
            aps.start_time,
            (aps.start_time + (COALESCE(aps.duration_override, 60)) * INTERVAL '1 minute') AS end_time,
            ser.name AS service_name,
            st.name AS staff_name
        FROM appointments a
        JOIN clients c ON a.client_id = c.id
        JOIN shops s ON a.shop_id = s.id
        JOIN appointment_services aps ON a.id = aps.appointment_id
        JOIN services ser ON aps.service_id = ser.id
        LEFT JOIN staff st ON aps.staff_id = st.id
        WHERE aps.start_time <= (NOW() + ((s.reminder_hours_before || ' hours')::interval) + INTERVAL '5 minutes')
            AND aps.start_time >= (NOW() + ((s.reminder_hours_before || ' hours')::interval) - INTERVAL '5 minutes')
            AND a.email_reminder_sent = false
            AND a.status != 'cancelled'
            AND c.receive_emails = true
            AND a.is_block = false
            AND s.plan != 'trial';
        `;

    const { rows } = await pool.query(query);
    const isValidEmail = (email) => {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      return emailRegex.test(email);
    };

    for (const appt of rows) {
      if (!appt.client_email || !isValidEmail(appt.client_email)) {
        continue;
      }
      const startTimeStr = formatTime(appt.start_time);
      const endTimeStr = formatTime(appt.end_time);
      const dayStr = formatDay(appt.start_time);
      const windowText = describeReminderWindow(appt.reminder_hours_before);
      const therapistFullName =
        `${appt.staff_name}`.trim() || "Επαγγελματίας Υγείας";
      const formatCalendarDate = (date) => {
        return new Date(date).toISOString().replace(/-|:|\.\d\d\d/g, "");
      };
      const gStart = formatCalendarDate(appt.start_time);
      const gEnd = formatCalendarDate(appt.end_time);
      const title = encodeURIComponent(`Ραντεβού: ${appt.service_name}`);
      const location = encodeURIComponent(appt.shop_name);
      const details = encodeURIComponent(`Ραντεβού στο ${location}`);

      const token = generateUnsubToken(appt.client_id);
      const unsubUrl = `${PUBLIC_BASE_URL}/api/v1/unsubscribe?id=${appt.client_id}&token=${token}`;
      const confirmToken = generateConfirmToken(appt.appointment_id);
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

      try {
        await transporter.sendMail({
          from: `"${appt.shop_name}" <${process.env.EMAIL_USER}>`,
          ...(appt.shop_reply_email && { replyTo: appt.shop_reply_email }),
          to: appt.client_email,
          subject: `Υπενθύμιση Ραντεβού - ${windowText}`,
          html: htmlContent,
        });

        // 3. Mark as sent using your specific column name
        await pool.query(
          "UPDATE appointments SET email_reminder_sent = true WHERE id = $1",
          [appt.appointment_id],
        );
      } catch (mailErr) {
        console.error("Mail send error:", mailErr);
      }
    }
  } catch (err) {
    console.error("Cron Job DB Error:", err);
  }
};

// Runs every 5 minutes, matching the ±5 minute window used in the query above
cron.schedule("*/1 * * * *", processReminders);

// Suspends trial shops once their trial period has passed. Hourly is plenty —
// shop status is only ever checked at login, same tolerance as everywhere else.
const expireTrials = async () => {
  try {
    await pool.query(
      `UPDATE shops SET status = 'suspended'
       WHERE plan = 'trial' AND status = 'active'
         AND trial_ends_at IS NOT NULL AND trial_ends_at < NOW()`,
    );
  } catch (err) {
    console.error("Failed to expire trials:", err);
  }
};
cron.schedule("0 * * * *", expireTrials);

module.exports = { processReminders, PUBLIC_BASE_URL };
