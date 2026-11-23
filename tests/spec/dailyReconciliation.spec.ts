// The Daily Report's reconciliation: Sales − Uncollected = Expected, against
// the day's Payments, each difference explained. Admins only; not shown while
// amounts are hidden; the password is retyped first, as for Analytics. DR1–DR5.
import { beforeEach, describe, expect, test } from "vitest";
import DailyReportView from "../../client/src/views/DailyReportView.vue";
import { useSettingsStore } from "../../client/src/stores/settings";
import { reauthToken } from "../../client/src/utils/reauth";
import el from "../../client/src/i18n/locales/el";
import { fakeServer, mountScreen, saveLogin, settle } from "./helpers";

const daily = { date: "2026-11-20", total_collected: 1818, by_method: [], payments: [], appointment_count: 57, by_status: {} };
const balanced = {
  day: "2026-11-20",
  sales: 1837,
  uncollected: 64,
  expected: 1773,
  payments: 1818,
  delta: 45,
  unexplained: 0,
  lines: [
    { key: "otherDaysBookings", sign: 1, amount: 75, rows: [{ id: 1, created_at: "2026-11-20T09:00:00", first_name: "ΣΟΦΙΑ", last_name: "ΣΑΠΑΚΟΥ", payment_method: "card", amount: 75 }] },
    { key: "paidEarlier", sign: -1, amount: -30, rows: [{ id: 2, created_at: "2026-11-18T18:00:00", client: "ΜΑΡΙΑ Π.", payment_method: "cash", amount: 30 }] },
  ],
  paid_later: { amount: 20, rows: [] },
  bookings: [],
};
const byTestId = (id: string) => document.querySelector<HTMLElement>(`[data-testid="${id}"]`);

beforeEach(() => {
  reauthToken.value = null;
});

// The password already retyped, unless `locked`.
const open = async (role: "admin" | "frontdesk", reconciliation: any = { body: balanced }, locked = false) => {
  saveLogin({ id: "u1", role, shop_id: "s1" });
  if (!locked) reauthToken.value = "proof";
  const server = fakeServer({
    "GET /api/v1/reports/daily": { body: daily },
    "GET /api/v1/reports/daily/reconciliation": reconciliation,
    "POST /api/v1/reauth": { body: { token: "proof" } },
  });
  mountScreen(DailyReportView);
  await settle();
  return server;
};

describe("DR1 admins see whether the day's money adds up", () => {
  test("Sales − Uncollected = Expected, the day's Payments and Δ; balanced when nothing is unexplained", async () => {
    const server = await open("admin");
    expect(server.called("GET", "/api/v1/reports/daily/reconciliation")[0]?.url).toMatch(/date=\d{4}-\d{2}-\d{2}/);
    expect(byTestId("reconciliation-sales")!.textContent).toContain("1.837,00");
    expect(byTestId("reconciliation-expected")!.textContent).toContain("1.773,00");
    expect(byTestId("reconciliation-payments")!.textContent).toContain("1.818,00");
    expect(byTestId("reconciliation-delta")!.textContent).toContain("+45,00");
    expect(byTestId("daily-reconciliation")!.textContent).toContain(el.dailyReport.reconciliation.uncollected);
    expect(byTestId("reconciliation-status")!.textContent).toContain(el.dailyReport.reconciliation.balanced);
    expect(byTestId("reconciliation-paid-later")!.textContent).toContain("20,00");
  });

  test("an unexplained difference is flagged", async () => {
    await open("admin", { body: { ...balanced, unexplained: -19 } });
    expect(byTestId("reconciliation-status")!.textContent).toContain(el.dailyReport.reconciliation.unbalanced);
    expect(byTestId("reconciliation-unexplained")!.textContent).toContain("-19,00");
  });
});

describe("DR2 each difference is a line that opens to its payments", () => {
  test("lines with their sign; opened, the payments behind one", async () => {
    await open("admin");
    const other = byTestId("reconciliation-line-otherDaysBookings")!;
    expect(other.textContent).toContain(el.dailyReport.reconciliation.lines.otherDaysBookings);
    expect(other.textContent).toContain("+75,00");
    expect(byTestId("reconciliation-line-paidEarlier")!.textContent).toContain("-30,00");
    expect(other.textContent).not.toContain("ΣΑΠΑΚΟΥ");
    (other.querySelector("button") as HTMLElement).click();
    await settle();
    expect(other.textContent).toContain("ΣΟΦΙΑ ΣΑΠΑΚΟΥ");
  });
});

describe("DR3 front desk doesn't see it", () => {
  test("no card and nothing fetched", async () => {
    const server = await open("frontdesk");
    expect(byTestId("daily-reconciliation")).toBeNull();
    expect(server.called("GET", "/api/v1/reports/daily/reconciliation")).toHaveLength(0);
  });
});

// Requirement changed (23/11/2026): the whole card is left out, not replaced by a note.
describe("DR4 not shown at all while amounts are hidden (Ctrl+1 / Ctrl+8)", () => {
  test("no card and nothing asked for; back when the amounts are, asking for the password again", async () => {
    const server = await open("admin");
    const asked = () => server.called("GET", "/api/v1/reports/daily/reconciliation").length;
    const before = asked();
    for (const hide of ["hideCashPaid", "hideCardPaid"] as const) {
      useSettingsStore()[hide] = true;
      await settle();
      expect(byTestId("daily-reconciliation")).toBeNull();
      expect(asked()).toBe(before);
      useSettingsStore()[hide] = false;
      await settle();
    }
    expect(byTestId("daily-reconciliation")).not.toBeNull();
    expect(byTestId("daily-reconciliation")!.querySelector('[data-testid="sensitive-gate"]')).not.toBeNull();
  });
});

describe("DR5 the password is retyped before the figures, as for Analytics", () => {
  test("the card asks for it and fetches nothing until then; the rest of the report is there", async () => {
    const server = await open("admin", { body: balanced }, true);
    expect(byTestId("daily-reconciliation")!.querySelector('[data-testid="sensitive-gate"]')).not.toBeNull();
    expect(byTestId("sensitive-cancel")).toBeNull();
    expect(server.called("GET", "/api/v1/reports/daily/reconciliation")).toHaveLength(0);
    expect(server.called("GET", "/api/v1/reports/daily")).toHaveLength(1);
    const field = byTestId("sensitive-password")!.querySelector("input") ?? (byTestId("sensitive-password") as HTMLInputElement);
    (field as HTMLInputElement).value = "secret";
    field.dispatchEvent(new Event("input"));
    await settle();
    byTestId("sensitive-submit")!.click();
    await settle();
    expect(server.called("POST", "/api/v1/reauth")[0]?.body).toEqual({ password: "secret" });
    expect(byTestId("reconciliation-sales")!.textContent).toContain("1.837,00");
  });
});
