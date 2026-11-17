// Clients routes (/api/v1/clients*), moved out of server.js unchanged.
// Helpers that still live in server.js are handed over when it mounts this
// router (see "Area routers" near the end of server.js).
// The client routes, mounted in this order from routes/clients/: list, account, card, invite, memberships.
const express = require("express");
const listRouter = require("./clients/list");
const accountRouter = require("./clients/account");
const cardRouter = require("./clients/card");
const inviteRouter = require("./clients/invite");
const membershipsRouter = require("./clients/memberships");

module.exports = function clientsRouter(deps) {
  const router = express.Router();
  router.use(listRouter(deps));
  router.use(accountRouter(deps));
  router.use(cardRouter(deps));
  router.use(inviteRouter(deps));
  router.use(membershipsRouter(deps));
  return router;
};
