// Small helpers shared across the routes.

const safeUUID = (id) => {
  if (!id || typeof id !== "string") return null;
  const cleanId = id.trim();
  return cleanId.length === 36 ? cleanId : null;
};

// --- VISIBILITY HELPER ---
// If user is 'super_admin', return empty string (no filter).
// If user is standard (staff, admin, manager), filter out 'completed' unless 'save_receipt' is true.
const getVisibilityClause = (user, tableAlias = "a") => {
  if (user.role === "super_admin") {
    return "";
  }
  return ` AND ${tableAlias}.save_receipt = true`;
};

// The client row if it is this shop's walk-in client, otherwise null.
const walkInClientRow = async (db, clientId, shopId) => {
  if (!safeUUID(clientId)) return null;
  const { rows } = await db.query(
    `SELECT c.first_name, c.last_name, c.email, c.phone
     FROM shops s JOIN clients c ON c.id = s.walk_in_client_id
     WHERE s.id = $1 AND c.id = $2`,
    [shopId, clientId],
  );
  return rows[0] || null;
};

const clientInShop = async (db, clientId, shopId) =>
  (await db.query("SELECT 1 FROM clients WHERE id = $1 AND shop_id = $2", [clientId, shopId])).rowCount > 0;

module.exports = {
  safeUUID,
  getVisibilityClause,
  walkInClientRow,
  clientInShop,
};
