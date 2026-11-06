// Settling a debt: payment or write-off, all of it or part.

// GET FULL CLIENT PROFILE (Info + History + File Metadata)
// Lightweight: last N past appointments for the booking sidebar
// ==================== DEBT ====================
const DEBT_PAYMENT_METHODS = ["cash", "card", "bank-transfer"];

// "payment" records money received; "write_off" cancels the debt without revenue.
const parseDebtResolution = (body) => {
  const mode = body.mode;
  if (mode === "write_off") return { method: "write-off", type: "write_off" };
  if (mode === "payment" && DEBT_PAYMENT_METHODS.includes(body.payment_method)) {
    return { method: body.payment_method, type: "payment" };
  }
  return null;
};

// How much of what's owed to settle: `amount` from the body (part of it), or
// everything when not sent. Null when it isn't a positive amount; above what's
// owed is refused by the caller.
const settleAmount = (body, owed) => {
  if (body.amount === undefined || body.amount === null || body.amount === "") return owed;
  const n = Math.round(Number(body.amount) * 100) / 100;
  return n > 0 ? n : null;
};

module.exports = {
  DEBT_PAYMENT_METHODS,
  parseDebtResolution,
  settleAmount,
};
