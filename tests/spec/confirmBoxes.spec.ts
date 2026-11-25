// Every question needs a box on screen to show in. A question asked with no
// box open for it waits forever: the action it guards silently does nothing
// (a calendar drop saved nothing; deleting a package type never worked).
// The screen-test helper adds a box to every screen it mounts, so screen
// tests can't see a missing one; this reads the source instead.
import { describe, expect, test } from "vitest";
import fs from "node:fs";
import path from "node:path";

const SRC = path.resolve(__dirname, "../../client/src");
const read = (rel: string) => fs.readFileSync(path.join(SRC, rel), "utf8");
const files = (dir: string): string[] =>
  fs.readdirSync(path.join(SRC, dir), { withFileTypes: true }).flatMap((e) => {
    const rel = path.join(dir, e.name);
    return e.isDirectory() ? files(rel) : /\.(vue|ts)$/.test(e.name) ? [rel] : [];
  });

const asks = (rel: string) => /useConfirm\(\)/.test(read(rel));
// A box for questions asked without a group: <ConfirmDialog> or <ConfirmDialog />, no group.
const hasPageBox = (rel: string) => /<ConfirmDialog(?![^>]*group)[^>]*>/.test(read(rel));
const hasOwnBox = (rel: string) => /<ConfirmDialog\b/.test(read(rel));

// Parts that ask through their page's box, and the pages that show them.
const USES_PAGE_BOX: Record<string, string[]> = {
  "views/scheduler/useSchedulerCore.ts": ["views/SchedulerView.vue"],
  "components/ClientQuickProfileDialog.vue": ["views/SchedulerView.vue"],
  "components/waitlist/WaitlistPanel.vue": ["views/SchedulerView.vue"],
  "components/DiscountCodesAdmin.vue": ["views/profileView.vue"],
  "views/settings/ForceLogoutCard.vue": ["views/profileView.vue"],
  "components/expenses/ExpenseSuppliers.vue": ["views/ExpensesView.vue"],
  // Helpers: they ask with the confirm they're given.
  "utils/confirm.ts": [],
  "utils/capacity.ts": [],
  // The booking dialog's state: BookingDialog.vue draws its box (own group).
  "components/booking/dialog/useBookingState.ts": ["components/BookingDialog.vue"],
};

describe("CB1 every question has a box to show in", () => {
  const askers = files(".").filter(asks);

  test("every screen or component that asks draws its own box, or is listed with the pages that do", () => {
    const missing = askers.filter((rel) => !hasOwnBox(rel) && !(rel in USES_PAGE_BOX));
    expect(missing).toEqual([]);
  });

  test("each listed part is shown only where a box is drawn", () => {
    for (const [part, pages] of Object.entries(USES_PAGE_BOX)) {
      for (const page of pages) expect(hasOwnBox(page), `${part} → ${page}`).toBe(true);
      const name = path.basename(part).replace(/\.(vue|ts)$/, "");
      if (!part.endsWith(".vue")) continue;
      const shownIn = files(".").filter((rel) => rel !== part && new RegExp(`<${name}[\\s>/]`).test(read(rel)));
      expect(shownIn.sort(), `${name} is shown somewhere not listed`).toEqual([...pages].sort());
      for (const page of pages) expect(hasPageBox(page), `${page} needs a box without a group`).toBe(true);
    }
  });
});
