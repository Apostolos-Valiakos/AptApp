// Offline mode end to end, in a real browser (headless Chrome) against the
// built app (client/dist — run `npm run build` first).
//
// Two servers share one throwaway copy of the dev database:
// - the app's server, stopped and started to cut the connection;
// - "another device" (a second server) that stays up, for the online edits
//   and bookings that compete with the ones made offline.
//
// Run: node --test tests/offline/e2e.test.mjs
// Chrome: /usr/bin/google-chrome, or set CHROME_PATH.
import { test, before, after, beforeEach, describe } from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import puppeteer from "puppeteer-core";
import { ROOT, SHOP, api, createTestDb, dropTestDb, sql, startServer, token } from "./helpers.mjs";

const require = createRequire(import.meta.url);
const DB = "offline_e2e_test";
const APP_PORT = 3193;
const OTHER_PORT = 3194;
const BASE = `http://localhost:${APP_PORT}`;
const PASSWORD = "e2e-offline-pass";
const TZ = "Europe/Athens";
const DIST = path.join(ROOT, "client/dist");

// Two weeks ahead: inside what the app keeps for offline use (30 days),
// and a day the tests clear of other bookings first.
const DAY = new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(new Date(Date.now() + 14 * 86400000));
const offset = (() => {
  const s = new Date(`${DAY}T12:00:00Z`).toLocaleString("en-US", { timeZone: TZ, timeZoneName: "longOffset" });
  const m = s.match(/GMT([+-]\d{2}):(\d{2})/);
  return m ? `${m[1]}:${m[2]}` : "+00:00";
})();
const at = (hhmm) => `${DAY}T${hhmm}:00${offset}`;

let appServer;
let otherServer;
let other; // API calls from "another device"
let browser;
let page;
let username;
const ids = {};
const dialogs = [];
let dialogAnswer = true;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const q = (query) => sql(DB, query);
const count = (query) => Number(q(query));

/** Polls `fn` until it returns something truthy. */
const waitFor = async (fn, what, timeoutMs = 30000) => {
  const end = Date.now() + timeoutMs;
  let last;
  while (Date.now() < end) {
    try {
      last = await fn();
      if (last) return last;
    } catch (err) {
      last = err;
    }
    await sleep(250);
  }
  // E2E_DEBUG=<folder>: a screenshot of the moment it gave up.
  if (process.env.E2E_DEBUG && page) {
    await page.screenshot({ path: path.join(process.env.E2E_DEBUG, `timeout-${Date.now()}.png`) }).catch(() => {});
  }
  throw new Error(`timed out waiting for ${what} (last: ${last instanceof Error ? last.message : JSON.stringify(last)})`);
};

// ---- the app's server: the "connection" ----------------------------------
const goOffline = async () => {
  if (!appServer) return;
  const { child } = appServer;
  appServer = null;
  if (child.exitCode === null) {
    child.kill();
    await new Promise((r) => child.once("exit", r));
  }
};
const startAppServer = async () => {
  appServer = await startServer(`${dbUri()}`, APP_PORT);
};
/** Server back; `nudge` = the browser reports the network is back (else the app finds out by itself). */
const goOnline = async ({ nudge = true } = {}) => {
  await startAppServer();
  if (nudge) await page.evaluate(() => window.dispatchEvent(new Event("online")));
};
let dbUriValue;
const dbUri = () => dbUriValue;

// ---- reading the app's state -----------------------------------------------
/** The queued writes, straight from the browser's IndexedDB. */
const queue = (p = page) =>
  p.evaluate(
    () =>
      new Promise((resolve, reject) => {
        const req = indexedDB.open("pure-offline-queue");
        req.onerror = () => reject(req.error);
        req.onsuccess = () => {
          const db = req.result;
          if (!db.objectStoreNames.contains("pending_writes")) {
            db.close();
            return resolve([]);
          }
          const all = db.transaction("pending_writes").objectStore("pending_writes").getAll();
          all.onsuccess = () => {
            db.close();
            // In replay order, as the app sorts them (stored order is by random id).
            const rows = all.result.sort((a, b) => a.createdAt - b.createdAt || String(a.id).localeCompare(String(b.id)));
            resolve(
              rows.map((w) => ({
                method: w.method,
                endpoint: w.endpoint,
                kind: w.kind,
                status: w.status,
                code: w.conflict?.code || null,
                body: w.body,
              })),
            );
          };
        };
      }),
  );
const bannerText = (p = page) =>
  p.evaluate(() => document.querySelector('[data-testid="offline-banner"]')?.textContent?.replace(/\s+/g, " ").trim() || "");
const cards = (p = page) =>
  p.evaluate(() =>
    [...document.querySelectorAll(".fc-event[data-appointment-id]")].map((el) => ({
      id: el.dataset.appointmentId,
      text: el.textContent.replace(/\s+/g, " ").trim(),
      pending: el.classList.contains("fc-offline-pending"),
      conflict: el.classList.contains("fc-offline-conflict"),
    })),
  );
/** Rows per store of the browser's offline database. */
const offlineRowCounts = () =>
  page.evaluate(
    () =>
      new Promise((resolve) => {
        const req = indexedDB.open("pure-offline-queue");
        req.onsuccess = () => {
          const db = req.result;
          const names = [...db.objectStoreNames];
          const out = {};
          const tx = db.transaction(names);
          names.forEach((n) => {
            const c = tx.objectStore(n).count();
            c.onsuccess = () => (out[n] = c.result);
          });
          tx.oncomplete = () => {
            db.close();
            resolve(out);
          };
        };
      }),
  );
const totalRows = async () => Object.values(await offlineRowCounts()).reduce((a, b) => a + b, 0);
const cardFor = async (id) => (await cards()).find((c) => c.id === id);

// ---- driving the UI ----------------------------------------------------------
const login = async (p = page) => {
  await p.goto(`${BASE}/login`, { waitUntil: "domcontentloaded" });
  await p.waitForSelector("input[autocomplete=username]");
  await p.type("input[autocomplete=username]", username);
  await p.type("input[type=password]", PASSWORD);
  await p.click("button[type=submit]");
  await p.waitForSelector(".fc-timegrid", { timeout: 30000 });
};

const shownDay = (p = page) =>
  p.evaluate(() => document.querySelector(".fc-timegrid-col[data-date]")?.dataset.date || "");

/** Moves the calendar to DAY with its arrows. */
const gotoDay = async (p = page) => {
  await p.waitForSelector(".fc-timegrid-col[data-date]", { timeout: 30000 });
  for (let i = 0; i < 60; i++) {
    const shown = await shownDay(p);
    if (shown === DAY) break;
    const icon = shown < DAY ? ".pi-chevron-right" : ".pi-chevron-left";
    await p.evaluate((sel) => {
      const btn = [...document.querySelectorAll("button")].find((b) => b.querySelector(sel) && b.offsetParent);
      btn?.click();
    }, icon);
    await waitFor(async () => (await shownDay(p)) !== shown, "the calendar to change day", 10000);
  }
  assert.equal(await shownDay(p), DAY);
  await sleep(800); // appointments for the day (server or saved copy)
};

const reloadApp = async (p = page) => {
  await p.reload({ waitUntil: "domcontentloaded" });
  await gotoDay(p);
};

const dialogOpen = () => page.evaluate(() => !!document.querySelector('[data-testid="booking-save"]'));

