// Inviting a client to the portal by email.
const express = require("express");
const { asyncHandler } = require("../../http");
const jwt = require("jsonwebtoken");
const path = require("path");

module.exports = function inviteRouter({
  notForStaff,
  authenticateToken,
  hexToRgba,
  pool,
}) {
  const router = express.Router();

  // Invite Endpoint
  router.post("/:id/invite", authenticateToken, notForStaff, asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { rows } = await pool.query(
      "SELECT * FROM clients WHERE id = $1 AND shop_id = $2",
      [id, req.shopId],
    );
    if (rows.length === 0)
      return res.status(404).json({ error: "Client not found" });
    const client = rows[0];

    if (!client.email)
      return res
        .status(400)
        .json({ error: "Client does not have an email address" });

    const userCheck = await pool.query(
      "SELECT id FROM users WHERE client_id = $1",
      [id],
    );
    if (userCheck.rows.length > 0)
      return res.status(400).json({ error: "Client already has an account" });

    // Fetch shop branding
    const shopRes = await pool.query(
      "SELECT name, reply_email, primary_color FROM shops WHERE id = $1",
      [req.shopId],
    );
    const shopRow = shopRes.rows[0] || {};
    const replyEmail = shopRow.reply_email || null;
    const shopName = shopRow.name || req.user.shopName || process.env.APP_NAME || "Booking";
    const brandColor = shopRow.primary_color || "#111827";
    const brandTint = hexToRgba(brandColor, 0.08);
    const brandTintBorder = hexToRgba(brandColor, 0.2);
    const brandShadow = hexToRgba(brandColor, 0.3);

    // Generate temporary token for signup
    const inviteToken = jwt.sign(
      { typ: "invite", clientId: id, shopId: req.shopId, email: client.email },
      process.env.JWT_SECRET,
      { expiresIn: "48h" },
    );

    const signupUrl = `${process.env.FRONTEND_URL}/signup?token=${inviteToken}`;
    const nodemailer = require("nodemailer");

    const transporter = nodemailer.createTransport({
      host: process.env.EMAIL_HOST,
      port: process.env.EMAIL_PORT,
      secure: process.env.EMAIL_PORT == 465,
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS,
      },
      family: 4,
      connectionTimeout: 10000,
      greetingTimeout: 10000,
    });

    await transporter.sendMail({
      from: `"${shopName}" <${process.env.EMAIL_USER}>`,
      ...(replyEmail && { replyTo: replyEmail }),
      to: client.email,
      subject: "Invitation to your Client Portal",
      attachments: [
        {
          filename: "logo.png",
          path: path.join(__dirname, "../client/static/logo for photos-02.png"),
          cid: "brand-logo",
        },
      ],
      html: `
<!doctype html>
<html>
  <head>
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;700;800&display=swap" rel="stylesheet" />
    <style>
      /* Mobile responsiveness */
      @media only screen and (max-width: 600px) {
        .inner-padding { padding: 30px 15px !important; }
        .button-stack { display: block !important; width: 100% !important; margin: 10px 0 !important; box-sizing: border-box !important; }
      }
      /* Hover effect for buttons */
      .btn-hover:hover { opacity: 0.9 !important; transform: translateY(-2px); }
    </style>
  </head>
  <body style="font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background-color: ${brandTint}; padding: 40px 10px; margin: 0; -webkit-font-smoothing: antialiased;">
    <div style="max-width: 600px; margin: 0 auto; background: white; border-radius: 32px; overflow: hidden; box-shadow: 0 20px 25px -5px ${hexToRgba(brandColor, 0.1)}, 0 10px 10px -5px rgba(0, 0, 0, 0.04);">

      <div style="padding: 40px 40px 20px 40px; text-align: left">
        <img src="cid:brand-logo" alt="${shopName}" width="48" height="48" style="width: 48px; height: 48px; object-fit: contain; margin-bottom: 16px;" />
        <div style="display: inline-block; background-color: ${brandColor}; color: white; padding: 4px 12px; border-radius: 9999px; font-size: 12px; font-weight: 700; margin-bottom: 16px; text-transform: uppercase; letter-spacing: 0.05em;">
          Πρόσκληση
        </div>
        <h2 style="margin: 0; font-size: 24px; font-weight: 800; letter-spacing: -0.025em;">
          <span style="color: #111827">${shopName}</span><span style="color: ${brandColor}"> Portal</span>
        </h2>
      </div>

      <div class="inner-padding" style="padding: 0 40px 40px 40px">
        <h1 style="color: #111827; font-size: 32px; font-weight: 800; margin-bottom: 24px; line-height: 1.1; letter-spacing: -1px;">
          Καλώς ήρθατε στο <span style="color: ${brandColor}">Online Portal</span> μας
        </h1>

        <p style="color: #4b5563; font-size: 16px; line-height: 1.6; margin-bottom: 16px;">
          Γεια σας ${client.first_name},
        </p>
        <p style="color: #4b5563; font-size: 16px; line-height: 1.6">
          Είμαστε ενθουσιασμένοι που σας προσκαλούμε στη νέα μας πλατφόρμα. Εδώ μπορείτε να διαχειρίζεστε τα ραντεβού σας και να έχετε πρόσβαση στα έγγραφά σας 24/7.
        </p>

        <div style="background-color: ${brandTint}; border-radius: 24px; padding: 30px; margin: 32px 0; border: 1px solid ${brandTintBorder};">
          <ul style="color: #374151; font-size: 15px; padding-left: 0; list-style: none; margin: 0;">
            <li style="margin-bottom: 12px; display: flex; align-items: center;">
              <span style="color: ${brandColor}; margin-right: 12px; font-size: 18px;">📅</span>
              <strong>Προβολή ραντεβού:</strong> Δείτε τα επόμενα ραντεβού σας.
            </li>
            <li style="margin-bottom: 12px; display: flex; align-items: center;">
              <span style="color: ${brandColor}; margin-right: 12px; font-size: 18px;">🕒</span>
              <strong>Ιστορικό:</strong> Πλήρης έλεγχος των επισκέψεών σας.
            </li>
            <li style="display: flex; align-items: center;">
              <span style="color: ${brandColor}; margin-right: 12px; font-size: 18px;">📁</span>
              <strong>Αρχεία:</strong> Κατεβάστε σημαντικά έγγραφα και οδηγίες.
            </li>
          </ul>
        </div>

        <div style="text-align: center; margin-top: 40px;">
          <a href="${signupUrl}" class="btn-hover button-stack" style="display: inline-block; background-color: ${brandColor}; color: white; padding: 18px 40px; border-radius: 16px; text-decoration: none; font-weight: 700; font-size: 16px; transition: all 0.2s ease; box-shadow: 0 10px 15px -3px ${brandShadow};">
            Ενεργοποίηση Λογαριασμού
          </a>
          <p style="color: #9ca3af; font-size: 12px; margin-top: 25px;">
             Αυτός ο σύνδεσμος θα λήξει σε 48 ώρες για την ασφάλειά σας.
          </p>
        </div>
      </div>

      <div style="background-color: #fff; padding: 40px; text-align: center; border-top: 1px solid ${hexToRgba(brandColor, 0.1)};">
        <p style="color: #111827; font-size: 16px; font-weight: 700; margin-bottom: 8px;">
          ${shopName}<span style="color: ${brandColor}"> Booking</span>
        </p>
        <p style="color: #9ca3af; font-size: 12px; margin: 0;">
          © ${new Date().getFullYear()} Powered by ${process.env.APP_NAME || "Booking"}
        </p>
      </div>
    </div>
  </body>
</html>
      `,
    });

    res.json({ success: true });
  }, { message: "Failed to send invitation", log: "Invite Error:" }));

  return router;
};
