// At the very top of your cron/email file
if (process.env.NODE_ENV !== "production") {
  require("dotenv").config();
}
const cron = require("node-cron");
const nodemailer = require("nodemailer");
const pool = require("./db");
const crypto = require("crypto");

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

// Helper: Format time to Greek standard HH:MM
const formatTime = (date) => {
  return new Intl.DateTimeFormat("el-GR", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "Europe/Athens", // Adjust based on your VPS timezone
  }).format(new Date(date));
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
        WHERE aps.start_time <= (NOW() + INTERVAL '24 hours 5 minutes') 
            AND aps.start_time >= (NOW() + INTERVAL '23 hours 55 minutes')
            AND a.email_reminder_sent = false
            AND a.status != 'cancelled'
            AND c.receive_emails = true 
            AND a.is_block = false;
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
      const unsubUrl = `https://interventio.gr/api/v1/unsubscribe?id=${appt.client_id}&token=${token}`;

      // Google Calendar Link
      const googleUrl = `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${title}&dates=${gStart}/${gEnd}&details=${details}`;

      // Outlook Link
      const outlookUrl = `https://outlook.live.com/calendar/0/deeplink/compose?subject=${title}&startdt=${appt.start_time.toISOString()}&enddt=${appt.end_time.toISOString()}&body=${details}`;

      const htmlContent = `
           <!doctype html>
            <html>
              <head>
                <link
                  href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;700;800&display=swap"
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
                  background-color: #fff5f9;
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
                      0 20px 25px -5px rgba(255, 147, 212, 0.1),
                      0 10px 10px -5px rgba(0, 0, 0, 0.04);
                  "
                >
                  <div style="padding: 40px 40px 20px 40px; text-align: left">
                    <div
                      style="
                        display: inline-block;
                        background-color: #ff93d4;
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
                        font-size: 24px;
                        font-weight: 800;
                        letter-spacing: -0.025em;
                      "
                    >
                      <span style="color: #111827">Petalouda</span
                      ><span style="color: #ff93d4">Booking</span>
                    </h2>
                  </div>

                  <div class="inner-padding" style="padding: 0 40px 40px 40px">
                    <h1
                      style="
                        color: #111827;
                        font-size: 32px;
                        font-weight: 800;
                        margin-bottom: 24px;
                        line-height: 1.1;
                        letter-spacing: -1px;
                      "
                    >
                      Υπενθύμιση <span style="color: #ff7ec7">Ραντεβού</span>
                    </h1>

                    <p
                      style="
                        color: #4b5563;
                        font-size: 16px;
                        line-height: 1.6;
                        margin-bottom: 8px;
                      "
                    >
                      Γεια σας,
                    </p>
                    <p style="color: #4b5563; font-size: 16px; line-height: 1.6">
                      Αυτή είναι μια φιλική υπενθύμιση για το αυριανό ραντεβού σας στο
                      <strong style="color: #111827">${appt.shop_name}</strong>.
                    </p>

                    <div
                      style="
                        background-color: #fff5f9;
                        border-radius: 24px;
                        padding: 30px;
                        margin: 32px 0;
                        border: 1px solid rgba(255, 147, 212, 0.2);
                      "
                    >
                      <div
                        style="
                          margin-bottom: 20px;
                          border-bottom: 1px solid rgba(255, 147, 212, 0.1);
                          padding-bottom: 15px;
                        "
                      >
                        <div
                          style="
                            color: #ff93d4;
                            font-size: 11px;
                            text-transform: uppercase;
                            font-weight: 800;
                            margin-bottom: 4px;
                            letter-spacing: 0.05em;
                          "
                        >
                          Πότε
                        </div>
                        <div style="color: #111827; font-size: 18px; font-weight: 700">
                          Αύριο, ${startTimeStr} - ${endTimeStr}
                        </div>
                      </div>

                      <div
                        style="margin-bottom: 0px; border-bottom: none; padding-bottom: 0px"
                      >
                        <div
                          style="
                            color: #ff93d4;
                            font-size: 11px;
                            text-transform: uppercase;
                            font-weight: 800;
                            margin-bottom: 4px;
                            letter-spacing: 0.05em;
                          "
                        >
                          Υπηρεσία
                        </div>
                        <div style="color: #111827; font-size: 18px; font-weight: 700">
                          ${appt.service_name}
                        </div>
                      </div>
                    </div>

                    <div
                      style="
                        border-left: 4px solid #ff93d4;
                        padding-left: 20px;
                        margin: 32px 0;
                      "
                    >
                      <h4 style="margin: 0 0 8px 0; color: #111827; font-weight: 700">
                        Χρήσιμες Πληροφορίες:
                      </h4>
                      <ul
                        style="
                          color: #6b7280;
                          font-size: 15px;
                          padding-left: 0;
                          list-style: none;
                          margin: 0;
                        "
                      >
                        <li style="display: flex; align-items: center">
                          <span style="color: #10b981; margin-right: 8px">✓</span>
                          Παρακαλούμε να προσέλθετε 5-10 λεπτά νωρίτερα.
                        </li>
                      </ul>
                    </div>

                    <div
                      style="
                        margin-top: 40px;
                        text-align: center;
                        border-top: 1px solid #f3f4f6;
                        padding-top: 32px;
                      "
                    >
                      <p
                        style="
                          color: #111827;
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
                          background-color: #111827;
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
                          color: #111827;
                          border: 2px solid #e5e7eb;
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
                        border-top: 1px solid #eee;
                        text-align: center;
                      "
                    >
                      <p style="color: #9ca3af; font-size: 11px; line-height: 1.4">
                        Λαμβάνετε αυτό το email ως υπενθύμιση για το ραντεβού σας.<br />
                        Αν δεν επιθυμείτε να λαμβάνετε πλέον ειδοποιήσεις,
                        <a
                          href="${unsubUrl}"
                          style="color: #ff93d4; text-decoration: underline"
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
                      border-top: 1px solid rgba(255, 147, 212, 0.2);
                    "
                  >
                    <div style="margin-bottom: 20px">
                      <span
                        style="
                          color: #111827;
                          font-size: 18px;
                          font-weight: 800;
                          letter-spacing: -0.025em;
                        "
                      >
                        ${appt.shop_name}<span style="color: #ff93d4"> Booking</span>
                      </span>
                    </div>
                    <p
                      style="
                        color: #ff93d4;
                        margin-bottom: 12px;
                        font-size: 13px;
                        font-weight: 700;
                        text-transform: uppercase;
                        letter-spacing: 0.05em;
                      "
                    >
                      Powered by Interventio
                    </p>

                    <p style="color: #9ca3af; font-size: 12px; margin: 0; line-height: 1.5">
                      © 2026 Interventio Booking System.<br />
                      All rights reserved.
                    </p>
                  </div>
                </div>
              </body>
            </html>
            `;

      try {
        await transporter.sendMail({
          from: `"${appt.shop_name} Booking" ${process.env.EMAIL_USER}`, //   ${process.env.EMAIL_USER}
          replyTo: "vlachogianni@petalouda.blahogianni.gr",
          to: appt.client_email,
          subject: "Υπενθύμιση Ραντεβού - 1 μέρα απομένει",
          html: htmlContent,
        });

        // 3. Mark as sent using your specific column name
        await pool.query(
          "UPDATE appointments SET email_reminder_sent = true WHERE id = $1",
          [appt.appointment_id],
        );
        console.log(`Email sent to ${appt.client_email}`);
      } catch (mailErr) {
        console.error("Mail send error:", mailErr);
      }
    }
  } catch (err) {
    console.error("Cron Job DB Error:", err);
  }
};

// Run every 1 minute
cron.schedule("*/5 * * * *", processReminders);
