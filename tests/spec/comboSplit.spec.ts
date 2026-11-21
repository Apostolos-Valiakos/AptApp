// Booking a combination of services: what lines it becomes, at what prices.
// CP5–CP7 in test-report.html.
import { describe, expect, test } from "vitest";
import { comboLineLabel, hasPartPrices, splitCombo } from "../../client/src/utils/comboSplit";

const holistic = { id: "holistic", name: "HOLISTIC", duration_minutes: 60, price: 32, default_staff_id: null };
const sauna = { id: "sauna", name: "SAUNA & SCRUB", duration_minutes: 30, price: 8, default_staff_id: "sauna-staff" };
const offer = (parts: any[]) => ({ id: "offer", name: "HOLISTIC + SAUNA OFFER", combo_components: parts });
const row = (over: any = {}) => ({
  service_id: "offer",
  staff_id: "maria",
  start_time: new Date("2026-11-10T10:00:00"),
  duration_override: 90,
  price_override: 35,
  ...over,
});
const total = (lines: any[]) => lines.reduce((sum, l) => sum + l.price_override, 0);

describe("CP5 a combination with a price on each part", () => {
  const priced = offer([{ ...holistic, combo_price: 28 }, { ...sauna, combo_price: 7 }]);

  test("becomes its parts at the prices set, adding up to the combination's 35€", () => {
    const lines = splitCombo(priced, row());
    expect(lines.map((l) => [l.service_id, l.price_override])).toEqual([["holistic", 28], ["sauna", 7]]);
    expect(total(lines)).toBe(35);
  });

  test("the sauna goes to the sauna's staff member, the rest stays with whoever it was booked for", () => {
    const lines = splitCombo(priced, row());
    expect(lines.map((l) => l.staff_id)).toEqual(["maria", "sauna-staff"]);
  });

  test("each part keeps its own duration", () => {
    expect(splitCombo(priced, row()).map((l) => l.duration_override)).toEqual([60, 30]);
  });

  test("each line remembers the combination and is named after both", () => {
    const lines = splitCombo(priced, row());
    expect(lines.map((l) => l.combo_service_id)).toEqual(["offer", "offer"]);
    expect(lines[0]._label).toBe("HOLISTIC (HOLISTIC + SAUNA OFFER)");
    expect(lines[1]._label).toBe("SAUNA & SCRUB (HOLISTIC + SAUNA OFFER)");
  });

  test("a price of 0 counts as set", () => {
    const free = offer([{ ...holistic, combo_price: 35 }, { ...sauna, combo_price: 0 }]);
    expect(splitCombo(free, row()).map((l) => l.price_override)).toEqual([35, 0]);
  });

  test("prices sent as text still count", () => {
    const text = offer([{ ...holistic, combo_price: "28.50" }, { ...sauna, combo_price: "6.50" }]);
    expect(total(splitCombo(text, row()))).toBe(35);
  });

  test("a part with no staff member of its own and nobody chosen yet stays unassigned", () => {
    expect(splitCombo(priced, row({ staff_id: null }))[0].staff_id).toBeNull();
  });
});

describe("CP6 a combination without part prices works as before", () => {
  test("only the sauna listed: it is carved out at its own price, the combination keeps the rest", () => {
    const lines = splitCombo(offer([sauna]), row());
    expect(lines.map((l) => [l.service_id, l.price_override, l.duration_override])).toEqual([
      ["offer", 27, 60],
      ["sauna", 8, 30],
    ]);
    expect(lines.every((l) => !l.combo_service_id)).toBe(true);
  });

  test("both parts listed: they replace the combination at their own prices (the problem part prices fix)", () => {
    const lines = splitCombo(offer([holistic, sauna]), row());
    expect(lines.map((l) => [l.service_id, l.price_override])).toEqual([["holistic", 32], ["sauna", 8]]);
    expect(total(lines)).toBe(40);
  });

  test("some parts priced, others not: not a priced combination", () => {
    expect(hasPartPrices([{ ...holistic, combo_price: 28 }, sauna])).toBe(false);
    expect(splitCombo(offer([{ ...holistic, combo_price: 28 }, sauna]), row()).some((l) => l.combo_service_id)).toBe(false);
  });

  test("a service that isn't a combination stays one line", () => {
    const plain = row({ service_id: "holistic" });
    expect(splitCombo({ id: "holistic", name: "HOLISTIC" }, plain)).toEqual([plain]);
  });
});

