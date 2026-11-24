// The staff bonus rule (server/domain/bonus.js): after the day's first 5 hours
// of completed services, 10% of the price of the service time past them.
import { describe, expect, it } from "vitest";
import { createRequire } from "node:module";

const { bonusForDay, bonusReport, ruleOn, commissionOn, commissionBase, bulkWithVat, targetOn, targetBonus, monthsBetween, isLaser } = createRequire(import.meta.url)("../../server/domain/bonus.js");

const RULE = { enabled: true, kind: "percent", threshold_minutes: 300, percent: 10, amount_per_hour: 0 };
let nextId = 1;
const svc = (time: string, minutes: number, price: number, extra: any = {}) => ({
  id: nextId++,
  start_time: `2026-11-10T${time}:00+02:00`,
  minutes,
  price,
  ...extra,
});

describe("one day", () => {
  it("nothing within the first 5 hours", () => {
    const day = bonusForDay([svc("09:00", 120, 40), svc("11:00", 120, 40), svc("13:00", 60, 30)], RULE);
    expect(day).toMatchObject({ minutes: 300, extra_minutes: 0, bonus: 0, services: [] });
  });

  it("a whole service after the 5 hours earns 10% of its price", () => {
    const day = bonusForDay([svc("09:00", 120, 40), svc("11:00", 120, 40), svc("13:00", 60, 30), svc("14:00", 60, 30)], RULE);
    expect(day.bonus).toBe(3);
    expect(day.extra_minutes).toBe(60);
    expect(day.services).toHaveLength(1);
  });

  it("a service crossing the 5 hours earns on the part after them only", () => {
    // 4h, then 1.5h at €45: the day ends at 5.5h, so 30 of its 90 minutes are past.
    const day = bonusForDay([svc("09:00", 120, 40), svc("11:00", 120, 40), svc("13:00", 90, 45)], RULE);
    expect(day.extra_minutes).toBe(30);
    expect(day.bonus).toBe(1.5); // 10% of a third of €45
  });

  it("5.5 hours with a 1-hour service half past them: 10% of half its price", () => {
    const day = bonusForDay([svc("09:00", 120, 40), svc("11:00", 150, 50), svc("14:00", 60, 30)], RULE);
    expect(day.extra_minutes).toBe(30);
    expect(day.bonus).toBe(1.5);
    expect(day.services[0]).toMatchObject({ extra_minutes: 30, bonus: 1.5 });
  });

  it("the worked example: 1.5h crossing at the half, then a whole hour", () => {
    const day = bonusForDay([svc("09:00", 120, 40), svc("11:00", 135, 45), svc("13:15", 90, 45), svc("14:45", 60, 30)], RULE);
    // 255 minutes, then 45 of 90 before the threshold and 45 after: €2.25; then €3.
    expect(day.bonus).toBe(5.25);
  });

  it("gaps between services don't count", () => {
    const day = bonusForDay([svc("09:00", 120, 40), svc("15:00", 180, 60)], RULE);
    expect(day).toMatchObject({ minutes: 300, bonus: 0 });
  });

  it("order is by start time, whatever order they come in", () => {
    const late = svc("16:00", 60, 100);
    const day = bonusForDay([late, svc("09:00", 300, 10)], RULE);
    expect(day.bonus).toBe(10);
  });

  it("services starting at the same time: the cheaper one counts first", () => {
    const day = bonusForDay([svc("09:00", 240, 0), svc("13:00", 60, 80), svc("13:00", 60, 20)], RULE);
    // After 4h, the €20 one fills the 5th hour; the €80 one is past it.
    expect(day.bonus).toBe(8);
  });

  it("each service's bonus is rounded to the cent, and the day adds those up", () => {
    const day = bonusForDay([svc("09:00", 300, 0), svc("14:00", 60, 33.33), svc("15:00", 60, 33.33)], RULE);
    expect(day.services.map((s: any) => s.bonus)).toEqual([3.33, 3.33]);
    expect(day.bonus).toBe(6.66);
  });

  it("another rule's threshold and percent", () => {
    const day = bonusForDay([svc("09:00", 240, 40), svc("13:00", 60, 50)], { enabled: true, threshold_minutes: 240, percent: 12 });
    expect(day.bonus).toBe(6);
  });
});