/** Clicks an empty slot: column of the first staff member, at hh:mm. */
const clickSlot = async (hhmm) => {
  const pt = await page.evaluate(
    (staffId, time) => {
      const col = document.querySelector(`.fc-timegrid-col[data-resource-id="${staffId}"]`);
      const slot = document.querySelector(`.fc-timegrid-slot-lane[data-time="${time}:00"]`);
      if (!col || !slot) return null;
      col.scrollIntoView({ block: "nearest", inline: "nearest" });
      slot.scrollIntoView({ block: "center" });
      const c = col.getBoundingClientRect();
      const s = slot.getBoundingClientRect();
      return { x: c.x + c.width / 2, y: s.y + s.height / 2 };
    },
    ids.staff,
    hhmm,
  );
  assert.ok(pt, `slot ${hhmm} for the test staff member is on screen`);
  await page.mouse.click(pt.x, pt.y);
  await waitFor(dialogOpen, "the booking dialog");
  await sleep(500);
  assert.ok(!(await page.$('[data-testid="booking-delete"]')), `the ${hhmm} slot opened a new booking, not an existing one`);
};

/** Opens an existing appointment's card. */
const openCard = async (id) => {
  await waitFor(() => cardFor(id), `the card of ${id}`);
  await page.evaluate((apptId) => {
    const el = document.querySelector(`.fc-event[data-appointment-id="${apptId}"]`);
    el.scrollIntoView({ block: "center" });
  }, id);
  const box = await (await page.$(`.fc-event[data-appointment-id="${id}"]`)).boundingBox();
  await page.mouse.click(box.x + box.width / 2, box.y + Math.min(10, box.height / 2));
  await waitFor(dialogOpen, "the booking dialog");
  await sleep(800);
};

const clickTestId = async (testId) => {
  await page.waitForSelector(`[data-testid="${testId}"]`, { visible: true, timeout: 10000 });
  await page.click(`[data-testid="${testId}"]`);
};

/** Picks the test service in the dialog's (only / first) service row. */
/** Ticks `serviceIds` (in that order) in the picker of the last service row, then Add. */
const pickServices = async (serviceIds) => {
  const pickers = await page.$$('[data-testid="service-picker"]');
  await pickers[pickers.length - 1].click();
  for (const id of serviceIds) {
    const sel = `[data-service-id="${id}"] > button`;
    await page.waitForSelector(sel, { visible: true, timeout: 10000 }).catch(async (err) => {
      if (process.env.E2E_DEBUG) await page.screenshot({ path: path.join(process.env.E2E_DEBUG, "pick-service.png") });
      throw err;
    });
    await page.click(sel);
  }
  await clickTestId("service-picker-confirm");
  await sleep(400);
};
const pickService = () => pickServices([ids.service]);

/** Chooses a client by name in the dialog's search. */
const pickClient = async (name) => {
  if (await page.$('[data-testid="booking-client-clear"]')) await clickTestId("booking-client-clear");
  await page.waitForSelector('[data-testid="client-search"] input', { visible: true });
  await page.type('[data-testid="client-search"] input', name, { delay: 30 });
  const option = await waitFor(
    () =>
      page.evaluate((n) => {
        const li = [...document.querySelectorAll(".p-autocomplete-option")].find((o) => o.textContent.includes(n));
        if (li) li.click();
        return !!li;
      }, name),
    `"${name}" in the client search`,
  );
  assert.ok(option);
  await sleep(500);
};

const saveDialog = async () => {
  await clickTestId("booking-save");
  // A confirmation (change summary) may come first.
  await sleep(500);
  const accept = await page.$(".p-confirmdialog-accept-button");
  if (accept) await accept.click();
  await waitFor(async () => !(await dialogOpen()), "the booking dialog to close", 15000);
};

const typeNote = async (text) => {
  await page.evaluate(() => {
    const tab = [...document.querySelectorAll("button")].find((b) => /Σημειώσεις|Notes/.test(b.textContent));
    tab.click();
  });
  const sel = "textarea.bg-amber-50";
  await page.waitForSelector(sel, { visible: true });
  await page.click(sel, { clickCount: 3 });
  await page.keyboard.press("Backspace");
  await page.type(sel, text);
};

/** A booking made through the API by "another device", for the test staff member. */
const otherDeviceBooking = async (hhmm, extra = {}, clientId = ids.client) => {
  const r = await other("POST", "/api/v1/appointments", {
    client_id: clientId,
    status: "confirmed",
    save_receipt: true,
    allow_unavailable: true,
    services: [{ service_id: ids.service, staff_id: ids.staff, start_time: at(hhmm), duration_override: 60, price_override: 40 }],
    ...extra,
  });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  return r.data;
};
const appointmentsAt = (hhmm, extraWhere = "") =>
  count(`SELECT count(DISTINCT a.id) FROM appointments a JOIN appointment_services s ON s.appointment_id = a.id
         WHERE s.staff_id = '${ids.staff}' AND s.start_time = '${at(hhmm)}' AND a.status <> 'cancelled' ${extraWhere}`);
const appointmentIdAt = (hhmm) =>
  q(`SELECT a.id FROM appointments a JOIN appointment_services s ON s.appointment_id = a.id
     WHERE s.staff_id = '${ids.staff}' AND s.start_time = '${at(hhmm)}' AND a.status <> 'cancelled' LIMIT 1`);

/** Opens the sync panel under the banner (clicking the banner toggles it). */
const openSyncPanel = async () => {
  await page.waitForSelector('[data-testid="offline-banner"]', { visible: true });
  if (!(await page.$('[data-testid^="offline-write-"]'))) await page.click('[data-testid="offline-banner"]');
  await page.waitForSelector('[data-testid^="offline-write-"]', { visible: true });
};

/** True once the queue is empty; otherwise fails with what's left (shown on timeout). */
const queueEmpty = async () => {
  const left = await queue();
  if (left.length === 0) return true;
  throw new Error(`queue: ${JSON.stringify(left.map(({ body, ...w }) => w))}`);
};

