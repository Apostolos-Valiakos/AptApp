// Runs one reminder job against a test database and prints what it would have
// sent. Sending is replaced before the service loads, so no email can leave.
//
// Usage: node reminder-runner.cjs <one|overlap|fail|push>  (POSTGRES_URI in the environment)
const path = require("node:path");

const root = path.resolve(__dirname, "../..");
process.env.RUN_JOBS = "0";
process.env.EMAIL_HOST = "mail.invalid";
process.env.EMAIL_USER = "";
process.env.EMAIL_PASS = "";
process.env.VAPID_PUBLIC_KEY = "";
process.env.VAPID_PRIVATE_KEY = "";

const mode = process.argv[2];
const sent = [];
const nodemailer = require(path.join(root, "node_modules/nodemailer"));
nodemailer.createTransport = () => ({
  sendMail: async (mail) => {
    await new Promise((r) => setTimeout(r, 50));
    if (mode === "fail") throw new Error("mail server down");
    sent.push(mail.to);
  },
});
const { processReminders, processPushReminders } = require(path.join(root, "server/reminderService.js"));

(async () => {
  if (mode === "overlap") await Promise.all([processReminders(), processReminders()]);
  else if (mode === "push") await processPushReminders();
  else await processReminders();
  console.log(JSON.stringify(sent));
  process.exit(0);
})();
