// Sauna and hammam lines go to the sauna or hammam staff member, by name,
// in combinations and when booked on their own. SH1–SH6 in test-report.html.
import { describe, expect, test } from "vitest";
import { placeStaffFor } from "../../client/src/utils/placeStaff";
import { splitCombo } from "../../client/src/utils/comboSplit";

const staff = [
  { id: "maria", name: "ΜΑΡΙΑ", capacity: 1 },
  { id: "sauna-room", name: "ΣΑΟΥΝΑ", capacity: 5 },
  { id: "hammam-room", name: "ΧΑΜΜΑΜ", capacity: 5 },
];
const row = (over: any = {}) => ({
  service_id: "offer", staff_id: "maria", start_time: new Date("2026-11-10T10:00:00"), duration_override: 90, price_override: 35, ...over,
});
const holistic = { id: "holistic", name: "HOLISTIC", duration_minutes: 60, price: 32, default_staff_id: null };
const plainSauna = { id: "sauna", name: "ΣΑΟΥΝΑ", duration_minutes: 30, price: 15, default_staff_id: null };

describe("SH1 which staff member a service's name points to", () => {
  test.each([
    ["ΣΑΟΥΝΑ", "sauna-room"],
    ["Σάουνα", "sauna-room"],
    ["SAUNA & SCRUB", "sauna-room"],
    ["ΣΑΟΥΝΑ ΣΕ ΥΠΗΡΕΣΙΑ", "sauna-room"],
    ["ΧΑΜΜΑΜ", "hammam-room"],
    ["ΧΑΜΑΜ", "hammam-room"],
    ["Χαμάμ", "hammam-room"],
    ["Hammam", "hammam-room"],
    ["ΗΑΜΑΜ ΣΕ ΥΠΗΡΕΣΙΑ", "hammam-room"],
  ])("%s → %s", (name, expected) => {
    expect(placeStaffFor(name, staff)).toEqual({ matched: true, staffId: expected });
  });

  test("any other service doesn't point anywhere", () => {
    expect(placeStaffFor("HOLISTIC", staff)).toEqual({ matched: false, staffId: null });
    expect(placeStaffFor("", staff)).toEqual({ matched: false, staffId: null });
  });

  test("a sauna service in a shop without a sauna staff member: matched, but nobody to give it to", () => {
    expect(placeStaffFor("ΣΑΟΥΝΑ", [staff[0]])).toEqual({ matched: true, staffId: null });
  });

  test("the room is a staff member named after it, not someone whose name merely contains it", () => {
    // Listed first, and with places too: only the name tells them apart.
    const tricky = [{ id: "x", name: "Maria (sauna helper)", capacity: 2 }, ...staff];
    expect(placeStaffFor("ΣΑΟΥΝΑ", tricky).staffId).toBe("sauna-room");
  });
});

describe("SH2 a combination's sauna or hammam part", () => {
  test("priced: a plain ΣΑΟΥΝΑ with no default staff goes to the ΣΑΟΥΝΑ staff member", () => {
    const combo = { id: "offer", name: "HOLISTIC + ΣΑΟΥΝΑ", combo_components: [{ ...holistic, combo_price: 28 }, { ...plainSauna, combo_price: 7 }] };
    expect(splitCombo(combo, row(), staff).map((l) => l.staff_id)).toEqual(["maria", "sauna-room"]);
  });

  test("not priced (as before): carved out, and still to the ΣΑΟΥΝΑ staff member", () => {
    const combo = { id: "offer", name: "HOLISTIC + ΣΑΟΥΝΑ", combo_components: [plainSauna] };
    expect(splitCombo(combo, row(), staff).map((l) => [l.service_id, l.staff_id])).toEqual([
      ["offer", "maria"],
      ["sauna", "sauna-room"],
    ]);
  });

  test("a hammam part goes to the ΧΑΜΜΑΜ staff member", () => {
    const combo = { id: "offer", name: "SPORT + ΧΑΜΑΜ", combo_components: [{ ...holistic, combo_price: 30 }, { id: "h", name: "Hammam", duration_minutes: 30, price: 1, combo_price: 9, default_staff_id: null }] };
    expect(splitCombo(combo, row(), staff).map((l) => l.staff_id)).toEqual(["maria", "hammam-room"]);
  });
});

describe("SH3 a default staff member set on the service still wins", () => {
  test("for a sauna part", () => {
    const combo = { id: "offer", name: "X", combo_components: [{ ...plainSauna, default_staff_id: "someone", combo_price: 7 }] };
    expect(splitCombo(combo, row(), staff)[0].staff_id).toBe("someone");
  });
});

describe("SH4 no sauna staff member in the shop", () => {
  test("the sauna part is left unassigned, never put on the therapist", () => {
    const combo = { id: "offer", name: "HOLISTIC + ΣΑΟΥΝΑ", combo_components: [{ ...holistic, combo_price: 28 }, { ...plainSauna, combo_price: 7 }] };
    expect(splitCombo(combo, row(), [staff[0]]).map((l) => l.staff_id)).toEqual(["maria", null]);
  });
});

describe("SH5 and SH6 in the booking screen", () => {
  const pick = async (services: any[], picked: any, staffList = staff) => {
    const { mountScreen, settle } = await import("./helpers");
    const { defineComponent, h, ref } = await import("vue");
    const BookingServices = (await import("../../client/src/components/booking/bookingServices.vue")).default;
    const ServicePickerDialog = (await import("../../client/src/components/booking/ServicePickerDialog.vue")).default;
    const lines = ref<any[]>([{ service_id: null, staff_id: "maria", start_time: new Date("2026-11-10T10:00:00"), duration_override: 60, price_override: 0 }]);
    const Parent = defineComponent({
      render: () =>
        h(BookingServices, {
          modelValue: lines.value,
          "onUpdate:modelValue": (v: any[]) => (lines.value = v),
          services,
          staff: staffList,
          requireStaff: false,
        }),
    });
    const wrapper = mountScreen(Parent);
    await wrapper.find('[data-testid="service-picker"]').trigger("click");
    wrapper.findComponent(ServicePickerDialog).vm.$emit("picked", [
      { service_id: picked.id, name: picked.name, variation_name: null, duration_minutes: picked.duration_minutes, price: picked.price },
    ]);
    await settle();
    return lines.value;
  };

  test("SH5 a sauna picked on its own moves the line to the ΣΑΟΥΝΑ staff member", async () => {
    const lines = await pick([holistic, plainSauna], plainSauna);
    expect(lines.map((l) => [l.service_id, l.staff_id])).toEqual([["sauna", "sauna-room"]]);
  });

  test("SH5 with no sauna staff member, the line is left unassigned", async () => {
    const lines = await pick([holistic, plainSauna], plainSauna, [staff[0]]);
    expect(lines[0].staff_id).toBeNull();
  });

  test("SH6 any other service keeps the line's staff member", async () => {
    const lines = await pick([holistic, plainSauna], holistic);
    expect(lines[0].staff_id).toBe("maria");
  });

  test("SH6 a combination named with sauna isn't moved itself: only its sauna part is", async () => {
    const combo = { id: "offer", name: "Holistic + Sauna", duration_minutes: 90, price: 37, combo_components: [{ ...plainSauna, price: 5 }] };
    const lines = await pick([combo, holistic, plainSauna], combo);
    expect(lines.map((l) => [l.service_id, l.staff_id])).toEqual([["offer", "maria"], ["sauna", "sauna-room"]]);
  });
});
