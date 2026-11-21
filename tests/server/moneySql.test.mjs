// The shared money sums (server/domain/moneySql.js) give, for every
// appointment of a copy of the local data, exactly what each hand-written
// copy they replaced gave (code review proposal 6); and they follow the rule
// for a line without a price of its own: the catalogue price.
//
// Run: node --test tests/server/moneySql.test.mjs
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { createTestDb, dropTestDb, sql } from "../offline/helpers.mjs";

const require = createRequire(import.meta.url);
const { servicesCostSql, productsCostSql, appointmentCostSql, appointmentPaidSql } = require("../../server/domain/moneySql.js");

const DB = "money_sql_test";
before(() => createTestDb(DB));
after(() => dropTestDb(DB));

// The copies that were in the routes, word for word but for the id.
const OLD = {
  services: [
    (r) => `COALESCE((SELECT SUM(COALESCE(aps.price_override, s.price)) FROM appointment_services aps JOIN services s ON s.id = aps.service_id WHERE aps.appointment_id = ${r}), 0)`,
    (r) => `COALESCE((SELECT SUM(COALESCE(aps.price_override, s.price, 0)) FROM appointment_services aps LEFT JOIN services s ON s.id = aps.service_id WHERE aps.appointment_id = ${r}), 0)`,
    (r) => `COALESCE((SELECT SUM(COALESCE(aps2.price_override, s2.price)) FROM appointment_services aps2 JOIN services s2 ON aps2.service_id = s2.id WHERE aps2.appointment_id = ${r}), 0)`,
    (r) => `COALESCE((SELECT SUM(price_override) FROM appointment_services WHERE appointment_id = ${r}), 0)`,
  ],
  products: [(r) => `COALESCE((SELECT SUM(total_price) FROM product_sales WHERE appointment_id = ${r}), 0)`],
  paid: [
    (r) => `COALESCE((SELECT SUM(amount) FROM transactions WHERE appointment_id = ${r}), 0)`,
    (r) => `COALESCE((SELECT SUM(t.amount) FROM transactions t WHERE t.appointment_id = ${r}), 0)`,
  ],
};

const differing = (oldSql, newSql) =>
  Number(sql(DB, `SELECT count(*) FROM appointments a WHERE (${oldSql}) IS DISTINCT FROM (${newSql})`));

test("there is data to compare", () => {
  assert.ok(Number(sql(DB, "SELECT count(*) FROM appointments")) > 100);
  assert.ok(Number(sql(DB, "SELECT count(*) FROM transactions WHERE appointment_id IS NOT NULL")) > 10);
  assert.ok(Number(sql(DB, "SELECT count(*) FROM product_sales")) > 0, "some products sold");
});

test("the services' cost is what every old copy gave", () => {
  OLD.services.forEach((old, i) => assert.equal(differing(old("a.id"), servicesCostSql("a.id")), 0, `copy ${i + 1}`));
});

test("the products' cost and the amount paid are what the old copies gave", () => {
  assert.equal(differing(OLD.products[0]("a.id"), productsCostSql("a.id")), 0);
  OLD.paid.forEach((old, i) => assert.equal(differing(old("a.id"), appointmentPaidSql("a.id")), 0, `copy ${i + 1}`));
  assert.equal(differing(`${OLD.services[0]("a.id")} + ${OLD.products[0]("a.id")}`, appointmentCostSql("a.id")), 0);
});

test("a line without a price of its own costs the catalogue price", () => {
  const line = sql(DB, "SELECT aps.id || '|' || aps.appointment_id || '|' || s.price FROM appointment_services aps JOIN services s ON s.id = aps.service_id WHERE s.price > 0 ORDER BY aps.id LIMIT 1").split("|");
  const others = Number(sql(DB, `SELECT COALESCE(SUM(price_override), 0) FROM appointment_services WHERE appointment_id = '${line[1]}' AND id <> '${line[0]}'`));
  sql(DB, `UPDATE appointment_services SET price_override = NULL WHERE id = '${line[0]}'`);
  assert.equal(Number(sql(DB, `SELECT ${servicesCostSql(`'${line[1]}'`)}`)), others + Number(line[2]));
});