describe("which rule applies", () => {
  const rules = [
    { effective_from: "2026-01-01", enabled: true, threshold_minutes: 300, percent: 10 },
    { effective_from: "2026-11-15", enabled: true, threshold_minutes: 300, percent: 12 },
  ];
  it("the latest starting on or before the day", () => {
    expect(ruleOn(rules, "2026-11-14", 1).percent).toBe(10);
    expect(ruleOn(rules, "2026-11-15", 1).percent).toBe(12);
  });
  // Requirement changed (Nov 2026): the default also pays €2.20 for a service up to 30′ past.
  it("with none: 5 hours and 10% for people (€2.20 up to 30′ past), none for shared places", () => {
    const DEFAULT = { ...RULE, laser_amount_per_hour: null, deduction_per_service: 0, last_service_fixed: 2.2 };
    expect(ruleOn([], "2026-11-15", 1)).toEqual(DEFAULT);
    expect(ruleOn([], "2026-11-15", 5).enabled).toBe(false);
    expect(ruleOn(rules, "2025-12-31", 1)).toEqual(DEFAULT);
  });
});

describe("the report", () => {
  const staff = [
    { id: "anna", name: "Anna", capacity: 1 },
    { id: "sauna", name: "ΣΑΟΥΝΑ", capacity: 5 },
    { id: "eleni", name: "Eleni", capacity: 1 },
  ];
  const day = (staff_id: string, date: string, minutes: number, price: number) => ({
    id: nextId++, staff_id, day: date, start_time: `${date}T09:00:00+02:00`, minutes, price,
  });

  it("adds each staff member's days, leaves out shared places, and keeps old days under their old rule", () => {
    const report = bonusReport({
      staff,
      rules: [{ staff_id: "anna", effective_from: "2026-11-11", enabled: true, threshold_minutes: 300, percent: 20 }],
      services: [
        day("anna", "2026-11-10", 360, 60), // 60 of 360 past at 10% of €60: €1
        day("anna", "2026-11-11", 360, 60), // the same at 20%: €2
        day("sauna", "2026-11-10", 600, 100),
        day("eleni", "2026-11-10", 120, 30),
      ],
    });
    const anna = report.staff.find((s: any) => s.staff_id === "anna");
    expect(anna).toMatchObject({ days_worked: 2, minutes: 720, extra_minutes: 120, bonus: 3 });
    expect(anna.days.map((d: any) => d.percent)).toEqual([10, 20]);
    expect(report.staff.some((s: any) => s.staff_id === "sauna")).toBe(false);
    expect(report.staff.find((s: any) => s.staff_id === "eleni").bonus).toBe(0);
    expect(report.total).toBe(3);
  });

  it("a rule turned off from a date: no days counted from then", () => {
    const report = bonusReport({
      staff,
      rules: [{ staff_id: "anna", effective_from: "2026-11-11", enabled: false, threshold_minutes: 300, percent: 10 }],
      services: [day("anna", "2026-11-10", 360, 60), day("anna", "2026-11-11", 360, 60)],
    });
    expect(report.staff[0]).toMatchObject({ days_worked: 1, bonus: 1 });
  });
});

