if (process.env.NODE_ENV !== "production") {
  require("dotenv").config();
}
const cron = require("node-cron");
const nodemailer = require("nodemailer");
const pool = require("./db");
const path = require("path");

const LOGO_PATH = path.join(__dirname, "../client/static/logo for photos-02.png");

const transporter = nodemailer.createTransport({
  host: process.env.EMAIL_HOST,
  port: process.env.EMAIL_PORT,
  secure: process.env.EMAIL_PORT == 465,
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

const isValidEmail = (email) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email || "");

const formatDate = (date) =>
  new Intl.DateTimeFormat("el-GR", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "Europe/Athens",
  }).format(new Date(date));

// Sends a renewal-reminder email 3 days before current_period_end, once per
// cycle (renewal_reminder_sent_at is reset to NULL whenever a membership is
// renewed, so the next cycle gets its own fresh reminder).
const processRenewalReminders = async () => {
  try {
    const { rows } = await pool.query(`
      SELECT cm.id, cm.current_period_end, c.first_name, c.email,
             mt.name as tier_name, s.name as shop_name
      FROM client_memberships cm
      JOIN clients c ON c.id = cm.client_id
      JOIN membership_tiers mt ON mt.id = cm.tier_id
      JOIN shops s ON s.id = cm.shop_id
      WHERE cm.status = 'active'
        AND cm.renewal_reminder_sent_at IS NULL
        AND cm.current_period_end <= NOW() + INTERVAL '3 days'
        AND cm.current_period_end >= NOW()
        AND c.receive_emails = true
    `);

    for (const row of rows) {
      if (!isValidEmail(row.email)) continue;
      try {
        await transporter.sendMail({
          from: `"${row.shop_name}" <${process.env.EMAIL_USER}>`,
          to: row.email,
          subject: `Η συνδρομή σας (${row.tier_name}) λήγει σύντομα`,
          html: `
            <div style="font-family: Arial, sans-serif; max-width: 500px; margin: 0 auto; padding: 24px;">
              <img src="cid:brand-logo" alt="${row.shop_name}" width="40" height="40" style="width: 40px; height: 40px; object-fit: contain; margin-bottom: 16px;" />
              <h2 style="color: #2C2C2C;">Γεια σας ${row.first_name},</h2>
              <p style="color: #5C4A3A; font-size: 15px; line-height: 1.6;">
                Η συνδρομή σας <strong>${row.tier_name}</strong> στο ${row.shop_name} λήγει στις
                <strong>${formatDate(row.current_period_end)}</strong>.
              </p>
              <p style="color: #5C4A3A; font-size: 15px; line-height: 1.6;">
                Επικοινωνήστε μαζί μας για ανανέωση και να συνεχίσετε να απολαμβάνετε τα οφέλη της συνδρομής σας.
              </p>
            </div>
          `,
          attachments: [{ filename: "logo.png", path: LOGO_PATH, cid: "brand-logo" }],
        });
        await pool.query(
          `UPDATE client_memberships SET renewal_reminder_sent_at = NOW() WHERE id = $1`,
          [row.id],
        );
      } catch (mailErr) {
        console.error("Membership renewal email error:", mailErr);
      }
    }
  } catch (err) {
    console.error("Membership renewal reminder job error:", err);
  }
};

// Flips a membership to 'expired' once NOW() is past current_period_end plus
// that tier's grace_period_days (admin-configurable per tier).
const processGracePeriodExpiry = async () => {
  try {
    await pool.query(`
      UPDATE client_memberships cm
      SET status = 'expired'
      FROM membership_tiers mt
      WHERE cm.tier_id = mt.id
        AND cm.status = 'active'
        AND cm.current_period_end + (mt.grace_period_days || ' days')::interval < NOW()
    `);
  } catch (err) {
    console.error("Membership grace-period expiry job error:", err);
  }
};

// Hourly is plenty for renewal/expiry bookkeeping — unlike appointment
// reminders, this doesn't need minute-level precision.
cron.schedule("0 * * * *", () => {
  processRenewalReminders();
  processGracePeriodExpiry();
});

module.exports = { processRenewalReminders, processGracePeriodExpiry };
