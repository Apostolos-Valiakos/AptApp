// The shared places rules on the server, against the table the screens' copy
// is tested with too (tests/shared/capacityCases.json). No database needed.
//
// Run: node --test tests/server/capacityCases.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const cases = require("../shared/capacityCases.json");
const { personsOf, placesOf } = require("../../server/domain/bookings.js");

test("persons of a service row", () => {
  for (const c of cases.persons) assert.equal(personsOf(c.row), c.expected, JSON.stringify(c.row));
});

test("places of a staff member", () => {
  for (const c of cases.places) assert.equal(placesOf(c.staff), c.expected, JSON.stringify(c.staff));
});