describe("a fixed amount per extra hour", () => {
  const PER_HOUR = { enabled: true, kind: "per_hour", threshold_minutes: 240, percent: 0, amount_per_hour: 4 };

  it("after 4 hours, €4 for each extra hour whatever the services cost", () => {
    const day = bonusForDay([svc("09:00", 240, 200), svc("13:00", 120, 0)], PER_HOUR);
    expect(day).toMatchObject({ minutes: 360, extra_minutes: 120, bonus: 8, services: [] });
  });

  it("part of an hour is paid in proportion", () => {
    expect(bonusForDay([svc("09:00", 270, 50)], PER_HOUR).bonus).toBe(2); // 30 minutes
    expect(bonusForDay([svc("09:00", 255, 50)], PER_HOUR).bonus).toBe(1); // 15 minutes
  });

  it("time when services overlap counts once", () => {
    // 09:00–13:00, then two services 13:00–14:00 at the same time, and one 13:30–15:00.
    const day = bonusForDay([svc("09:00", 240, 10), svc("13:00", 60, 10), svc("13:00", 60, 10), svc("13:30", 90, 10)], PER_HOUR);
    expect(day.minutes).toBe(360);
    expect(day.bonus).toBe(8);
  });

  it("gaps don't count, and nothing within the threshold", () => {
    expect(bonusForDay([svc("09:00", 120, 10), svc("15:00", 120, 10)], PER_HOUR)).toMatchObject({ minutes: 240, bonus: 0 });
  });

  it("the day's bonus is rounded to the cent", () => {
    const day = bonusForDay([svc("09:00", 250, 10)], { ...PER_HOUR, amount_per_hour: 5 }); // 10 minutes of €5/hour
    expect(day.bonus).toBe(0.83);
  });

  it("a rule from a date can switch a staff member from percent to per hour", () => {
    const report = bonusReport({
      staff: [{ id: "anna", name: "Anna", capacity: 1 }],
      rules: [{ staff_id: "anna", effective_from: "2026-11-11", enabled: true, kind: "per_hour", threshold_minutes: 240, percent: 10, amount_per_hour: 4 }],
      services: [
        { id: nextId++, staff_id: "anna", day: "2026-11-10", start_time: "2026-11-10T09:00:00+02:00", minutes: 360, price: 60 },
        { id: nextId++, staff_id: "anna", day: "2026-11-11", start_time: "2026-11-11T09:00:00+02:00", minutes: 360, price: 60 },
      ],
    });
    expect(report.staff[0].days.map((d: any) => [d.kind, d.bonus])).toEqual([["percent", 1], ["per_hour", 8]]);
    expect(report.staff[0].hours_bonus).toBe(9);
  });
});

describe("product commission", () => {
  const staff = [
    { id: "anna", name: "Anna", capacity: 1 },
    { id: "eleni", name: "Eleni", capacity: 1 },
  ];
  const sale = (staff_id: string, day: string, total_price: number) => ({ id: `ps${nextId++}`, staff_id, day, total_price, quantity: 1 });

  it("off unless a rule turns it on", () => {
    expect(commissionOn([], "2026-11-10")).toEqual({ enabled: false, percent: 0 });
  });

  it("the seller earns the percent of what each product sold for, from the rule's date", () => {
    const report = bonusReport({
      staff,
      rules: [],
      commissionRules: [{ staff_id: "anna", effective_from: "2026-11-10", enabled: true, percent: 10 }],
      services: [],
      products: [sale("anna", "2026-11-09", 50), sale("anna", "2026-11-10", 33.35), sale("anna", "2026-11-12", 20), sale("eleni", "2026-11-12", 100)],
    });
    expect(report.staff).toHaveLength(1);
    const anna = report.staff[0];
    expect(anna.products.map((p: any) => p.bonus)).toEqual([3.34, 2]); // not the 9th, before the rule
    expect(anna).toMatchObject({ hours_bonus: 0, products_bonus: 5.34, bonus: 5.34, days_worked: 0 });
    expect(report.total).toBe(5.34);
  });

  it("adds to the hours bonus in the staff member's total", () => {
    const report = bonusReport({
      staff,
      rules: [],
      commissionRules: [{ staff_id: "anna", effective_from: "2026-01-01", enabled: true, percent: 10 }],
      services: [{ id: nextId++, staff_id: "anna", day: "2026-11-10", start_time: "2026-11-10T09:00:00+02:00", minutes: 360, price: 60 }],
      products: [sale("anna", "2026-11-10", 40)],
    });
    expect(report.staff[0]).toMatchObject({ hours_bonus: 1, products_bonus: 4, bonus: 5 });
  });

  describe("on the profit over the bulk price with 24% VAT", () => {
    const commission = (products: any[]) =>
      bonusReport({ staff, rules: [], commissionRules: [{ staff_id: "anna", effective_from: "2026-01-01", enabled: true, percent: 10 }], services: [], products })
        .staff[0]?.products;

    it("the bulk price with VAT is rounded to the cent", () => {
      expect(bulkWithVat(15)).toBe(18.6);
      expect(bulkWithVat(9.99)).toBe(12.39); // 12.3876
    });

    it("10% of what it sold for less the bulk price with VAT, times the quantity", () => {
      const [one, two] = commission([
        { ...sale("anna", "2026-11-10", 30), unit_bulk_price: 15 },
        { ...sale("anna", "2026-11-10", 50), quantity: 2, unit_bulk_price: 10 },
      ]);
      expect([one.cost, one.base, one.bonus]).toEqual([18.6, 11.4, 1.14]);
      expect([two.cost, two.base, two.bonus]).toEqual([24.8, 25.2, 2.52]);
    });

    it("a discount lowers the profit; a sale at or below cost earns nothing, never less", () => {
      expect(commissionBase({ total_price: 20, quantity: 1, unit_bulk_price: 15 })).toEqual({ cost: 18.6, base: 1.4 });
      const [loss] = commission([{ ...sale("anna", "2026-11-10", 10), unit_bulk_price: 15 }]);
      expect([loss.base, loss.bonus]).toEqual([0, 0]);
    });

    it("without a bulk price, on what it sold for, as before", () => {
      const [p] = commission([{ ...sale("anna", "2026-11-10", 30), unit_bulk_price: null }]);
      expect([p.cost, p.base, p.bonus]).toEqual([null, 30, 3]);
    });

    it("a bulk price of 0 is a bulk price: the whole price is profit", () => {
      expect(commissionBase({ total_price: 30, quantity: 1, unit_bulk_price: 0 })).toEqual({ cost: 0, base: 30 });
    });
  });
});

