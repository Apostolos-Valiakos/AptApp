// Dates in the shop's emails and pushes: Greek, in Athens time.
const athens = (options) => {
  const format = new Intl.DateTimeFormat("el-GR", { ...options, timeZone: "Europe/Athens" });
  return (date) => format.format(new Date(date));
};

module.exports = {
  /** "21 Οκτωβρίου 2026" */
  athensDate: athens({ day: "numeric", month: "long", year: "numeric" }),
  /** "10:05" */
  athensTime: athens({ hour: "2-digit", minute: "2-digit", hour12: false }),
  /** "Τρίτη, 21 Οκτωβρίου", whichever day it falls on. */
  athensDay: athens({ weekday: "long", day: "numeric", month: "long" }),
};
