// The calendar's "staff order" dialog: an ordinary dialog (announced as one,
// closed with Esc like the others) where staff are dragged into the order
// their columns take. SR1–SR2.
import { describe, expect, test, vi } from "vitest";
import { defineComponent, h } from "vue";
import StaffReorderDialog from "../../client/src/components/StaffReorderDialog.vue";
import el from "../../client/src/i18n/locales/el";
import { mountScreen, pageText, settle } from "./helpers";

const staff = [
  { id: "a", name: "Anna" },
  { id: "b", name: "Bella" },
  { id: "c", name: "Chloe" },
];
const open = async () => {
  const saved = vi.fn();
  const Parent = defineComponent({
    data: () => ({ visible: false }),
    render() {
      return h(StaffReorderDialog, {
        visible: (this as any).visible,
        "onUpdate:visible": (v: boolean) => ((this as any).visible = v),
        staffList: staff,
        onSave: saved,
      });
    },
  });
  // The real <Transition>: PrimeVue starts listening for Esc as the dialog's
  // opening transition runs (the test default stubs transitions out).
  const parent = mountScreen(Parent, { stubs: { transition: false } }).findComponent(Parent);
  (parent.vm as any).visible = true;
  await settle();
  await new Promise((r) => setTimeout(r, 50));
  await settle();
  return { saved, parent };
};
const rows = () => [...document.querySelectorAll<HTMLElement>('[data-testid="staff-reorder-row"]')];
const names = () => rows().map((r) => r.querySelector("span.font-medium")!.textContent!.trim());

describe("SR1 it's a dialog like the others", () => {
  test("announced as a modal dialog with its title and the hint, in the app's language", async () => {
    await open();
    const dialog = document.querySelector('[role="dialog"]')!;
    expect(dialog).not.toBeNull();
    expect(dialog.getAttribute("aria-modal")).toBe("true");
    expect(pageText()).toContain(el.scheduler.reorder.title);
    expect(pageText()).toContain(el.scheduler.reorder.hint);
  });

  test("Esc closes it without saving", async () => {
    const { saved, parent } = await open();
    document.querySelector<HTMLElement>('[role="dialog"]')!.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", code: "Escape", bubbles: true }));
    await settle();
    expect((parent.vm as any).visible).toBe(false);
    expect(saved).not.toHaveBeenCalled();
  });
});

describe("SR2 dragging sets the order", () => {
  test("a staff member dragged to the top is saved first", async () => {
    const { saved, parent } = await open();
    expect(names()).toEqual(["Anna", "Bella", "Chloe"]);
    rows()[2].dispatchEvent(new Event("dragstart"));
    rows()[0].dispatchEvent(new Event("drop"));
    await settle();
    expect(names()).toEqual(["Chloe", "Anna", "Bella"]);
    document.querySelector<HTMLElement>('[data-testid="staff-reorder-save"]')!.click();
    await settle();
    expect(saved.mock.calls[0][0].map((s: any) => s.id)).toEqual(["c", "a", "b"]);
    expect((parent.vm as any).visible).toBe(false);
  });

  test("Cancel closes it and saves nothing", async () => {
    const { saved, parent } = await open();
    [...document.querySelectorAll<HTMLElement>(".p-dialog-footer button")].find((b) => b.textContent?.includes(el.common.cancel))!.click();
    await settle();
    expect(saved).not.toHaveBeenCalled();
    expect((parent.vm as any).visible).toBe(false);
  });
});