describe("sales target bonus", () => {
  const staff = [{ id: "anna", name: "Anna", capacity: 1 }];
  const steps = [
    { target: 3500, bonus: 500 },
    { target: 2500, bonus: 300 },
  ];
  const months = monthsBetween("2026-10-01", "2026-11-30");
  const report = (monthSales: any[], targetRules: any[] = [{ staff_id: "anna", effective_from: "2026-01-01", enabled: true, steps }]) =>
    bonusReport({ staff, rules: [], services: [], months, targetRules, monthSales });

  it("calendar months between two dates, each with its first and last day", () => {
    expect(monthsBetween("2026-12-15", "2027-02-03")).toEqual([
      { month: "2026-12", first: "2026-12-01", last: "2026-12-31" },
      { month: "2027-01", first: "2027-01-01", last: "2027-01-31" },
      { month: "2027-02", first: "2027-02-01", last: "2027-02-28" },
    ]);
  });

  it("the highest step reached is paid, once a month; below the first step, nothing", () => {
    expect(targetBonus(targetOn([{ effective_from: "2026-01-01", enabled: true, steps }], "2026-11-30").steps, 2499.99)).toMatchObject({ bonus: 0, next: { target: 2500 } });
    const anna = report([
      { staff_id: "anna", month: "2026-10", total: 2500 },
      { staff_id: "anna", month: "2026-11", total: 5200 },
    ]).staff[0];
    expect(anna.targets.map((m: any) => [m.month, m.sales, m.bonus])).toEqual([
      ["2026-10", 2500, 300],
      ["2026-11", 5200, 500],
    ]);
    expect(anna.targets[0].next).toEqual({ target: 3500, bonus: 500 });
    expect(anna).toMatchObject({ target_bonus: 800, bonus: 800 });
  });

  it("off without a rule; a rule set during a month applies to that whole month", () => {
    expect(report([{ staff_id: "anna", month: "2026-11", total: 9000 }], []).staff).toHaveLength(0);
    const anna = report([{ staff_id: "anna", month: "2026-11", total: 3000 }], [{ staff_id: "anna", effective_from: "2026-11-20", enabled: true, steps }]).staff[0];
    expect(anna.targets.map((m: any) => [m.month, m.bonus])).toEqual([["2026-11", 300]]);
  });

  it("comes on top of the hours bonus", () => {
    const r = bonusReport({
      staff,
      rules: [],
      services: [{ id: 1, staff_id: "anna", day: "2026-11-10", start_time: "2026-11-10T09:00:00+02:00", minutes: 360, price: 60 }],
      months: monthsBetween("2026-11-01", "2026-11-30"),
      targetRules: [{ staff_id: "anna", effective_from: "2026-01-01", enabled: true, steps }],
      monthSales: [{ staff_id: "anna", month: "2026-11", total: 2600 }],
    });
    expect(r.staff[0]).toMatchObject({ hours_bonus: 1, target_bonus: 300, bonus: 301 });
    expect(r.total).toBe(301);
  });
});

