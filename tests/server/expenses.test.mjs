// Daily and monthly expenses: who sees and changes what, categories, the report
// and how monthly expenses count in Analytics.
//
// Run: node --test tests/server/expenses.test.mjs
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { SHOP, api, createTestDb, dropTestDb, sql, startServer, token } from "../offline/helpers.mjs";

const DB = "expenses_test";
const PORT = 3213;
let server;
let admin;
let frontdesk;
const uuid = "SELECT id FROM users WHERE shop_id = '" + SHOP + "' AND role = ";
const TZ = "Europe/Athens";
const today = () => new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(new Date());
const expense = (extra = {}) => ({ amount: 10, expense_date: today(), description: "test", payment_method: "cash", ...extra });

before(async () => {
  const uri = createTestDb(DB);
  sql(DB, `DELETE FROM expenses WHERE shop_id = '${SHOP}'`);
  server = await startServer(uri, PORT);
  admin = api(PORT, token(sql(DB, `${uuid}'admin' LIMIT 1`), "admin"));
  frontdesk = api(PORT, token(sql(DB, `${uuid}'admin' LIMIT 1`), "frontdesk"));
});
after(() => {
  server?.stop();
  dropTestDb(DB);
});

test("frontdesk adds daily expenses and can't add, see or touch monthly ones", async () => {
  const daily = await frontdesk("POST", "/api/v1/expenses", expense({ description: "fd daily" }));
  assert.equal(daily.status, 201, JSON.stringify(daily.data));
  assert.equal(sql(DB, `SELECT kind FROM expenses WHERE id = '${daily.data.id}'`), "daily");
  assert.equal((await frontdesk("POST", "/api/v1/expenses", expense({ kind: "monthly" }))).status, 403);

  const monthly = await admin("POST", "/api/v1/expenses", expense({ kind: "monthly", amount: 800, description: "rent", expense_date: "2026-10-17" }));
  assert.equal(monthly.status, 201, JSON.stringify(monthly.data));
  assert.equal(sql(DB, `SELECT expense_date FROM expenses WHERE id = '${monthly.data.id}'`), "2026-10-01", "kept on the 1st");

  assert.equal((await frontdesk("GET", "/api/v1/expenses?kind=monthly")).status, 403);
  const seen = await frontdesk("GET", "/api/v1/expenses?from=2020-01-01&to=2030-01-01");
  assert.ok(seen.data.every((e) => e.kind === "daily"));
  assert.ok(!seen.data.some((e) => e.id === monthly.data.id));
  assert.equal((await frontdesk("PUT", `/api/v1/expenses/${monthly.data.id}`, expense())).status, 404);
  assert.equal((await frontdesk("DELETE", `/api/v1/expenses/${monthly.data.id}`)).status, 404);
  const asAdmin = await admin("GET", "/api/v1/expenses?kind=monthly&from=2020-01-01&to=2030-01-01");
  assert.ok(asAdmin.data.some((e) => e.id === monthly.data.id));
});

test("frontdesk sees every daily expense but changes only today's, and can't move it to another day", async () => {
  const old = await admin("POST", "/api/v1/expenses", expense({ expense_date: "2026-01-15", description: "old" }));
  const fresh = await frontdesk("POST", "/api/v1/expenses", expense({ description: "fresh" }));
  const seen = (await frontdesk("GET", "/api/v1/expenses?from=2020-01-01&to=2030-01-01")).data;
  assert.equal(seen.find((e) => e.id === old.data.id).editable, false);
  assert.equal(seen.find((e) => e.id === fresh.data.id).editable, true);

  const refused = await frontdesk("PUT", `/api/v1/expenses/${old.data.id}`, expense({ expense_date: "2026-01-15", amount: 99 }));
  assert.equal(refused.status, 403);
  assert.equal(refused.data.error, "only_today");
  assert.equal((await frontdesk("DELETE", `/api/v1/expenses/${old.data.id}`)).status, 403);

  assert.equal((await frontdesk("PUT", `/api/v1/expenses/${fresh.data.id}`, expense({ expense_date: "2026-01-15", amount: 20 }))).status, 200);
  assert.equal(sql(DB, `SELECT amount || ' ' || (expense_date = '${today()}') FROM expenses WHERE id = '${fresh.data.id}'`), "20.00 true");

  assert.equal((await admin("PUT", `/api/v1/expenses/${old.data.id}`, expense({ expense_date: "2026-01-16", amount: 99 }))).status, 200);
  assert.equal((await frontdesk("DELETE", `/api/v1/expenses/${fresh.data.id}`)).status, 200);
});

