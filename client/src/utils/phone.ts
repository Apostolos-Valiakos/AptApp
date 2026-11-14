// Comparing phone numbers as people type them: "+30 698 375 6457",
// "6983756457" and "0030 6983756457" are the same number. The server
// compares them the same way (server/domain/phones.js).

/** The digits that identify a phone: without spaces or signs, and without +30/0030 before a 10-digit Greek number. */
export const phoneKey = (phone: string | null | undefined) =>
  String(phone || "")
    .replace(/\D/g, "")
    .replace(/^(?:0030|30)(\d{10})$/, "$1");

/** Shorter than this isn't a whole number yet (still being typed). */
export const MIN_PHONE_DIGITS = 10;
