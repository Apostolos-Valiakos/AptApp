// Product-level feature switches for Book4Beauty.
//
// Contests (client draws, QR-scan entries) are switched off: the routes are not
// mounted and a QR scan never registers an entry. The client hides its contest
// screens with a matching flag (profileView.vue, portal/ClientHomeView.vue).
const CONTESTS_ENABLED = false;

module.exports = { CONTESTS_ENABLED };
