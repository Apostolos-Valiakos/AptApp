import { describe, expect, test } from "vitest";
import { groupServicesByCategory, servicesInStaffOrder } from "../../client/src/utils/serviceGroups";

const a = { id: "a", name: "A", category: "Massage" };
const b = { id: "b", name: "B", category: "Facial" };
const c = { id: "c", name: "C", category: "Massage" };
const d = { id: "d", name: "D", category: "" };
const shopOrder = [a, c, b, d];

describe("a staff member's own service order", () => {
  test("follows their ids, not the shop's order", () => {
    expect(servicesInStaffOrder(shopOrder, ["b", "c", "a"])).toEqual([b, c, a]);
  });

  test("leaves out ids with no service", () => {
    expect(servicesInStaffOrder(shopOrder, ["gone", "a"])).toEqual([a]);
  });

  test("categories appear where their first service sits, and never mix", () => {
    const groups = groupServicesByCategory(servicesInStaffOrder(shopOrder, ["c", "b", "a"]), "None");
    expect(groups.map((g) => [g.label, g.items.map((s) => s.id)])).toEqual([
      ["Massage", ["c", "a"]],
      ["Facial", ["b"]],
    ]);
  });

  test("services with no category stay last", () => {
    const groups = groupServicesByCategory(servicesInStaffOrder(shopOrder, ["d", "b"]), "None");
    expect(groups.map((g) => g.label)).toEqual(["Facial", "None"]);
  });
});