test("only admins manage categories; a removed one stays on its expenses", async () => {
  assert.equal((await frontdesk("POST", "/api/v1/expense-categories", { name: "Nope" })).status, 403);
  const made = await admin("POST", "/api/v1/expense-categories", { name: "Ενοίκιο" });
  assert.equal(made.status, 201, JSON.stringify(made.data));
  const other = await admin("POST", "/api/v1/expense-categories", { name: "Μισθοί" });
  assert.equal((await admin("PUT", `/api/v1/expense-categories/${other.data.id}`, { name: "ενοίκιο" })).status, 409);

  const used = await admin("POST", "/api/v1/expenses", expense({ category_id: made.data.id }));
  assert.equal((await admin("DELETE", `/api/v1/expense-categories/${made.data.id}`)).status, 200);
  const offered = (await frontdesk("GET", "/api/v1/expense-categories")).data;
  assert.ok(!offered.some((c) => c.id === made.data.id));
  const row = (await admin("GET", `/api/v1/expenses?from=${today()}&to=${today()}`)).data.find((e) => e.id === used.data.id);
  assert.equal(row.category_name, "Ενοίκιο");

  const back = await admin("POST", "/api/v1/expense-categories", { name: "ενοίκιο" });
  assert.equal(back.data.id, made.data.id, "the same name brings it back");
  assert.equal((await admin("POST", "/api/v1/expenses", expense({ category_id: "00000000-0000-4000-8000-000000000000" }))).status, 400);
});

test("the report compares a month with the one before and a year earlier; admins only", async () => {
  const cat = (await admin("POST", "/api/v1/expense-categories", { name: "Report Rent" })).data.id;
  const add = (expense_date, amount, extra = {}) => admin("POST", "/api/v1/expenses", expense({ expense_date, amount, category_id: cat, kind: "monthly", ...extra }));
  await add("2025-06-01", 700);
  await add("2026-05-01", 800);
  await add("2026-06-01", 850);
  await add("2026-06-20", 50, { kind: "daily", category_id: null });

  const r = await admin("GET", "/api/v1/reports/expenses?month=2026-06");
  assert.equal(r.status, 200, JSON.stringify(r.data));
  assert.equal(r.data.months.length, 12);
  assert.equal(r.data.months[0].month, "2025-07");
  assert.deepEqual(r.data.months[11], { month: "2026-06", daily: 50, monthly: 850 });
  assert.equal(r.data.months[10].monthly, 800);
  assert.equal(r.data.last_year.monthly, 700);
  const row = r.data.categories.find((c) => c.category === "Report Rent");
  assert.deepEqual([row.current, row.previous, row.last_year], [850, 800, 700]);
  assert.equal(r.data.categories.find((c) => c.category === null).current, 50);

  const noCash = await admin("GET", "/api/v1/reports/expenses?month=2026-06&excludeCash=true");
  assert.equal(noCash.data.months[11].monthly, 0, "the cash toggle hides them here too");
  assert.equal((await frontdesk("GET", "/api/v1/reports/expenses?month=2026-06")).status, 403);
  assert.equal((await admin("GET", "/api/v1/reports/expenses?month=June")).status, 400);
});

test("in Analytics a monthly expense counts only when the period covers its whole month", async () => {
  await admin("POST", "/api/v1/expenses", expense({ kind: "monthly", amount: 1000, expense_date: "2027-03-01", description: "rent" }));
  await admin("POST", "/api/v1/expenses", expense({ amount: 30, expense_date: "2027-03-05", description: "oil" }));
  const total = async (from, to) =>
    (await admin("GET", `/api/v1/reports/finances?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`)).data.total_expenses;
  assert.equal(await total("2027-03-01T00:00:00+02:00", "2027-03-31T23:59:59+03:00"), 1030, "the whole month");
  assert.equal(await total("2027-03-01T00:00:00+02:00", "2027-03-10T23:59:59+02:00"), 30, "part of it, daily only");
  assert.equal(await total("2027-03-02T00:00:00+02:00", "2027-03-31T23:59:59+03:00"), 30, "starting after the 1st");
  assert.equal(await total("2027-02-01T00:00:00+02:00", "2027-04-30T23:59:59+03:00"), 1030, "a longer period");
});
