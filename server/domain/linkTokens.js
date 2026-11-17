// Links in emails that work without logging in (unsubscribe, confirm a
// booking) carry a signature of the id they're for, made with the server's
// secret, so nobody can make one for another client or booking.
const crypto = require("crypto");

const signLink = (id) =>
  id ? crypto.createHmac("sha256", process.env.JWT_SECRET).update(String(id)).digest("hex") : "";

/** Whether `token` is the signature of `id` (compared in constant time). */
const isValidLinkToken = (id, token) => {
  const expected = Buffer.from(signLink(id));
  const given = Buffer.from(String(token || ""));
  return expected.length > 0 && expected.length === given.length && crypto.timingSafeEqual(expected, given);
};

module.exports = { signLink, isValidLinkToken };
