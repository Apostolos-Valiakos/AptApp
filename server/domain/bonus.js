// The staff bonus. A day's completed services earn under the staff member's
// rule for that day, one of two kinds:
// - percent: services are added up in order of start time (gaps don't count,
//   overlapping services each count in full); the service time past the
//   threshold earns the percent of that time's share of the service's price,
//   less the rule's deduction per service (never below 0). With a laser amount
//   set, laser services (see isLaser) earn it per hour of their time past the
//   threshold instead. With a fixed short-part amount set (last_service_fixed),
//   any service that isn't laser with 30 minutes or less of it past the
//   threshold, wherever it is in the day, earns that amount instead (e.g.
//   €2.20). Same-moment services:
//   the cheaper one counts first. Each service's bonus is rounded to the cent.
// - per_hour: the time worked (gaps don't count, overlapping time counts once)
//   past the threshold earns a fixed amount an hour, in proportion for part of
//   an hour, whatever the services; the day's bonus is rounded to the cent.
// Separately, a product sold earns its seller's product commission percent of
// its profit, on the day it was sold, rounded to the cent: what it was sold for
// less its bulk price with 24% VAT (each unit's rounded to the cent) times the
// quantity, never below zero. A product without a bulk price earns on what it
// was sold for.
// Monthly, each from its own rule (off without one; a rule set during a month
// applies to the whole month, as the one in force on its last day):
// - sales target: the month's completed services at the price charged
//   (redemptions at the value they stand for) earn the bonus of the highest
//   step whose target they reach, once for the month;
// - reviews: the shop's reviews gained in the month (count at its end less the
//   count on the 1st, typed in on the Bonus page) times the amount per review,
//   paid in full to each staff member with it on.

const DEFAULT_RULE = {
  enabled: true,
  kind: "percent",
  threshold_minutes: 300,
  percent: 10,
  amount_per_hour: 0,
  laser_amount_per_hour: null,
  deduction_per_service: 0,
  last_service_fixed: 2.2,
};
// The rule's fixed amount (last_service_fixed, the name from when it was for the
// day's last service only) is for a service up to this far past the threshold.
const LAST_SERVICE_MAX_MINUTES = 30;

