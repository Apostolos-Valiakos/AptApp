// Comparing phone numbers as people type them: "+30 698 375 6457",
// "6983756457" and "0030 6983756457" are the same number. Used to find a
// client who already has the phone being entered for a new client.

/** The digits that identify a phone: without spaces or signs, and without +30/0030 before a 10-digit Greek number. */
const phoneKey = (phone) =>
  String(phone || "")
    .replace(/\D/g, "")
    .replace(/^(?:0030|30)(\d{10})$/, "$1");

/** The same, as SQL over a column. */
const phoneKeySql = (column) => `regexp_replace(regexp_replace(COALESCE(${column}, ''), '\\D', '', 'g'), '^(0030|30)(\\d{10})$', '\\2')`;

// Shorter than this isn't a whole number yet (still being typed).
const MIN_PHONE_DIGITS = 10;

/** The shop's clients with this phone (deleted ones aside), as the client picker lists them. */
const clientsWithPhone = async (db, shopId, phone) => {
  const key = phoneKey(phone);
  if (key.length < MIN_PHONE_DIGITS) return [];
  const { rows } = await db.query(
    `SELECT id, first_name, last_name, first_name || ' ' || last_name AS full_name,
            email, phone, outstanding_balance, custom_fields, notes,
            (id = (SELECT walk_in_client_id FROM shops WHERE id = $1)) AS is_walk_in
     FROM active_clients
     WHERE shop_id = $1 AND ${phoneKeySql("phone")} = $2
     ORDER BY last_name, first_name`,
    [shopId, key],
  );
  return rows.filter((c) => !c.is_walk_in);
};

module.exports = { phoneKey, phoneKeySql, MIN_PHONE_DIGITS, clientsWithPhone };