describe("review bonus", () => {
  const staff = [
    { id: "desk1", name: "Desk 1", capacity: 1 },
    { id: "desk2", name: "Desk 2", capacity: 1 },
    { id: "anna", name: "Anna", capacity: 1 },
  ];
  const reviewRules = [
    { staff_id: "desk1", effective_from: "2026-01-01", enabled: true, amount_per_review: 3 },
    { staff_id: "desk2", effective_from: "2026-01-01", enabled: true, amount_per_review: 3 },
  ];
  const run = (reviewCounts: any[]) =>
    bonusReport({ staff, rules: [], services: [], months: monthsBetween("2026-10-01", "2026-11-30"), reviewRules, reviewCounts });

  it("the reviews gained in the month × the amount, in full to everyone with it on", () => {
    const r = run([
      { month: "2026-10", start_count: 100, end_count: 112 },
      { month: "2026-11", start_count: 112, end_count: 120 },
    ]);
    expect(r.staff.map((s: any) => [s.staff_id, s.reviews_bonus])).toEqual([
      ["desk1", 60],
      ["desk2", 60],
    ]);
    expect(r.staff[0].reviews.map((m: any) => [m.month, m.reviews, m.bonus])).toEqual([
      ["2026-10", 12, 36],
      ["2026-11", 8, 24],
    ]);
    expect(r.total).toBe(120);
  });

  it("a month missing a count earns nothing yet, and is shown as such", () => {
    const desk = run([{ month: "2026-11", start_count: 112, end_count: null }]).staff[0];
    expect(desk.reviews.map((m: any) => [m.month, m.reviews, m.bonus])).toEqual([
      ["2026-10", null, 0],
      ["2026-11", null, 0],
    ]);
  });
});

// Requirement changed (24/11/2026): any service with 30′ or less past the
// threshold, not only the day's last one.
describe("a service with 30 minutes or less past the threshold at a fixed amount", () => {
  const LAST = { ...RULE, last_service_fixed: 2.2 };

  it("30 minutes or less of it past the threshold: €2.20 instead of the percent", () => {
    // 4h45 then a 1-hour €60 service: 45′ past → 10% of ¾ of €60, as before.
    expect(bonusForDay([svc("09:00", 285, 100), svc("13:45", 60, 60)], LAST).bonus).toBe(4.5);
    // 5h then a 30′ Foot Massage (€13): €2.20, not €1.30.
    const day = bonusForDay([svc("09:00", 300, 100), svc("14:00", 30, 13)], LAST);
    expect(day.services.map((s: any) => [s.how, s.bonus])).toEqual([["last", 2.2]]);
    // 4h45 then 30′: only 15′ past → still €2.20.
    expect(bonusForDay([svc("09:00", 285, 100), svc("13:45", 30, 13)], LAST).bonus).toBe(2.2);
  });

  it("wherever it is in the day: an earlier service 30′ past earns €2.20 too; one 60′ past, the percent", () => {
    const day = bonusForDay([svc("09:00", 300, 100), svc("14:00", 30, 20), svc("14:30", 60, 50)], LAST);
    expect(day.services.map((s: any) => [s.how, s.bonus])).toEqual([
      ["last", 2.2],
      ["percent", 5],
    ]);
  });

  it("XRISTINA, 1/11 (threshold 4h): the 4-hour mark mid-way through 17:00 → €2.20 + €2.80 + €3.20", () => {
    const rule = { ...LAST, threshold_minutes: 240 };
    const day = bonusForDay(
      [
        svc("13:00", 60, 32),
        svc("14:00", 60, 0),
        svc("15:00", 60, 32),
        svc("16:00", 30, 22),
        svc("17:00", 60, 29), // 30′ past (the threshold falls at 17:30)
        svc("19:00", 60, 28),
        svc("20:00", 60, 32),
      ],
      rule,
    );
    expect(day.services.map((s: any) => [s.extra_minutes, s.how, s.bonus])).toEqual([
      [30, "last", 2.2],
      [60, "percent", 2.8],
      [60, "percent", 3.2],
    ]);
    expect(day).toMatchObject({ minutes: 390, extra_minutes: 150, bonus: 8.2 });
  });

  it("off when the rule has no fixed amount", () => {
    expect(bonusForDay([svc("09:00", 300, 100), svc("14:00", 30, 13)], RULE).bonus).toBe(1.3);
  });
});

