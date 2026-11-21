// The shop's outgoing mail (reminders, memberships, client invitations, demo
// requests): one SMTP set-up from EMAIL_HOST / EMAIL_PORT / EMAIL_USER /
// EMAIL_PASS. It connects over IPv4 only (as the request routes always did)
// and gives up on a server that doesn't answer within 10 seconds, so a stuck
// mail server can't hold up a request or a cron job.
const nodemailer = require("nodemailer");

const createMailTransport = () =>
  nodemailer.createTransport({
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

module.exports = { createMailTransport };
