// Shared places (the sauna, the hammam): a staff member with capacity > 1
// takes several people at once. Used by booking checks (bookings.js), free
// times (availability.js) and the waitlist.
// The same rules as the screens' (client/src/utils/capacity.ts); both are
// tested against tests/shared/capacityCases.json.
/** How many persons a service row is for: a whole number, at least one. */
const personsOf = (svc) => Math.max(1, Math.floor(Number(svc?.persons)) || 1);
/** Places at the same time; 1 for an ordinary staff member. */
const placesOf = (staff) => Math.max(1, Number(staff?.capacity) || 1);

// The most persons present at one moment within [start, end), from rows
// { start, end, persons } (ms).
const peakPersons = (rows, start, end) => {
  const points = [];
  for (const r of rows) {
    const from = Math.max(r.start, start);
    const to = Math.min(r.end, end);
    if (from < to) points.push([from, r.persons], [to, -r.persons]);
  }
  // At the same moment, someone leaving frees the place before the next one comes.
  points.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  let now = 0;
  let peak = 0;
  for (const [, change] of points) {
    now += change;
    peak = Math.max(peak, now);
  }
  return peak;
};


module.exports = { personsOf, placesOf, peakPersons };