// ---------------------------------------------------------------------------
before(async () => {
  assert.ok(existsSync(path.join(DIST, "app-sw.js")), "client/dist has no app-sw.js: run `npm run build` first");
  process.env.APP_DIST_PATH = DIST;
  dbUriValue = createTestDb(DB);

  // A known frontdesk login.
  const hash = require("bcrypt").hashSync(PASSWORD, 4);
  username = q(`UPDATE users SET password = '${hash}', is_active = true
                WHERE id = (SELECT id FROM users WHERE shop_id = '${SHOP}' AND role = 'frontdesk' LIMIT 1)
                RETURNING username`).split("\n")[0];
  assert.ok(username, "the dev database has a frontdesk user");
  ids.admin = q(`SELECT id FROM users WHERE shop_id = '${SHOP}' AND role = 'admin' LIMIT 1`);

  // Everyone works 08:00-22:00 every day, so no overtime questions get in the way.
  q(`DELETE FROM staff_working_hours WHERE shop_id = '${SHOP}';
     INSERT INTO staff_working_hours (staff_id, shop_id, day_of_week, start_time, end_time, effective_from)
     SELECT s.id, s.shop_id, d, '08:00', '22:00', '2000-01-01' FROM staff s, generate_series(0, 6) d WHERE s.shop_id = '${SHOP}';`);
  // The test day starts empty.
  q(`UPDATE appointments SET status = 'cancelled' WHERE id IN (
       SELECT appointment_id FROM appointment_services WHERE start_time::date = '${DAY}')`);

  ids.client = q(`SELECT id FROM clients WHERE shop_id = '${SHOP}' AND phone IS NOT NULL AND first_name ILIKE '_%' AND first_name !~* 'walk' ORDER BY id LIMIT 1`);
  ids.clientName = q(`SELECT last_name FROM clients WHERE id = '${ids.client}'`);
  // A client with no bookings, so same-day grouping doesn't join their bookings.
  ids.soloClientName = "Μονοπελάτης";
  q(`INSERT INTO clients (first_name, last_name, phone, shop_id) VALUES ('Ε2Ε', '${ids.soloClientName}', '6900000777', '${SHOP}')`);
  ids.otherClient = q(`SELECT id FROM clients WHERE shop_id = '${SHOP}' AND id <> '${ids.client}' AND first_name !~* 'walk' ORDER BY id LIMIT 1`);

  otherServer = await startServer(dbUriValue, OTHER_PORT);
  other = api(OTHER_PORT, token(ids.admin, "admin"));
  await startAppServer();

  browser = await puppeteer.launch({
    executablePath: process.env.CHROME_PATH || "/usr/bin/google-chrome",
    headless: true,
    args: ["--no-sandbox"],
  });
  page = await browser.newPage();
  await page.emulateTimezone(TZ);
  await page.setViewport({ width: 1500, height: 950 });
  // window.confirm (sync panel, logout): answered with `dialogAnswer`.
  page.on("dialog", (d) => {
    dialogs.push(d.message());
    return dialogAnswer ? d.accept() : d.dismiss();
  });
  page.on("pageerror", (err) => console.log("[page error]", err.message));
  if (process.env.E2E_DEBUG) {
    page.on("console", (m) => console.log("[console]", m.type(), m.text().slice(0, 300)));
    page.on("request", (r) => r.method() !== "GET" && console.log("[request]", r.method(), r.url(), (r.postData() || "").slice(0, 200)));
    page.on("response", async (r) => {
      if (r.request().method() === "GET" && !r.url().includes("/appointments")) return;
      const body = r.request().method() !== "GET" ? await r.text().catch(() => "") : "";
      console.log("[response]", r.status(), r.url(), body.slice(0, 300));
    });
  }

  await login();
  // The test staff member: the calendar's first column.
  ids.staff = await page.evaluate(() => document.querySelector(".fc-timegrid-col[data-resource-id]")?.dataset.resourceId);
  assert.ok(ids.staff, "the calendar shows staff columns");
  // The test service: a plain one (no variations) with a price, offered by
  // them, and at most an hour long (the tests book every two hours).
  const staffServices = q(`SELECT coalesce(string_agg(service_id::text, ','), '') FROM staff_services WHERE staff_id = '${ids.staff}'`);
  ids.service = q(`SELECT id FROM services sv WHERE shop_id = '${SHOP}' AND is_active AND price > 0
                   AND NOT EXISTS (SELECT 1 FROM service_variations v WHERE v.service_id = sv.id)
                   AND duration_minutes BETWEEN 15 AND 60
                   ${staffServices ? `AND id::text IN (${staffServices.split(",").map((s) => `'${s}'`).join(",")})` : ""}
                   ORDER BY name LIMIT 1`);
  assert.ok(ids.service, "a plain service with a price");
  ids.service2 = q(`SELECT id FROM services sv WHERE shop_id = '${SHOP}' AND is_active AND price > 0 AND id <> '${ids.service}'
                    AND NOT EXISTS (SELECT 1 FROM service_variations v WHERE v.service_id = sv.id)
                    AND duration_minutes BETWEEN 15 AND 60
                    ${staffServices ? `AND id::text IN (${staffServices.split(",").map((s) => `'${s}'`).join(",")})` : ""}
                    ORDER BY name LIMIT 1`);
  ids.service2Minutes = Number(q(`SELECT duration_minutes FROM services WHERE id = '${ids.service2}'`));
  ids.serviceMinutes = Number(q(`SELECT duration_minutes FROM services WHERE id = '${ids.service}'`));

  // A booking made earlier online, which the offline calendar must show.
  ids.existing = (await otherDeviceBooking("09:00", { internal_notes: "made online" })).id;

  // Reload inside /app/: the page is now controlled by the service worker.
  await page.reload({ waitUntil: "domcontentloaded" });
  await waitFor(() => page.evaluate(() => !!navigator.serviceWorker.controller), "the service worker to control the page");
  await waitFor(
    () => page.evaluate(async () => !!(await caches.match("/app-shell.html"))),
    "the app shell in the cache",
  );
  await gotoDay();
  await waitFor(() => cardFor(ids.existing), "the online booking on the calendar");
  // Let the background download (coming weeks + client list) finish.
  await waitFor(
    () =>
      page.evaluate(
        () =>
          new Promise((resolve) => {
            const req = indexedDB.open("pure-offline-queue");
            req.onsuccess = () => {
              const db = req.result;
              const c = db.transaction("clients").objectStore("clients").count();
              c.onsuccess = () => {
                db.close();
                resolve(c.result > 0);
              };
            };
          }),
      ),
    "the client list saved for offline use",
  );
});

after(async () => {
  await browser?.close();
  await goOffline();
  otherServer?.stop();
  if (dbUriValue) dropTestDb(DB);
});