const fold = (text) =>
  String(text || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
/** A laser service: "laser" or "λειζερ" in its name or category, any case or accents. */
const isLaser = (service) => /laser|λειζερ/.test(fold(`${service.service_name || ""} ${service.service_category || ""}`));

const round2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;

// The VAT added to a product's bulk price (fixed: Greece's standard rate).
const BULK_VAT_PERCENT = 24;
const bulkWithVat = (bulk) => round2((Number(bulk) * (100 + BULK_VAT_PERCENT)) / 100);

/**
 * What a sale's commission is a percent of: its profit when the sale has a
 * bulk price (`unit_bulk_price`, before VAT), else what it was sold for.
 */
const commissionBase = (sale) => {
  const sold = Number(sale.total_price) || 0;
  if (sale.unit_bulk_price == null) return { cost: null, base: sold };
  const cost = round2(bulkWithVat(sale.unit_bulk_price) * (Number(sale.quantity) || 1));
  return { cost, base: Math.max(0, round2(sold - cost)) };
};

/** The latest of `rules` starting on or before `day` (YYYY-MM-DD), or null. */
const latestOn = (rules, day) => {
  let found = null;
  for (const r of rules) if (r.effective_from <= day && (!found || r.effective_from > found.effective_from)) found = r;
  return found;
};

/**
 * The bonus rule a staff member works under on `day`. Without one, the
 * default: on for people, off for shared places (capacity above 1, e.g. the
 * sauna), which aren't paid a bonus.
 */
const ruleOn = (rules, day, capacity) => {
  const found = latestOn(rules, day);
  if (!found) return { ...DEFAULT_RULE, enabled: !(Number(capacity) > 1) };
  return {
    enabled: !!found.enabled,
    kind: found.kind === "per_hour" ? "per_hour" : "percent",
    threshold_minutes: Number(found.threshold_minutes),
    percent: Number(found.percent),
    amount_per_hour: Number(found.amount_per_hour || 0),
    laser_amount_per_hour: found.laser_amount_per_hour == null ? null : Number(found.laser_amount_per_hour),
    deduction_per_service: Number(found.deduction_per_service || 0),
    last_service_fixed: found.last_service_fixed == null ? null : Number(found.last_service_fixed),
  };
};

/** The product commission on `day`; off without a rule. */
const commissionOn = (rules, day) => {
  const found = latestOn(rules, day);
  return found ? { enabled: !!found.enabled, percent: Number(found.percent) } : { enabled: false, percent: 0 };
};

/** The sales-target rule on `day`: steps from the lowest target up; off without a rule. */
const targetOn = (rules, day) => {
  const found = latestOn(rules, day);
  if (!found || !found.enabled) return { enabled: false, steps: [] };
  const steps = (Array.isArray(found.steps) ? found.steps : [])
    .map((s) => ({ target: Number(s.target), bonus: Number(s.bonus) }))
    .filter((s) => s.target > 0)
    .sort((a, b) => a.target - b.target);
  return { enabled: steps.length > 0, steps };
};

/** The review rule on `day`; off without a rule. */
const reviewRuleOn = (rules, day) => {
  const found = latestOn(rules, day);
  return found && found.enabled ? { enabled: true, amount_per_review: Number(found.amount_per_review) } : { enabled: false, amount_per_review: 0 };
};

/** A month's sales against the steps: the highest step reached and the next one. */
const targetBonus = (steps, sales) => {
  let reached = null;
  let next = null;
  for (const step of steps) {
    if (round2(sales) >= step.target) reached = step;
    else if (!next) next = step;
  }
  return { reached, next, bonus: reached ? reached.bonus : 0 };
};

/** The reviews gained in a month; null until both counts are typed in. */
const reviewsGained = (counts) =>
  counts && counts.start_count != null && counts.end_count != null ? Math.max(0, Number(counts.end_count) - Number(counts.start_count)) : null;

/** The calendar months from `from` to `to` (YYYY-MM-DD): { month: YYYY-MM, first, last }. */
const monthsBetween = (from, to) => {
  const months = [];
  let [y, m] = from.slice(0, 7).split("-").map(Number);
  const [ty, tm] = to.slice(0, 7).split("-").map(Number);
  while (y < ty || (y === ty && m <= tm)) {
    const month = `${y}-${String(m).padStart(2, "0")}`;
    const days = new Date(Date.UTC(y, m, 0)).getUTCDate();
    months.push({ month, first: `${month}-01`, last: `${month}-${String(days).padStart(2, "0")}` });
    if (++m > 12) {
      m = 1;
      y++;
    }
  }
  return months;
};

/** Same-moment services: the cheaper one first, then in the order they were entered. */
const byStart = (a, b) =>
  new Date(a.start_time) - new Date(b.start_time) || Number(a.price) - Number(b.price) || Number(a.id) - Number(b.id);

// Each service's bonus says how it was worked out (`how`): "percent" of its
// price less the deduction (`base`), "laser" at the amount per hour, "fixed"
// at the service's own fixed amount (bonus_fixed, e.g. a diagnostic
// appointment), or "last" at the rule's fixed amount for a service with 30
// minutes or less past the threshold (any of the day's, not only the last).
// Two short services (30 minutes or less) past the threshold earn together
// what one Holistic does: 10% of €32.
const SHORT_PAIR_BONUS = 3.2;
const SHORT_SERVICE_MAX_MINUTES = 30;

/**
 * A percent-kind day. `opts.aesthetician`: an aesthetician's short services
 * earn their percent even before the threshold. Past the threshold, short
 * services (not laser, not with a fixed bonus of their own, and wholly past
 * it) are taken in pairs, in time order: each pair earns SHORT_PAIR_BONUS,
 * half each ("pair"); an odd one left over is worked out as any other.
 */
const percentDay = (sorted, rule, opts = {}) => {
  const counted = sorted.filter((s) => (Number(s.minutes) || 0) > 0);
  const deduction = Number(rule.deduction_per_service || 0);
  let worked = 0;
  // Each service's minutes past the threshold, in order.
  const lines = counted.map((s) => {
    const minutes = Number(s.minutes);
    const before = worked;
    worked += minutes;
    const past = Math.max(0, worked - Math.max(before, rule.threshold_minutes));
    const laser = rule.laser_amount_per_hour != null && isLaser(s);
    const fixed = !laser && s.bonus_fixed != null;
    const short = !laser && !fixed && minutes <= SHORT_SERVICE_MAX_MINUTES;
    return { s, minutes, past, laser, fixed, short };
  });
  // The short services wholly past the threshold, paired in time order; an
  // odd last one stays unpaired.
  const pairable = lines.filter((l) => l.short && l.past > 0 && l.past >= l.minutes);
  const paired = new Set(pairable.slice(0, pairable.length - (pairable.length % 2)));

  let extra = 0;
  let bonus = 0;
  const earning = [];
  for (const l of lines) {
    const { s, minutes, past, laser, fixed } = l;
    const base = Math.max(0, round2(Number(s.price) - deduction));
    let amount;
    let how;
    if (past <= 0) {
      // Before the threshold only an aesthetician's short services earn.
      if (!(opts.aesthetician && l.short)) continue;
      amount = round2((base * rule.percent) / 100);
      how = "short_early";
    } else if (laser) {
      amount = round2((past / 60) * rule.laser_amount_per_hour);
      how = "laser";
    } else if (fixed) {
      amount = round2(Number(s.bonus_fixed));
      how = "fixed";
    } else if (paired.has(l)) {
      amount = round2(SHORT_PAIR_BONUS / 2);
      how = "pair";
    } else if (rule.last_service_fixed != null && past <= LAST_SERVICE_MAX_MINUTES) {
      amount = round2(rule.last_service_fixed);
      how = "last";
    } else {
      amount = round2((base * (past / minutes) * rule.percent) / 100);
      how = "percent";
    }
    extra += past;
    bonus = round2(bonus + amount);
    earning.push({ ...s, minutes, extra_minutes: past, bonus: amount, how, base, deduction });
  }
  return { minutes: worked, extra_minutes: extra, bonus, services: earning };
};

// The minutes covered by at least one service: overlaps count once.
const coveredMinutes = (sorted) => {
  let total = 0;
  let end = -Infinity;
  for (const s of sorted) {
    const minutes = Number(s.minutes) || 0;
    if (minutes <= 0) continue;
    const start = new Date(s.start_time).getTime();
    const stop = start + minutes * 60000;
    if (stop <= end) continue;
    total += (stop - Math.max(start, end)) / 60000;
    end = stop;
  }
  return total;
};

const perHourDay = (sorted, rule) => {
  const worked = coveredMinutes(sorted);
  const extra = Math.max(0, worked - rule.threshold_minutes);
  return { minutes: worked, extra_minutes: extra, bonus: round2((extra / 60) * rule.amount_per_hour), services: [] };
};

/**
 * One staff member's day under `rule`. `services`: { id, start_time, minutes,
 * price, ... }. Answers the minutes worked, those past the threshold, the bonus
 * and, for a percent rule, the services that earned one.
 */
const bonusForDay = (services, rule, opts = {}) => {
  const sorted = [...services].sort(byStart);
  if (!rule.enabled) return { minutes: 0, extra_minutes: 0, bonus: 0, services: [] };
  return rule.kind === "per_hour" ? perHourDay(sorted, rule) : percentDay(sorted, rule, opts);
};

// An aesthetician, by the specialty (as the bonus migration 0024 finds them).
const isAesthetician = (member) => /αισθητικ/.test(fold(member?.specialty || ""));

const groupBy = (list, key) => {
  const map = new Map();
  for (const item of list) {
    if (!map.has(item[key])) map.set(item[key], []);
    map.get(item[key]).push(item);
  }
  return map;
};

/**
 * The report. `staff`: { id, name, capacity }; `rules` and `commissionRules`:
 * per staff, each from a date; `services`: completed ones, each with staff_id
 * and its shop-time day; `products`: sales with staff_id (the seller), day and
 * total_price. Staff with nothing earned or counted are left out.
 */
const bonusReport = ({
  staff,
  rules,
  commissionRules = [],
  services,
  products = [],
  months = [],
  targetRules = [],
  monthSales = [],
  reviewRules = [],
  reviewCounts = [],
}) => {
  const targetsOf = groupBy(targetRules, "staff_id");
  const reviewRulesOf = groupBy(reviewRules, "staff_id");
  const salesIn = new Map(monthSales.map((r) => [`${r.staff_id}|${r.month}`, Number(r.total) || 0]));
  const countsIn = new Map(reviewCounts.map((c) => [c.month, c]));
  const rulesOf = groupBy(rules, "staff_id");
  const commissionOf = groupBy(commissionRules, "staff_id");
  const servicesOf = groupBy(services, "staff_id");
  const salesOf = groupBy(products, "staff_id");

  const rows = [];
  for (const member of staff) {
    const dayRows = [];
    const byDay = groupBy(servicesOf.get(member.id) || [], "day");
    for (const day of [...byDay.keys()].sort()) {
      const rule = ruleOn(rulesOf.get(member.id) || [], day, member.capacity);
      if (!rule.enabled) continue;
      dayRows.push({
        date: day,
        kind: rule.kind,
        threshold_minutes: rule.threshold_minutes,
        percent: rule.percent,
        amount_per_hour: rule.amount_per_hour,
        laser_amount_per_hour: rule.laser_amount_per_hour,
        deduction_per_service: rule.deduction_per_service,
        last_service_fixed: rule.last_service_fixed,
        ...bonusForDay(byDay.get(day), rule, { aesthetician: isAesthetician(member) }),
      });
    }
    const productRows = [];
    for (const sale of salesOf.get(member.id) || []) {
      const rule = commissionOn(commissionOf.get(member.id) || [], sale.day);
      if (!rule.enabled) continue;
      const { cost, base } = commissionBase(sale);
      productRows.push({ ...sale, cost, base, percent: rule.percent, bonus: round2((base * rule.percent) / 100) });
    }
    productRows.sort((a, b) => (a.day < b.day ? -1 : a.day > b.day ? 1 : 0));

    const targetRows = [];
    const reviewRows = [];
    for (const m of months) {
      const target = targetOn(targetsOf.get(member.id) || [], m.last);
      if (target.enabled) {
        const sales = round2(salesIn.get(`${member.id}|${m.month}`) || 0);
        targetRows.push({ month: m.month, sales, steps: target.steps, ...targetBonus(target.steps, sales) });
      }
      const review = reviewRuleOn(reviewRulesOf.get(member.id) || [], m.last);
      if (review.enabled) {
        const counts = countsIn.get(m.month);
        const reviews = reviewsGained(counts);
        reviewRows.push({
          month: m.month,
          start_count: counts?.start_count ?? null,
          end_count: counts?.end_count ?? null,
          reviews,
          amount_per_review: review.amount_per_review,
          bonus: reviews == null ? 0 : round2(reviews * review.amount_per_review),
        });
      }
    }
    if (!dayRows.length && !productRows.length && !targetRows.length && !reviewRows.length) continue;

    const sum = (list, key) => list.reduce((n, d) => n + d[key], 0);
    const hoursBonus = round2(sum(dayRows, "bonus"));
    const productsBonus = round2(sum(productRows, "bonus"));
    const targetBonusTotal = round2(sum(targetRows, "bonus"));
    const reviewsBonus = round2(sum(reviewRows, "bonus"));
    rows.push({
      staff_id: member.id,
      staff_name: member.name,
      days_worked: dayRows.length,
      minutes: sum(dayRows, "minutes"),
      extra_minutes: sum(dayRows, "extra_minutes"),
      hours_bonus: hoursBonus,
      products_bonus: productsBonus,
      target_bonus: targetBonusTotal,
      reviews_bonus: reviewsBonus,
      bonus: round2(hoursBonus + productsBonus + targetBonusTotal + reviewsBonus),
      days: dayRows,
      products: productRows,
      targets: targetRows,
      reviews: reviewRows,
    });
  }
  rows.sort((a, b) => b.bonus - a.bonus || a.staff_name.localeCompare(b.staff_name));
  return { staff: rows, total: round2(rows.reduce((n, r) => n + r.bonus, 0)) };
};

module.exports = {
  DEFAULT_RULE,
  isLaser,
  BULK_VAT_PERCENT,
  bulkWithVat,
  commissionBase,
  ruleOn,
  commissionOn,
  targetOn,
  reviewRuleOn,
  targetBonus,
  monthsBetween,
  bonusForDay,
  bonusReport,
};
