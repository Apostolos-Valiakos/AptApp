// The Analytics page's tiles: the period's money in one row first (payments
// in, expenses out, net), then sales, debts, retention and cancellations;
// "collected today" only when the period is today alone. AN1–AN2.
import { describe, expect, test } from "vitest";
import { defineComponent, h, provide, ref } from "vue";
import { useI18n } from "vue-i18n";
import FinancialsKpis from "../../client/src/components/financials/FinancialsKpis.vue";
import { FinancialsKey } from "../../client/src/components/financials/context";
import { formatDate } from "../../client/src/utils/format";
import el from "../../client/src/i18n/locales/el";
import { fakeServer, mountScreen, saveLogin, settle } from "./helpers";

const byTestId = (id: string) => document.querySelector<HTMLElement>(`[data-testid="${id}"]`);
const finances = { total_sales: 1837, total_payments: 1818, collected_today: 1818, total_debt: 0, total_expenses: 120, net_profit: 1698 };
const analytics = { retention_rate: 58.2, returning_clients: 32, new_clients: 23, cancellation_rate: 4 };

const mountTiles = async (from: Date, to: Date) => {
  saveLogin({ id: "u1", role: "admin", shop_id: "s1" });
  fakeServer();
  const opened: string[] = [];
  const Page = defineComponent({
    setup() {
      const { t, locale } = useI18n();
      provide(FinancialsKey, {
        loading: ref(false),
        filters: ref({ from, to }),
        finances: ref(finances),
        analytics: ref(analytics),
        openDetails: (kind: string) => opened.push(kind),
        formatDate: (d: Date | null) => formatDate(d, locale.value, "dayMonth"),
        t,
      } as any);
      return () => h(FinancialsKpis);
    },
  });
  mountScreen(Page);
  await settle();
  return opened;
};

describe("AN1 the period's money is the first row: in, out and what's left", () => {
  test("payments, expenses and net, in that order, in their own row; each opens its list", async () => {
    const opened = await mountTiles(new Date(2026, 10, 1), new Date(2026, 10, 30));
    const row = byTestId("kpi-money-row")!;
    expect([...row.querySelectorAll("[data-testid^='tile-']")].map((e) => e.getAttribute("data-testid"))).toEqual(["tile-payments", "tile-expenses", "tile-net"]);
    expect(row.textContent).toContain("1.818,00");
    expect(row.textContent).toContain("120,00");
    expect(row.textContent).toContain("1.698,00");
    // Before everything else on the page.
    expect(document.querySelector("[data-testid^='tile-']")!.getAttribute("data-testid")).toBe("tile-payments");
    byTestId("tile-net")!.click();
    expect(opened).toEqual(["net"]);
  });

  test("sales, debts, retention and cancellations follow", async () => {
    await mountTiles(new Date(2026, 10, 1), new Date(2026, 10, 30));
    for (const id of ["tile-sales", "tile-debts", "tile-retention", "tile-cancellations"]) {
      expect(byTestId(id)).not.toBeNull();
      expect(byTestId("kpi-money-row")!.contains(byTestId(id))).toBe(false);
    }
  });
});

describe("AN2 \"collected today\" only when the period is today", () => {
  test("shown for today alone", async () => {
    await mountTiles(new Date(), new Date());
    expect(byTestId("tile-today")!.textContent).toContain(el.analytics.kpi.collectedToday);
  });

  test("not for a past day, nor a period that only includes today", async () => {
    await mountTiles(new Date(2026, 10, 20), new Date(2026, 10, 20));
    expect(byTestId("tile-today")).toBeNull();
    const now = new Date();
    await mountTiles(new Date(now.getFullYear(), now.getMonth(), now.getDate() - 3), now);
    expect(byTestId("tile-today")).toBeNull();
  });
});