// ---------------------------------------------------------------------------
describe("offline mode in the browser", () => {
  // Each test starts from an empty queue, so one failure doesn't cascade.
  beforeEach(async () => {
    if ((await queue()).length === 0) return;
    console.log("[clearing writes left by an earlier test]");
    await page.evaluate(
      () =>
        new Promise((resolve) => {
          const req = indexedDB.open("pure-offline-queue");
          req.onsuccess = () => {
            const db = req.result;
            const tx = db.transaction("pending_writes", "readwrite");
            tx.objectStore("pending_writes").clear();
            tx.oncomplete = () => {
              db.close();
              resolve();
            };
          };
        }),
    );
    if (!appServer) await startAppServer();
    await reloadApp();
  });

  test("the app opens after a reload with the server down, showing the saved calendar", async () => {
    await goOffline();
    await reloadApp();
    await waitFor(() => cardFor(ids.existing), "the saved booking on the offline calendar");
    const banner = await waitFor(bannerText, "the offline banner");
    assert.match(banner, /Εκτός σύνδεσης|Offline/);
  });

  test("a booking made offline shows as pending, survives a reload and syncs by itself", async () => {
    await goOffline();
    await clickSlot("11:00");
    await pickClient(ids.clientName);
    await pickService();
    await saveDialog();

    const writes = await queue();
    assert.equal(writes.length, 1);
    assert.equal(writes[0].method, "POST");
    assert.equal(writes[0].kind, "appointment");
    const pendingCard = await waitFor(async () => (await cards()).find((c) => c.pending), "a pending card");
    assert.match(pendingCard.id, /^tmp-/);

    await reloadApp();
    assert.equal((await queue()).length, 1, "the queue survives a reload");
    await waitFor(async () => (await cards()).find((c) => c.pending), "the pending card after the reload");

    // The server comes back; the app finds out on its own (no "online" event).
    await goOnline({ nudge: false });
    await waitFor(queueEmpty, "the queue to sync", 45000);
    assert.equal(appointmentsAt("11:00", `AND a.client_id = '${ids.client}'`), 1, "exactly one booking reached the server");
    await waitFor(async () => {
      const list = await cards();
      return list.some((c) => !c.pending && c.id === appointmentIdAt("11:00")) && !list.some((c) => c.pending);
    }, "the card to switch to the real booking");
  });

  test("an offline edit that meets a newer online edit is flagged; keep mine wins", async () => {
    await goOffline();
    await openCard(ids.existing);
    await typeNote("offline note");
    await saveDialog();
    assert.equal((await queue())[0]?.method, "PUT");

    // Meanwhile, another device edits the same booking.
    const r = await other("PUT", `/api/v1/appointments/${ids.existing}`, {
      client_id: ids.client,
      status: "confirmed",
      allow_unavailable: true,
      internal_notes: "online note",
      services: [{ service_id: ids.service, staff_id: ids.staff, start_time: at("09:00"), duration_override: 60, price_override: 40 }],
    });
    assert.equal(r.status, 200, JSON.stringify(r.data));

    await goOnline();
    const [w] = await waitFor(async () => {
      const list = await queue();
      return list[0]?.status === "conflict" ? list : null;
    }, "the conflict");
    assert.equal(w.code, "stale_appointment");
    assert.equal(q(`SELECT internal_notes FROM appointments WHERE id = '${ids.existing}'`), "online note", "nothing overwritten yet");
    await waitFor(async () => (await cardFor(ids.existing))?.conflict, "the card marked as a conflict");

    await waitFor(bannerText, "the banner");
    await openSyncPanel();
    await clickTestId("offline-keep-mine");
    await waitFor(queueEmpty, "keep mine to sync");
    assert.equal(q(`SELECT internal_notes FROM appointments WHERE id = '${ids.existing}'`), "offline note");
  });

  test("keep theirs drops the offline edit and keeps the online one", async () => {
    await goOffline();
    await reloadApp();
    await openCard(ids.existing);
    await typeNote("mine again");
    await saveDialog();

    const r = await other("PUT", `/api/v1/appointments/${ids.existing}`, {
      client_id: ids.client,
      status: "confirmed",
      allow_unavailable: true,
      internal_notes: "theirs again",
      services: [{ service_id: ids.service, staff_id: ids.staff, start_time: at("09:00"), duration_override: 60, price_override: 40 }],
    });
    assert.equal(r.status, 200);

    await goOnline();
    await waitFor(async () => (await queue())[0]?.status === "conflict", "the conflict");
    await openSyncPanel();
    await clickTestId("offline-discard");
    await waitFor(queueEmpty, "the discarded write to leave the queue");
    assert.equal(q(`SELECT internal_notes FROM appointments WHERE id = '${ids.existing}'`), "theirs again");
    await waitFor(async () => {
      const c = await cardFor(ids.existing);
      return c && !c.conflict && !c.pending;
    }, "the card back to normal");
  });

  test("a slot booked online while offline is flagged; keep mine books both", async () => {
    await goOffline();
    await reloadApp();
    await clickSlot("13:00");
    await pickClient(ids.clientName);
    await pickService();
    await saveDialog();

    await otherDeviceBooking("13:00", { internal_notes: "other device" }, ids.otherClient);

    await goOnline();
    const [w] = await waitFor(async () => {
      const list = await queue();
      return list[0]?.status === "conflict" ? list : null;
    }, "the slot conflict");
    assert.equal(w.code, "slot_taken");
    assert.equal(appointmentsAt("13:00"), 1, "only the online booking so far");

    await openSyncPanel();
    await clickTestId("offline-keep-mine");
    await waitFor(queueEmpty, "keep mine to sync");
    assert.equal(appointmentsAt("13:00"), 2, "both bookings kept, as staff chose");
  });

  test("a payment taken offline for a booking made offline syncs to the right booking", async () => {
    await goOffline();
    await reloadApp();
    await clickSlot("15:00");
    await pickClient(ids.clientName);
    await pickService();
    await saveDialog();

    const tmpCard = await waitFor(async () => (await cards()).find((c) => c.pending && c.id.startsWith("tmp-")), "the pending booking");
    await openCard(tmpCard.id);
    await clickTestId("booking-payment-tab");
    await clickTestId("payment-submit");
    await waitFor(async () => (await queue()).some((w) => w.kind === "payment"), "the payment in the queue");
    await page.keyboard.press("Escape");

    await goOnline();
    await waitFor(queueEmpty, "booking and payment to sync", 45000);
    const id = appointmentIdAt("15:00");
    assert.ok(id, "the booking reached the server");
    const total = Number(q(`SELECT coalesce(sum(coalesce(aps.price_override, s.price)), 0) FROM appointment_services aps
                            JOIN services s ON s.id = aps.service_id WHERE aps.appointment_id = '${id}'`));
    const paid = Number(q(`SELECT coalesce(sum(amount), 0) FROM transactions WHERE appointment_id = '${id}'`));
    assert.ok(total > 0);
    assert.equal(paid, total, "the full price was paid, against the synced booking");
    assert.equal(count(`SELECT count(*) FROM transactions WHERE appointment_id = '${id}'`), 1, "paid once");
  });

  test("a new client added offline can be booked, found in search, and syncs once", async () => {
    await goOffline();
    await reloadApp();
    const last = `Offline${Date.now().toString().slice(-6)}`;
    await clickSlot("17:00");
    if (await page.$('[data-testid="booking-client-clear"]')) await clickTestId("booking-client-clear");
    await clickTestId("client-new");
    await page.type('[data-testid="client-new-first"]', "Νέα");
    await page.type('[data-testid="client-new-last"]', last);
    await page.type('[data-testid="client-new-phone"]', "6900000001");
    await clickTestId("client-new-save");
    await waitFor(async () => (await queue()).some((w) => w.kind === "client"), "the new client in the queue");
    await waitFor(async () => !(await page.$(".p-dialog-mask .p-dialog-header")), "the new client window to close");
    await sleep(400);
    await pickService();
    await saveDialog();

    // Findable offline straight away (another booking, same session).
    await clickSlot("19:00");
    await pickClient(last);
    await page.keyboard.press("Escape");
    await waitFor(async () => !(await dialogOpen()), "the dialog to close");

    await goOnline();
    await waitFor(queueEmpty, "client and booking to sync", 45000);
    assert.equal(count(`SELECT count(*) FROM clients WHERE last_name = '${last}'`), 1, "the client was created once");
    const clientId = q(`SELECT id FROM clients WHERE last_name = '${last}'`);
    assert.equal(appointmentsAt("17:00", `AND a.client_id = '${clientId}'`), 1, "the booking is linked to the new client");
  });

  test("a session that expired while offline keeps the queue until the next login", async () => {
    await goOffline();
    await reloadApp();
    await clickSlot("20:00");
    await pickClient(ids.clientName);
    await pickService();
    await saveDialog();
    assert.equal((await queue()).length, 1);

    // The session expires while the connection is down.
    require("dotenv").config({ path: path.join(ROOT, ".env"), quiet: true });
    const userId = q(`SELECT id FROM users WHERE username = '${username}'`);
    const expired = require("jsonwebtoken").sign({ userId, role: "frontdesk", shopId: SHOP, exp: Math.floor(Date.now() / 1000) - 60 }, process.env.JWT_SECRET);
    await page.evaluate((t) => localStorage.setItem("token", t), expired);

    await goOnline();
    // Either the app sent us to the login page, or the banner asks to log in.
    await waitFor(
      async () => page.url().includes("/login") || /σύνδεση έληξε|log in again/i.test(await bannerText()),
      "the app to ask for a login",
    );
    assert.equal((await queue()).length, 1, "nothing was dropped");
    assert.equal(appointmentsAt("20:00"), 0);

    await login();
    await waitFor(queueEmpty, "the queue to sync after logging in");
    assert.equal(appointmentsAt("20:00"), 1);
  });

  test("two open tabs: the second sees the first's offline change, and it syncs once", async () => {
    await gotoDay();
    const second = await browser.newPage();
    await second.emulateTimezone(TZ);
    await second.setViewport({ width: 1500, height: 950 });
    second.on("dialog", (d) => d.accept());
    await second.goto(`${BASE}/app/scheduler`, { waitUntil: "domcontentloaded" });
    await gotoDay(second);

    // A background tab doesn't render: bring each one forward to use it.
    await goOffline();
    await page.bringToFront();
    await clickSlot("21:00");
    await pickClient(ids.clientName);
    await pickService();
    await saveDialog();

    await second.bringToFront();
    await waitFor(async () => (await cards(second)).some((c) => c.pending), "the pending card in the second tab", 15000);
    assert.match(await bannerText(second), /1/, "the second tab's banner counts the change");

    await goOnline({ nudge: false });
    await Promise.all([page, second].map((p) => p.evaluate(() => window.dispatchEvent(new Event("online")))));
    await waitFor(queueEmpty, "the queue to sync");
    await sleep(1500);
    assert.equal(appointmentsAt("21:00"), 1, "synced once, not once per tab");
    await waitFor(async () => !(await cards(second)).some((c) => c.pending), "the second tab to show it synced");
    await second.close();
    await page.bringToFront();
  });

  test("cancelling a booking offline takes it off the calendar, and the cancellation syncs", async () => {
    const { id } = await otherDeviceBooking("12:00", {}, ids.otherClient);
    await reloadApp(); // online: the calendar has it
    await goOffline();
    await openCard(id);
    await clickTestId("booking-delete");
    await page.waitForSelector(".p-confirmdialog-accept-button", { visible: true });
    await page.click(".p-confirmdialog-accept-button");
    await waitFor(async () => (await queue()).some((w) => w.method === "DELETE"), "the cancellation in the queue");
    await waitFor(async () => !(await cardFor(id)), "the card to leave the calendar");
    assert.equal(appointmentsAt("12:00"), 1, "still on the server while offline");

    await goOnline();
    await waitFor(queueEmpty, "the cancellation to sync");
    assert.equal(appointmentsAt("12:00"), 0);
  });

  test("a booking made and then edited offline syncs as one booking, with the edit", async () => {
    await goOffline();
    await reloadApp();
    await clickSlot("14:00");
    await pickClient(ids.clientName);
    await pickService();
    await saveDialog();
    const tmp = await waitFor(async () => (await cards()).find((c) => c.pending && c.id.startsWith("tmp-")), "the pending booking");

    await openCard(tmp.id);
    await typeNote("edited before sync");
    await saveDialog();
    const writes = await queue();
    assert.deepEqual(writes.map((w) => w.method), ["POST", "PUT"]);
    assert.ok(writes[1].endpoint.includes(tmp.id), "the edit points at the booking's temporary id");

    await goOnline();
    await waitFor(queueEmpty, "both to sync");
    assert.equal(appointmentsAt("14:00"), 1, "one booking, not two");
    assert.equal(q(`SELECT internal_notes FROM appointments WHERE id = '${appointmentIdAt("14:00")}'`), "edited before sync");
  });

  test("a booking made and then cancelled offline leaves nothing behind", async () => {
    await goOffline();
    await reloadApp();
    await clickSlot("16:00");
    await pickClient(ids.clientName);
    await pickService();
    await saveDialog();
    const tmp = await waitFor(async () => (await cards()).find((c) => c.pending && c.id.startsWith("tmp-")), "the pending booking");

    await openCard(tmp.id);
    await clickTestId("booking-delete");
    await page.waitForSelector(".p-confirmdialog-accept-button", { visible: true });
    await page.click(".p-confirmdialog-accept-button");
    await waitFor(async () => !(await cardFor(tmp.id)), "the card to leave the calendar");

    await goOnline();
    await waitFor(queueEmpty, "the queue to sync");
    assert.equal(appointmentsAt("16:00"), 0, "nothing active at 16:00");
    assert.equal((await queue()).length, 0);
  });

  test("dragging a card offline moves it, and the move syncs", async () => {
    const { id } = await otherDeviceBooking("18:00", {}, ids.otherClient);
    await reloadApp();
    await goOffline();
    await waitFor(() => cardFor(id), "the card");
    await page.evaluate((apptId) => document.querySelector(`.fc-event[data-appointment-id="${apptId}"]`).scrollIntoView({ block: "center" }), id);
    const box = await (await page.$(`.fc-event[data-appointment-id="${id}"]`)).boundingBox();
    const slotHeight = await page.evaluate(() => document.querySelector(".fc-timegrid-slot-lane").getBoundingClientRect().height);
    // 30 minutes down: two 15-minute rows.
    const x = box.x + box.width / 2;
    const y = box.y + Math.min(15, box.height / 3);
    await page.mouse.move(x, y);
    await page.mouse.down();
    for (let i = 1; i <= 10; i++) await page.mouse.move(x, y + (2 * slotHeight * i) / 10, { steps: 2 });
    await page.mouse.up();
    // The scheduler asks to confirm the move.
    await page.waitForSelector(".p-confirmdialog-accept-button", { visible: true, timeout: 10000 });
    await page.click(".p-confirmdialog-accept-button");
    await waitFor(async () => (await queue()).some((w) => w.method === "PUT"), "the move in the queue");
    await waitFor(async () => (await cardFor(id))?.pending, "the moved card marked pending");

    await goOnline();
    await waitFor(queueEmpty, "the move to sync");
    assert.equal(appointmentsAt("18:30", `AND a.id = '${id}'`), 1, "now at 18:30 on the server");
  });

  test("searching clients offline ignores accents and capitals", async () => {
    await goOffline();
    await reloadApp();
    const name = q(`SELECT last_name FROM clients WHERE id = '${ids.otherClient}'`);
    const plainLower = name.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
    await clickSlot("10:00");
    if (await page.$('[data-testid="booking-client-clear"]')) await clickTestId("booking-client-clear");
    await page.type('[data-testid="client-search"] input', plainLower.slice(0, 5), { delay: 30 });
    await waitFor(
      () => page.evaluate((n) => [...document.querySelectorAll(".p-autocomplete-option")].some((o) => o.textContent.includes(n)), name),
      `"${name}" found by typing "${plainLower.slice(0, 5)}"`,
    );
    await page.keyboard.press("Escape");
    await page.keyboard.press("Escape");
    await goOnline();
  });

  test("a booking made on another screen appears without reloading, and paying it shows a confirmation", async () => {
    if (!appServer) await startAppServer();
    await reloadApp();
    // "Another screen": a booking through the same server the app uses.
    const viaApp = api(APP_PORT, token(ids.admin, "admin"));
    const r = await viaApp("POST", "/api/v1/appointments", {
      client_id: ids.otherClient,
      status: "confirmed",
      save_receipt: true,
      allow_unavailable: true,
      services: [{ service_id: ids.service, staff_id: ids.staff, start_time: at("19:00"), duration_override: 60, price_override: 40 }],
    });
    assert.equal(r.status, 200, JSON.stringify(r.data));
    await waitFor(() => cardFor(r.data.id), "the new booking on the open calendar, without a reload", 10000);

    // Pay it: a plain one-method payment must be confirmed on screen.
    await waitFor(async () => !(await page.$(".p-toast-message")), "earlier toasts to go", 15000);
    await openCard(r.data.id);
    await clickTestId("booking-payment-tab");
    await clickTestId("payment-submit");
    const toast = await waitFor(
      () => page.evaluate(() => [...document.querySelectorAll(".p-toast-message")].map((t) => t.textContent.replace(/\s+/g, " ")).join(" | ")),
      "a toast after paying",
    );
    assert.match(toast, /Η πληρωμή καταχωρήθηκε|Payment recorded/);
    // The suggested amount includes the client's earlier debt, so just the format.
    assert.match(toast, /\d+,\d{2} €/, "amount in the Greek format");
    assert.equal(count(`SELECT count(*) FROM transactions WHERE appointment_id = '${r.data.id}'`), 1);
    await page.keyboard.press("Escape");
  });

  test("deleting a paid booking offers to cancel it instead; the payment stays", async () => {
    if (!appServer) await startAppServer();
    await reloadApp();
    const viaApp = api(APP_PORT, token(ids.admin, "admin"));
    const r = await viaApp("POST", "/api/v1/appointments", {
      client_id: ids.otherClient,
      status: "confirmed",
      save_receipt: true,
      allow_unavailable: true,
      services: [{ service_id: ids.service, staff_id: ids.staff, start_time: at("16:00"), duration_override: 45, price_override: 30 }],
    });
    assert.equal(r.status, 200, JSON.stringify(r.data));
    assert.equal((await viaApp("POST", "/api/v1/transactions", { appointment_id: r.data.id, client_id: ids.otherClient, amount: 10, payment_method: "cash" })).status, 200);
    await waitFor(() => cardFor(r.data.id), "the paid booking on the calendar", 10000);

    await openCard(r.data.id);
    await clickTestId("booking-delete");
    await page.waitForSelector(".p-confirmdialog-accept-button", { visible: true });
    await page.click(".p-confirmdialog-accept-button");
    // The second question: it has payments, cancel instead?
    // (the first question is still closing for a moment)
    await waitFor(
      () => page.evaluate(() => /πληρωμές|payments/.test(document.querySelector(".p-confirmdialog")?.textContent || "")),
      "the 'has payments' question",
    );
    await sleep(300);
    await page.click(".p-confirmdialog-accept-button");
    await waitFor(() => q(`SELECT status FROM appointments WHERE id = '${r.data.id}'`) === "cancelled", "the booking cancelled");
    assert.equal(count(`SELECT count(*) FROM transactions WHERE appointment_id = '${r.data.id}'`), 1, "the payment stays linked");
  });

  test("several services picked at once, reordered by dragging, and moved together with Ctrl + drag", async () => {
    if (!appServer) await startAppServer();
    await reloadApp();
    await clickSlot("12:00");
    await pickClient(ids.soloClientName);
    await pickServices([ids.service, ids.service2]);

    const rowStarts = () =>
      page.evaluate(() =>
        [...document.querySelectorAll('[data-testid="service-row"]')].map((row) => ({
          name: row.querySelector('[data-testid="service-picker"]')?.textContent?.trim(),
          time: row.querySelector('.p-select-label, .p-dropdown-label, input[readonly]')?.textContent?.trim() || "",
        })),
      );
    const rows = await rowStarts();
    assert.equal(rows.length, 2, "two service rows");

    // Drag the second row above the first (by its handle).
    const handles = await page.$$('[data-testid="service-drag-handle"]');
    assert.equal(handles.length, 2, "each row has a handle");
    const from = await handles[1].boundingBox();
    const to = await handles[0].boundingBox();
    await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
    await page.mouse.down();
    for (let i = 1; i <= 12; i++) await page.mouse.move(from.x + from.width / 2, from.y + (to.y - 20 - from.y) * (i / 12), { steps: 2 });
    await page.mouse.up();
    await sleep(500);
    const after = await rowStarts();
    assert.equal(after[0].name, rows[1].name, "the second service is now first");
    await saveDialog();

    const id = await waitFor(
      () => q(`SELECT appointment_id FROM appointment_services WHERE staff_id = '${ids.staff}' AND start_time = '${at("12:00")}' AND service_id = '${ids.service2}' LIMIT 1`),
      "the booking saved",
    );
    const svc = () => q(`SELECT string_agg(service_id::text || '@' || to_char(start_time AT TIME ZONE 'Europe/Athens', 'HH24:MI'), ',' ORDER BY start_time)
                         FROM appointment_services WHERE appointment_id = '${id}'`);
    const second = new Date(new Date(`2000-01-01T12:00:00Z`).getTime() + ids.service2Minutes * 60000).toISOString().slice(11, 16);
    assert.equal(svc(), `${ids.service2}@12:00,${ids.service}@${second}`, "re-chained in the new order");

    // Ctrl + drag the first card 30 minutes down: both services move.
    await waitFor(async () => (await cards()).filter((c) => c.id === id).length === 2, "both cards on the calendar");
    const firstCard = await page.evaluateHandle((apptId) => {
      const els = [...document.querySelectorAll(`.fc-event[data-appointment-id="${apptId}"]`)];
      return els.sort((a, b) => a.getBoundingClientRect().top - b.getBoundingClientRect().top)[0];
    }, id);
    await firstCard.evaluate((el) => el.scrollIntoView({ block: "center" }));
    const box = await firstCard.boundingBox();
    const slotHeight = await page.evaluate(() => document.querySelector(".fc-timegrid-slot-lane").getBoundingClientRect().height);
    const x = box.x + box.width / 2;
    const y = box.y + Math.min(12, box.height / 3);
    await page.keyboard.down("Control");
    await page.mouse.move(x, y);
    await page.mouse.down();
    for (let i = 1; i <= 10; i++) await page.mouse.move(x, y + (2 * slotHeight * i) / 10, { steps: 2 });
    await page.mouse.up();
    await page.keyboard.up("Control");
    await page.waitForSelector(".p-confirmdialog-accept-button", { visible: true, timeout: 10000 });
    await page.click(".p-confirmdialog-accept-button");
    const shifted = new Date(new Date(`2000-01-01T12:30:00Z`).getTime() + ids.service2Minutes * 60000).toISOString().slice(11, 16);
    await waitFor(() => svc() === `${ids.service2}@12:30,${ids.service}@${shifted}`, "both services moved 30 minutes");
  });

  test("the sauna's overlapping bookings show as one card that opens, moves as a group and warns when full", async () => {
    if (!appServer) await startAppServer();
    const sauna = q(`SELECT id FROM staff WHERE shop_id = '${SHOP}' AND trim(name) = 'ΣΑΟΥΝΑ' LIMIT 1`);
    assert.ok(sauna, "the dev data has ΣΑΟΥΝΑ");
    assert.equal(q(`SELECT capacity FROM staff WHERE id = '${sauna}'`), "5", "5 places from the migration");
    q(`UPDATE staff SET visible_in_calendar = true, is_active = true WHERE id = '${sauna}'`);
    const saunaServices = q(`SELECT coalesce(string_agg(service_id::text, ','), '') FROM staff_services WHERE staff_id = '${sauna}'`);
    const service =
      q(`SELECT id FROM services sv WHERE shop_id = '${SHOP}' AND is_active AND duration_minutes BETWEEN 15 AND 60
         AND NOT EXISTS (SELECT 1 FROM service_variations v WHERE v.service_id = sv.id)
         ${saunaServices ? `AND id::text IN (${saunaServices.split(",").map((s) => `'${s}'`).join(",")})` : ""}
         ORDER BY name LIMIT 1`) || ids.service;
    const newClient = (last) =>
      q(`INSERT INTO clients (first_name, last_name, phone, shop_id) VALUES ('Ε2Ε', '${last}', '6900000888', '${SHOP}') RETURNING id`).split("\n")[0];
    const saunaBooking = async (hhmm, persons, clientId) => {
      const r = await other("POST", "/api/v1/appointments", {
        client_id: clientId,
        status: "confirmed",
        save_receipt: true,
        allow_unavailable: true,
        services: [{ service_id: service, staff_id: sauna, start_time: at(hhmm), duration_override: 60, price_override: 15, persons }],
      });
      assert.equal(r.status, 200, JSON.stringify(r.data));
      return r.data.id;
    };
    // 14:00 ×2, 14:00 ×1 and 14:30 ×1: at most 4 there together.
    const booked = [
      await saunaBooking("14:00", 2, newClient("Σαουνίδου")),
      await saunaBooking("14:00", 1, newClient("Σαουνάκης")),
      await saunaBooking("14:30", 1, newClient("Σαουνόπουλος")),
    ];
    await reloadApp();

    const group = () =>
      page.evaluate((id) => {
        // The earliest card of the sauna (another may form when someone moves out).
        const el = [...document.querySelectorAll(`.fc-timegrid-col[data-resource-id="${id}"] .fc-event.fc-place-group`)].sort((a, b) => a.getBoundingClientRect().top - b.getBoundingClientRect().top)[0];
        if (!el) return null;
        const badge = el.querySelector(".fc-place-group-badge");
        return {
          rows: el.querySelectorAll("[data-member]").length,
          span: el.querySelector(".fc-place-group-span")?.textContent.trim(),
          badge: badge?.textContent.trim(),
          level: badge?.className,
        };
      }, sauna);
    const shown = await waitFor(group, "the sauna's grouped card");
    assert.equal(shown.rows, 3, "one line per booking");
    assert.equal(shown.badge, "4/5");
    assert.match(shown.level, /is-almost/, "amber one before full");
    assert.equal((await cards()).filter((c) => booked.includes(c.id)).length, 0, "no separate cards");

    // A name opens that booking.
    const clickInGroup = async (selector) => {
      const pt = await page.evaluate(
        (id, sel) => {
          const card = [...document.querySelectorAll(`.fc-timegrid-col[data-resource-id="${id}"] .fc-event.fc-place-group`)].sort((a, b) => a.getBoundingClientRect().top - b.getBoundingClientRect().top)[0];
          card.scrollIntoView({ block: "center", inline: "nearest" });
          const r = card.querySelector(sel).getBoundingClientRect();
          return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
        },
        sauna,
        selector,
      );
      // Hover first, as a person does: entering a card redraws the calendar
      // (finer drag steps), which would swallow an instant click.
      await page.mouse.move(pt.x, pt.y);
      await sleep(400);
      await page.mouse.click(pt.x, pt.y);
    };
    await clickInGroup('[data-member="0"] .fc-place-group-name');
    await waitFor(dialogOpen, "the booking dialog");
    assert.ok(await page.$('[data-testid="booking-delete"]'), "an existing booking");
    await page.keyboard.press("Escape");
    await waitFor(async () => !(await dialogOpen()), "the dialog to close");

    // Opened: separate cards; a click elsewhere groups them again.
    await clickInGroup('[data-group-action="expand"]');
    await waitFor(
      async () => (await page.$$(".fc-event.fc-group-open[data-appointment-id]")).length === 3,
      "three separate cards",
    );
    await page.mouse.click(5, 5);
    await waitFor(group, "grouped again");

    // Anywhere but a name (here the badge) opens the group's dialog.
    await clickInGroup(".fc-place-group-badge");
    await page.waitForSelector('[data-testid="place-group-dialog"]', { visible: true });
    assert.equal((await page.$$('[data-testid="place-group-booking"]')).length, 3, "the dialog lists the three bookings");
    // A booking in it opens that booking.
    await page.click('[data-testid="place-group-booking"]');
    await waitFor(dialogOpen, "the booking dialog from the sauna dialog");
    assert.ok(await page.$('[data-testid="booking-delete"]'), "an existing booking");
    await waitFor(async () => !(await page.$('[data-testid="place-group-dialog"]')), "the sauna dialog closed");
    await page.keyboard.press("Escape");
    await waitFor(async () => !(await dialogOpen()), "the booking dialog to close");

    // One person dragged out of the opened group, 2 hours later: the group
    // closes, recounts without them, and they get a card of their own.
    await clickInGroup('[data-group-action="expand"]');
    const opened = `.fc-event.fc-group-open[data-appointment-id="${booked[2]}"]`;
    await page.waitForSelector(opened, { visible: true });
    const card = await (await page.$(opened)).boundingBox();
    const step = await page.evaluate(() => document.querySelector(".fc-timegrid-slot-lane").getBoundingClientRect().height);
    const cx = card.x + card.width / 2;
    const cy = card.y + Math.min(10, card.height / 3);
    await page.mouse.move(cx, cy);
    await sleep(400); // hover first (see clickInGroup)
    await page.mouse.down();
    for (let i = 1; i <= 10; i++) await page.mouse.move(cx, cy + (8 * step * i) / 10, { steps: 2 });
    await page.mouse.up();
    await page.waitForSelector(".p-confirmdialog-accept-button", { visible: true, timeout: 10000 });
    await page.click(".p-confirmdialog-accept-button");
    await waitFor(
      () => q(`SELECT to_char(start_time AT TIME ZONE 'Europe/Athens', 'HH24:MI') FROM appointment_services WHERE appointment_id = '${booked[2]}'`) === "16:30",
      "the move saved",
    );
    const recounted = await waitFor(async () => {
      const g = await group();
      return !(await page.$(".fc-event.fc-group-open")) && g?.rows === 2 ? g : null;
    }, "the group closed and recounted");
    assert.equal(recounted.badge, "3/5", "2 + 1 persons left");
    assert.equal(recounted.span, "14:00–15:00");
    const own = await page.evaluate(
      (id) => document.querySelectorAll(`.fc-timegrid-col[data-resource-id="${id}"] .fc-event.fc-place-group`).length,
      sauna,
    );
    assert.equal(own, 2, "the moved person on a card of their own");

    // Dragging the card moves all three, 30 minutes down.
    const box = await page.evaluate((id) => {
      const r = [...document.querySelectorAll(`.fc-timegrid-col[data-resource-id="${id}"] .fc-event.fc-place-group`)].sort((a, b) => a.getBoundingClientRect().top - b.getBoundingClientRect().top)[0].querySelector(".fc-place-group-head").getBoundingClientRect();
      // The header's left end (on narrow cards the time span there is hidden).
      return { x: r.x + 6, y: r.y + r.height / 2 };
    }, sauna);
    const slotHeight = await page.evaluate(() => document.querySelector(".fc-timegrid-slot-lane").getBoundingClientRect().height);
    await page.mouse.move(box.x, box.y);
    await sleep(400); // hover first (see clickInGroup)
    await page.mouse.down();
    for (let i = 1; i <= 10; i++) await page.mouse.move(box.x, box.y + (2 * slotHeight * i) / 10, { steps: 2 });
    await page.mouse.up();
    await waitFor(
      () => page.evaluate(() => /Μετακίνηση 2 |Move 2 /.test(document.querySelector(".p-confirmdialog")?.textContent || "")),
      "the group move question (2 bookings left in it)",
    );
    await page.click(".p-confirmdialog-accept-button");
    const startsOf = () =>
      q(`SELECT string_agg(to_char(start_time AT TIME ZONE 'Europe/Athens', 'HH24:MI'), ',' ORDER BY start_time)
         FROM appointment_services WHERE appointment_id IN (${booked.map((id) => `'${id}'`).join(",")})`);
    await waitFor(() => startsOf() === "14:30,14:30,16:30", "the group's two moved 30 minutes, the one moved out stays");

    // "+" books one more at the card's start; 3 more persons is over the places: asked, then booked anyway.
    // Redrawn at the new time (the old card has 3 lines too).
    await waitFor(async () => (await group())?.span === "14:30–15:30", "the moved group");
    await clickInGroup('[data-group-action="add"]');
    await waitFor(dialogOpen, "a new booking dialog");
    await sleep(500);
    const last = "Σαουνίδης";
    newClient(last);
    await pickClient(last);
    await pickServices([service]);
    await page.waitForSelector('[data-testid="service-persons"]', { visible: true });
    for (let i = 0; i < 2; i++) {
      await page.click('[data-testid="service-persons"] .p-inputnumber-increment-button');
      await sleep(150);
    }
    await clickTestId("booking-save");
    await waitFor(
      () => page.evaluate(() => /θέσεις|places/i.test(document.querySelector(".p-confirmdialog")?.textContent || "")),
      "the 'no places left' question",
    );
    await page.click(".p-confirmdialog-accept-button");
    await waitFor(async () => !(await dialogOpen()), "the booking dialog to close", 15000);
    assert.equal(
      q(`SELECT s.persons FROM appointment_services s JOIN appointments a ON a.id = s.appointment_id JOIN clients c ON c.id = a.client_id
         WHERE c.last_name = '${last}' AND s.staff_id = '${sauna}'`),
      "3",
      "booked for 3 persons",
    );
    const full = await waitFor(async () => ((await group())?.rows === 3 ? group() : null), "the new booking in the card");
    // 3 at 14:30 plus 3 more.
    assert.equal(full.badge, "6/5");
    assert.match(full.level, /is-full/);
  });

  test("εξόφληση in the client's history settles part of a past booking's debt", async () => {
    if (!appServer) await startAppServer();
    const clientId = q(`INSERT INTO clients (first_name, last_name, phone, shop_id) VALUES ('Ε2Ε', 'Οφειλέτης', '6900000999', '${SHOP}') RETURNING id`).split("\n")[0];
    const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
    const past = await other("POST", "/api/v1/appointments", {
      client_id: clientId,
      status: "completed",
      save_receipt: true,
      allow_unavailable: true,
      services: [{ service_id: ids.service, staff_id: ids.staff, start_time: `${yesterday}T10:00:00${offset}`, duration_override: 60, price_override: 40 }],
    });
    assert.equal(past.status, 200, JSON.stringify(past.data));
    // In another staff member's column, which no other test books, so no
    // other card overlaps this one.
    await reloadApp();
    const sauna = q(`SELECT coalesce((SELECT id::text FROM staff WHERE shop_id = '${SHOP}' AND trim(name) = 'ΣΑΟΥΝΑ' LIMIT 1), '')`);
    const column = await page.evaluate(
      (skip) => [...document.querySelectorAll(".fc-timegrid-col[data-resource-id]")].map((c) => c.dataset.resourceId).find((id) => !skip.includes(id)),
      [ids.staff, sauna],
    );
    const today = await other("POST", "/api/v1/appointments", {
      client_id: clientId,
      status: "confirmed",
      save_receipt: true,
      allow_unavailable: true,
      services: [{ service_id: ids.service, staff_id: column, start_time: at("12:00"), duration_override: 60, price_override: 40 }],
    });
    assert.equal(today.status, 200, JSON.stringify(today.data));
    await reloadApp();
    await openCard(today.data.id);

    // The history's "Εξόφληση" for yesterday's 40 € booking.
    await waitFor(
      () =>
        page.evaluate(() => {
          const btn = [...document.querySelectorAll("button")].find((b) => b.textContent.trim() === "Εξόφληση" && b.offsetParent);
          btn?.click();
          return !!btn;
        }),
      "the Εξόφληση button in the history",
    );
    await clickTestId("debt-amount");
    await page.waitForSelector('[data-testid="debt-amount-input"] input', { visible: true });
    await page.click('[data-testid="debt-amount-input"] input', { clickCount: 3 });
    await page.keyboard.press("Backspace");
    await page.type('[data-testid="debt-amount-input"] input', "15");
    await page.keyboard.press("Enter");
    await waitFor(
      () =>
        page.evaluate(() =>
          [...document.querySelectorAll(".p-dialog")].some((d) => /θα μείνουν 25,00|25,00 € will remain/.test(d.textContent || "")),
        ),
      "what will remain shown",
    );
    await page.evaluate(() => {
      const dialog = [...document.querySelectorAll(".p-dialog")].find((d) => d.querySelector('[data-testid="debt-amount"]'));
      [...dialog.querySelectorAll("button")].find((b) => /Επιβεβαίωση|Confirm/.test(b.textContent))?.click();
    });
    await waitFor(() => q(`SELECT coalesce(sum(amount), 0)::numeric(10,2) FROM transactions WHERE appointment_id = '${past.data.id}'`) === "15.00", "15 € paid");
    assert.equal(q(`SELECT payment_status FROM appointments WHERE id = '${past.data.id}'`), "partial");
    await page.keyboard.press("Escape");
  });

  test("logging out deletes the offline data, after warning about changes not synced yet", async () => {
    await goOffline();
    await reloadApp();
    await clickSlot("10:00");
    await pickClient(ids.clientName);
    await pickService();
    await saveDialog();
    assert.equal((await queue()).length, 1);

    // The "saved offline" toast sits over the logout button for a few seconds.
    await waitFor(async () => !(await page.$(".p-toast-message")), "the toast to go", 15000);

    // "No": stays logged in, nothing deleted.
    dialogs.length = 0;
    dialogAnswer = false;
    await clickTestId("logout");
    await waitFor(() => dialogs.length > 0, "the unsynced-changes warning");
    assert.match(dialogs[0], /1/);
    await sleep(500);
    assert.ok(page.url().includes("/app/"), "still in the app");
    assert.equal((await queue()).length, 1);

    // "Yes": logged out, and nothing is left on the device.
    dialogAnswer = true;
    await clickTestId("logout");
    await waitFor(() => !page.url().includes("/app/"), "the logout");
    assert.equal(await totalRows(), 0, JSON.stringify(await offlineRowCounts()));
    assert.equal(await page.evaluate(() => localStorage.getItem("token")), null);

    // Next login (online): the data is downloaded again.
    await goOnline();
    await login();
    await waitFor(async () => (await offlineRowCounts()).clients > 0, "the client list saved again");

    // Nothing waiting: logs out without asking, and clears.
    dialogs.length = 0;
    await clickTestId("logout");
    await waitFor(() => !page.url().includes("/app/"), "the logout");
    assert.equal(dialogs.length, 0, "no warning when everything is synced");
    assert.equal(await totalRows(), 0, JSON.stringify(await offlineRowCounts()));
    await login(); // leave the session as the other tests expect
  });
});
