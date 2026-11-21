import type { Directive } from "vue";

// v-phone-section on a settings card: on phones (below 768px, see the CSS in
// tailwind.css) the card folds down to its first row, which opens and closes
// it with a tap. One card of the page is open at a time. Buttons, switches and
// fields in that first row keep doing their own thing. On wider screens the
// cards stay as they are.
const INTERACTIVE = "button, a, input, textarea, select, label, .p-toggleswitch, .p-inputswitch, .p-select, .p-dropdown";

const setOpen = (card: HTMLElement, open: boolean) => {
  card.dataset.open = open ? "true" : "false";
  card.firstElementChild?.setAttribute("aria-expanded", String(open));
};

export const vPhoneSection: Directive<HTMLElement> = {
  mounted(card) {
    const head = card.firstElementChild as HTMLElement | null;
    if (!head) return;
    card.classList.add("phone-section");
    head.classList.add("phone-section-head");
    head.setAttribute("role", "button");
    head.tabIndex = 0;
    setOpen(card, false);
    const toggle = (e: Event) => {
      if ((e.target as HTMLElement).closest(INTERACTIVE)) return;
      const opening = card.dataset.open !== "true";
      if (opening) {
        card.parentElement
          ?.closest(".phone-sections")
          ?.querySelectorAll<HTMLElement>(".phone-section")
          .forEach((other) => other !== card && setOpen(other, false));
      }
      setOpen(card, opening);
    };
    head.addEventListener("click", toggle);
    head.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        toggle(e);
      }
    });
  },
};
