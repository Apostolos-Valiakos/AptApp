// Public links that need no login (unsubscribe, demo request, confirm by email): /api/v1/unsubscribe, /demo-requests, /confirm-appointment.
// Moved out of server.js; helpers that still live there are handed over when
// it mounts this router (see "Area routers" near the end of server.js).
const express = require("express");
const { asyncHandler } = require("../http");
const crypto = require("crypto");
const pool = require("../db");
const { PUBLIC_BASE_URL } = require("../reminderService");

module.exports = function publicLinksRouter({
  io,
  publicActionLimiter,
}) {
  const router = express.Router();

  router.get("/unsubscribe", publicActionLimiter, async (req, res) => {
    const crypto = require("crypto");

    const { id, token } = req.query;

    if (!id || !token) {
      return res.status(400).send("Μη έγκυρο αίτημα.");
    }

    // Verify the token matches the ID using your secret
    const expectedToken = crypto
      .createHmac("sha256", process.env.JWT_SECRET)
      .update(id)
      .digest("hex");

    if (token !== expectedToken) {
      return res.status(403).send("Ο σύνδεσμος είναι άκυρος ή έχει λήξει.");
    }

    try {
      const result = await pool.query(
        "UPDATE clients SET receive_emails = false WHERE id = $1",
        [id],
      );

      if (result.rowCount === 0) {
        return res.status(404).send("Ο χρήστης δεν βρέθηκε.");
      }

      // Return a nice styled confirmation page
      res.send(`
              <div style="font-family: 'Inter', sans-serif; text-align: center; padding: 100px 20px; background: #F9F5F0; min-height: 100vh;">
                  <div style="background: white; padding: 40px; border-radius: 20px; display: inline-block; box-shadow: 0 10px 25px rgba(139, 111, 78, 0.1);">
                      <h1 style="color: #2C2C2C; font-family: Georgia, serif; margin-bottom: 10px;">Επιτυχής Διαγραφή</h1>
                      <p style="color: #5C4A3A;">Έχετε διαγραφεί με επιτυχία από τη λίστα των υπενθυμίσεων.</p>
                      <a href="${PUBLIC_BASE_URL}/" style="display: inline-block; margin-top: 20px; color: #8B6F4E; text-decoration: none; font-weight: bold;">Επιστροφή στην Αρχική</a>
                  </div>
              </div>
          `);
    } catch (err) {
      console.error("Unsubscribe Error:", err);
      res.status(500).send("Παρουσιάστηκε σφάλμα κατά τη διαγραφή.");
    }
  });

  router.post("/demo-requests", publicActionLimiter, asyncHandler(async (req, res) => {
    const { name, email, shop_name, phone, message } = req.body;

    if (!name || !email || !shop_name) {
      return res.status(400).json({ error: "Name, email and business name are required" });
    }
    await pool.query(
      `INSERT INTO demo_requests (name, email, shop_name, phone, message) VALUES ($1, $2, $3, $4, $5)`,
      [name, email, shop_name, phone || null, message || null],
    );

    // Best-effort notification — the lead is already saved above regardless of email outcome.
    try {
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
        from: `"BookFlow" <${process.env.EMAIL_USER}>`,
        to: process.env.DEMO_REQUEST_EMAIL || process.env.EMAIL_USER,
        replyTo: email,
        subject: `New demo request: ${shop_name}`,
        html: `
          <div style="font-family: sans-serif; font-size: 14px; color: #111;">
            <h2>New demo request</h2>
            <p><strong>Name:</strong> ${name}</p>
            <p><strong>Email:</strong> ${email}</p>
            <p><strong>Business:</strong> ${shop_name}</p>
            <p><strong>Phone:</strong> ${phone || "—"}</p>
            <p><strong>Message:</strong><br>${(message || "—").replace(/\n/g, "<br>")}</p>
          </div>
        `,
      });
    } catch (emailErr) {
      console.error("Demo request notification email failed:", emailErr);
    }

    res.json({ success: true });
  }, { log: "Demo request error:" }));

  router.get(
    "/confirm-appointment",
    publicActionLimiter,
    async (req, res) => {
      const crypto = require("crypto");
      const { id, token } = req.query;

      if (!id || !token) {
        return res.status(400).send("Μη έγκυρο αίτημα.");
      }

      // Verify the token matches the Appointment ID
      const expectedToken = crypto
        .createHmac("sha256", process.env.JWT_SECRET)
        .update(id.toString())
        .digest("hex");

      if (token !== expectedToken) {
        return res.status(403).send("Ο σύνδεσμος είναι άκυρος ή έχει λήξει.");
      }

      try {
        const { rows } = await pool.query("SELECT status FROM appointments WHERE id = $1", [id]);
        if (rows.length === 0 || rows[0].status === "cancelled") {
          return res
            .status(404)
            .send("Το ραντεβού δεν βρέθηκε ή έχει ήδη ακυρωθεί.");
        }

        // Only a booking still waiting for an answer changes: an old email's
        // link must not undo what has happened since (completed, no-show...).
        // Clicked again or too late, the client just sees the thank-you page.
        const updated = await pool.query(
          "UPDATE appointments SET status = 'confirmed' WHERE id = $1 AND status IN ('new', 'Booked', 'no-response') RETURNING shop_id",
          [id],
        );
        if (updated.rows[0]) io.to(`shop:${updated.rows[0].shop_id}`).emit("appointments:changed");

        // Success Styled Page
        res.send(`
        <div style="font-family: 'Inter', sans-serif; text-align: center; padding: 100px 20px; background: #F9F5F0; min-height: 100vh;">
            <div style="background: white; padding: 40px; border-radius: 32px; display: inline-block; box-shadow: 0 20px 25px rgba(139, 111, 78, 0.12); max-width: 400px;">
                <div style="font-size: 48px; margin-bottom: 20px;">✅</div>
                <h1 style="color: #2C2C2C; font-family: Georgia, serif; margin-bottom: 10px; font-size: 24px;">Το ραντεβού επιβεβαιώθηκε!</h1>
                <p style="color: #5C4A3A; line-height: 1.5;">Σας ευχαριστούμε. Η κράτησή σας έχει επισημανθεί ως επιβεβαιωμένη στο σύστημά μας. Ανυπομονούμε να σας δούμε!</p>
                <a href="${PUBLIC_BASE_URL}/" style="display: inline-block; margin-top: 30px; background: #8B6F4E; color: white; padding: 12px 24px; border-radius: 12px; text-decoration: none; font-weight: bold;">Επιστροφή στην Αρχική</a>
            </div>
        </div>
      `);
      } catch (err) {
        console.error("Confirmation Error:", err);
        res.status(500).send("Παρουσιάστηκε σφάλμα κατά την επιβεβαίωση.");
      }
    },
  );

  return router;
};
