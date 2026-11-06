// Which pages each role may open: the real route table and guard, navigated
// for real. U1–U4 in test-report.html.
import { beforeEach, describe, expect, test } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import router from "../../client/src/router";
import { saveLogin } from "./helpers";

const as = (role: string | null) => {
  localStorage.clear();
  if (role) saveLogin({ id: "1", role });
  setActivePinia(createPinia());
};
const landsOn = async (path: string) => {
  await router.push(path);
  return router.currentRoute.value.path;
};

const ANALYTICS = ["/app/product-usage", "/app/financials", "/app/membership-report"];
const SHOP_ADMIN = ["/app/membership-tiers", "/app/expenses", "/app/packages"];
const PLATFORM = ["/app/platform/shops", "/app/platform/demo-requests"];
const OPEN_TO_FRONTDESK = [
  "/app/scheduler", "/app/staff", "/app/staff-schedule", "/app/clients", "/app/services", "/app/products",
  "/app/gift-cards", "/app/daily-report", "/app/qr-scanner", "/app/profile",
];
const PORTAL = "/portal/home";

beforeEach(async () => {
  as(null);
  await router.push("/signup"); // a neutral page anyone may open
});

describe("U1 logged in or not", () => {
  test.each(["/app/scheduler", "/app/financials", "/app/platform/shops", "/portal/home"])(
    "logged out, %s leads to the login page",
    async (path) => {
      expect(await landsOn(path)).toBe("/login");
    },
  );
  test("logged out, the login and signup pages open", async () => {
    expect(await landsOn("/login")).toBe("/login");
    expect(await landsOn("/signup")).toBe("/signup");
  });
  test.each([
    ["admin", "/app/scheduler"],
    ["staff", "/app/scheduler"],
    ["client", PORTAL],
    ["owner", "/app/platform/shops"],
  ])("logged in as %s, the login page leads to their start page", async (role, start) => {
    as(role);
    expect(await landsOn("/login")).toBe(start);
  });
});

describe("U2 the client portal and the staff app are kept apart", () => {
  test.each(["/app/scheduler", "/app/clients", "/app/financials", "/app/profile"])(
    "a client asking for %s stays in the portal",
    async (path) => {
      as("client");
      expect(await landsOn(path)).toBe(PORTAL);
    },
  );
  test("a client's portal opens", async () => {
    as("client");
    expect(await landsOn("/portal/appointments")).toBe("/portal/appointments");
  });
  test.each(["admin", "frontdesk", "staff"])("%s can't open the portal", async (role) => {
    as(role);
    expect(await landsOn(PORTAL)).toBe("/app/scheduler");
  });
});

describe("U3 restricted pages", () => {
  test.each([...ANALYTICS, ...SHOP_ADMIN])("admin opens %s", async (path) => {
    as("admin");
    expect(await landsOn(path)).toBe(path);
  });
  test.each([...ANALYTICS, ...SHOP_ADMIN])("super admin opens %s", async (path) => {
    as("super_admin");
    expect(await landsOn(path)).toBe(path);
  });
  test.each(PLATFORM)("owner opens %s", async (path) => {
    as("owner");
    expect(await landsOn(path)).toBe(path);
  });
  test.each(ANALYTICS)("front desk can't open %s", async (path) => {
    as("frontdesk");
    expect(await landsOn(path)).toBe("/app/scheduler");
  });
  test.each([...SHOP_ADMIN, ...OPEN_TO_FRONTDESK])("front desk opens %s", async (path) => {
    as("frontdesk");
    expect(await landsOn(path)).toBe(path);
  });
  test.each(["admin", "super_admin", "frontdesk"])("%s can't open the platform pages", async (role) => {
    as(role);
    for (const path of PLATFORM) expect(await landsOn(path)).toBe("/app/scheduler");
  });
});

describe("U4 staff have the scheduler and their profile, nothing else", () => {
  test.each(["/app/scheduler", "/app/profile"])("staff open %s", async (path) => {
    as("staff");
    expect(await landsOn(path)).toBe(path);
  });
  test.each([
    ...OPEN_TO_FRONTDESK.filter((p) => p !== "/app/scheduler" && p !== "/app/profile"),
    ...ANALYTICS,
    ...SHOP_ADMIN,
    ...PLATFORM,
  ])("staff asking for %s get the scheduler", async (path) => {
    as("staff");
    expect(await landsOn(path)).toBe("/app/scheduler");
  });
});
