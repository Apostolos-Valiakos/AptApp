// The redesigned Wallet and check-in pass (REDESIGN_SPEC.md §5.4): the QR
// carries the client's own token (WL1, K6), packages show what's left (WL2,
// K7), and the pass opens with no connection from the token kept on the
// device (WL3, N13).
import { describe, expect, test, vi } from "vitest";
import WalletView from "../../client/src/portal/views/WalletView.vue";
import PassView from "../../client/src/portal/views/PassView.vue";
import el from "../../client/src/i18n/locales/el";
import { fakeServer, mountScreen, pageText, saveLogin, settle } from "./helpers";

const qr = vi.hoisted(() => ({ drawn: [] as { text: string; options: any }[] }));
vi.mock("qrcode", () => ({ default: { toCanvas: async (_c: unknown, text: string, options: any) => void qr.drawn.push({ text, options }) } }));

const ROUTES = {
  "GET /api/v1/shop": { body: { id: "s1", name: "Pure" } },
  "GET /api/v1/clients/c1/full": { body: { client: { first_name: "Μαρία", last_name: "Παπά", qr_token: "QR-TOKEN-1" }, history: [] } },
  "GET /api/v1/clients/c1/membership": { body: { membership: { tier_name: "Gold", current_period_end: "2026-12-31" }, usage: [{ service_id: "x", service_name: "Σάουνα", used_this_month: 1, quota_per_month: 4 }] } },
  "GET /api/v1/clients/c1/packages": { body: [{ id: "p1", name: "5 μασάζ", state: "active", remaining: 3, total_visits: 5, used: 2, expires_at: null }] },
};
const open = async (screen: any, routes: Record<string, any> = ROUTES) => {
  qr.drawn.length = 0;
  saveLogin({ id: "u1", role: "client", shop_id: "s1", client_id: "c1" });
  fakeServer(routes);
  mountScreen(screen);
  await settle();
  await settle();
};

describe("WL1 the pass's QR (K6)", () => {
  test("the client's own token, with medium error correction; their name and tier on it", async () => {
    await open(PassView);
    expect(qr.drawn.at(-1)).toEqual({ text: "QR-TOKEN-1", options: expect.objectContaining({ errorCorrectionLevel: "M" }) });
    expect(pageText()).toContain("Μαρία Παπά");
    expect(pageText()).toContain("Gold");
    expect(pageText()).toContain(el.portal.v2.wallet.showAtReception);
  });
});

describe("WL2 the wallet (K6, K7)", () => {
  test("the pass, the membership with its usage, and each package with the visits left", async () => {
    await open(WalletView);
    expect(document.querySelector('[data-testid="pass-card"]')!.getAttribute("href")).toBe("/portal/wallet/pass");
    expect(document.querySelector('[data-testid="membership"]')!.textContent).toContain("1 / 4");
    const packages = document.querySelector('[data-testid="packages"]')!.textContent!;
    expect(packages).toContain("5 μασάζ");
    expect(packages).toContain(el.portal.v2.home.visitsLeft.replace("{left}", "3").replace("{total}", "5"));
  });
});

describe("WL3 the pass with no connection (N13)", () => {
  test("an earlier visit keeps the token on the device", async () => {
    await open(PassView);
    expect(localStorage.getItem("portal.passToken")).toBe("QR-TOKEN-1");
  });

  test("with no connection, the pass opens from it", async () => {
    localStorage.setItem("portal.passToken", "QR-KEPT");
    await open(PassView, Object.fromEntries(Object.keys(ROUTES).map((k) => [k, "network-down"])));
    expect(qr.drawn.at(-1)?.text).toBe("QR-KEPT");
  });
});