describe("CP7 line names", () => {
  test("a line from a combination shows both names; any other line only its own", () => {
    expect(comboLineLabel("HOLISTIC", "OFFER")).toBe("HOLISTIC (OFFER)");
    expect(comboLineLabel("HOLISTIC", null)).toBe("HOLISTIC");
  });
});

describe("CP5 in the booking screen", () => {
  // The real list of service lines; only the picker's choice is handed to it,
  // as the picker dialog does.
  const pick = async (services: any[], combo: any, then?: any) => {
    const { mountScreen, settle } = await import("./helpers");
    const BookingServices = (await import("../../client/src/components/booking/bookingServices.vue")).default;
    const ServicePickerDialog = (await import("../../client/src/components/booking/ServicePickerDialog.vue")).default;
    const { defineComponent, h, ref } = await import("vue");
    const lines = ref<any[]>([{ service_id: null, staff_id: "maria", start_time: new Date("2026-11-10T10:00:00"), duration_override: 60, price_override: 0 }]);
    // Holds the lines as the booking dialog does, so the list redraws.
    const Parent = defineComponent({
      render: () =>
        h(BookingServices, {
          modelValue: lines.value,
          "onUpdate:modelValue": (v: any[]) => (lines.value = v),
          services,
          staff: [{ id: "maria", name: "Maria" }, { id: "sauna-staff", name: "Sauna" }],
          requireStaff: false,
        }),
    });
    const wrapper = mountScreen(Parent);
    await wrapper.find('[data-testid="service-picker"]').trigger("click");
    wrapper.findComponent(ServicePickerDialog).vm.$emit("picked", [
      { service_id: combo.id, name: combo.name, variation_name: null, duration_minutes: combo.duration_minutes, price: combo.price },
    ]);
    await settle();
    if (then) {
      // A second choice, on the first line.
      await wrapper.findAll('[data-testid="service-picker"]')[0].trigger("click");
      wrapper.findComponent(ServicePickerDialog).vm.$emit("picked", [then]);
      await settle();
    }
    return lines.value;
  };
  const services = (parts: any[]) => {
    const combo = { id: "offer", name: "HOLISTIC + SAUNA OFFER", duration_minutes: 90, price: 35, combo_components: parts };
    return { combo, list: [combo, holistic, sauna] };
  };

  test("picking the priced combination gives its parts at the set prices, one after the other", async () => {
    const { combo, list } = services([{ ...holistic, combo_price: 28 }, { ...sauna, combo_price: 7 }]);
    const lines = await pick(list, combo);
    expect(lines.map((l) => [l.service_id, l.staff_id, l.price_override, l.combo_service_id])).toEqual([
      ["holistic", "maria", 28, "offer"],
      ["sauna", "sauna-staff", 7, "offer"],
    ]);
    expect(new Date(lines[1].start_time).getTime() - new Date(lines[0].start_time).getTime()).toBe(60 * 60000);
    expect(document.body.textContent).toContain("HOLISTIC (HOLISTIC + SAUNA OFFER)");
  });

  test("CP9 changing a split line to another service drops the combination", async () => {
    const { combo, list } = services([{ ...holistic, combo_price: 28 }, { ...sauna, combo_price: 7 }]);
    const lines = await pick(list, combo, { service_id: "holistic", name: "HOLISTIC", variation_name: null, duration_minutes: 60, price: 32 });
    expect(lines[0].service_id).toBe("holistic");
    expect(lines[0].combo_service_id).toBeNull();
    expect(lines[0].price_override).toBe(32);
  });

  test("picking an unpriced combination splits it as before", async () => {
    const { combo, list } = services([sauna]);
    const lines = await pick(list, combo);
    expect(lines.map((l) => [l.service_id, l.price_override])).toEqual([["offer", 27], ["sauna", 8]]);
  });
});