describe("laser by the hour and a deduction per service (aestheticians)", () => {
  const AESTH = { ...RULE, threshold_minutes: 240, laser_amount_per_hour: 4, deduction_per_service: 15, last_service_fixed: 2.2 };
  const laser = (time: string, minutes: number, price: number) => svc(time, minutes, price, { service_name: "Laser 755nm - Πόδια", service_category: "Laser 755nm" });
  const facial = (time: string, minutes: number, price: number) => svc(time, minutes, price, { service_name: "PURE FACIAL", service_category: "Πρόσωπο" });

  it("laser is found by name or category, any case or accents", () => {
    expect(isLaser({ service_name: "Αποτρίχωση", service_category: "Λειζερ" })).toBe(true);
    expect(isLaser({ service_name: "LASER 2X2" })).toBe(true);
    expect(isLaser({ service_name: "Λέιζερ μασχάλες" })).toBe(true);
    expect(isLaser({ service_name: "HOLISTIC", service_category: "Μασάζ" })).toBe(false);
  });

  it("all services count towards one threshold; past it laser earns €4/hour, others 10% of (price − €15)", () => {
    // 3h laser, then a 2h €45 facial (1h past 4h), then 1h laser (all past).
    const day = bonusForDay([laser("09:00", 180, 300), facial("12:00", 120, 45), laser("14:00", 60, 70)], AESTH);
    expect(day.services.map((s: any) => [s.how, s.extra_minutes, s.bonus])).toEqual([
      ["percent", 60, 1.5], // 10% × (45 − 15) × ½
      ["laser", 60, 4],
    ]);
    expect(day).toMatchObject({ minutes: 360, extra_minutes: 120, bonus: 5.5 });
  });

  it("a service at €15 or less earns nothing, never less", () => {
    const day = bonusForDay([laser("09:00", 240, 300), facial("13:00", 60, 10), facial("14:00", 60, 45)], AESTH);
    expect(day.services.map((s: any) => s.bonus)).toEqual([0, 3]);
  });

  it("the fixed last-service amount applies to a last non-laser service, not to laser", () => {
    const lastFacial = bonusForDay([laser("09:00", 240, 300), facial("13:00", 30, 45)], AESTH);
    expect(lastFacial.services.map((s: any) => [s.how, s.bonus])).toEqual([["last", 2.2]]);
    const lastLaser = bonusForDay([facial("09:00", 240, 45), laser("13:00", 30, 70)], AESTH);
    expect(lastLaser.services.map((s: any) => [s.how, s.bonus])).toEqual([["laser", 2]]);
  });

  it("without a laser amount, laser services are paid like the others", () => {
    const day = bonusForDay([facial("09:00", 300, 45), laser("14:00", 60, 70)], { ...RULE });
    expect(day.services.map((s: any) => [s.how, s.bonus])).toEqual([["percent", 7]]);
  });
});
