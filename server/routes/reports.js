// Reports and financials: /api/v1/reports, /financials.
// Moved out of server.js; helpers that still live there are handed over when
// it mounts this router (see "Area routers" near the end of server.js).
// The reports, mounted in this order from routes/reports/: overview, sales, finances, logs.
const express = require("express");
const overviewRouter = require("./reports/overview");
const salesRouter = require("./reports/sales");
const financesRouter = require("./reports/finances");
const logsRouter = require("./reports/logs");

module.exports = function reportsRouter(deps) {
  const router = express.Router();
  router.use(overviewRouter(deps));
  router.use(salesRouter(deps));
  router.use(financesRouter(deps));
  router.use(logsRouter(deps));
  return router;
};
