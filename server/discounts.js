const round2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;

// Total discount for a base amount. `value` is a percentage for "percent"/"code",
// a currency amount for "fixed". Never exceeds the base.
const discountTotal = (type, value, base) => {
  const v = Number(value) || 0;
  if (!type || v <= 0 || base <= 0) return 0;
  const raw = type === "fixed" ? v : (base * v) / 100;
  return round2(Math.min(raw, base));
};

// Splits `total` across lines proportionally to their amounts, in integer cents
// (largest-remainder method), so allocations sum exactly and never exceed a line.
const allocate = (amounts, total) => {
  const cents = amounts.map((a) => Math.max(0, Math.round(a * 100)));
  const sum = cents.reduce((a, b) => a + b, 0);
  const totalC = Math.min(Math.round(total * 100), sum);
  if (sum <= 0 || totalC <= 0) return amounts.map(() => 0);
  const base = cents.map((c) => Math.floor((c * totalC) / sum));
  let left = totalC - base.reduce((a, b) => a + b, 0);
  const order = cents
    .map((c, i) => ({ i, frac: (c * totalC) % sum }))
    .sort((x, y) => y.frac - x.frac);
  for (const { i } of order) {
    if (left <= 0) break;
    if (base[i] < cents[i]) {
      base[i] += 1;
      left -= 1;
    }
  }
  return base.map((c) => c / 100);
};

// Applies a discount to service prices (and product lines when scope === "total").
// Returns discounted copies plus the list prices, so reports keep working off
// price_override / total_price while list prices stay recoverable for editing.
const applyDiscount = ({ type, value, scope }, services, products, { includeProducts = true } = {}) => {
  const svcAmounts = services.map((s) => Number(s.price_override) || 0);
  const prodAmounts = products.map(
    (p) => (Number(p.price) || 0) * (Number(p.quantity) || 1),
  );
  const useProducts = scope === "total" && includeProducts;
  const base =
    svcAmounts.reduce((a, b) => a + b, 0) +
    (useProducts ? prodAmounts.reduce((a, b) => a + b, 0) : 0);
  const total = discountTotal(type, value, base);
  const allocs = allocate(
    [...svcAmounts, ...(useProducts ? prodAmounts : [])],
    total,
  );
  const svcAlloc = allocs.slice(0, services.length);
  const prodAlloc = useProducts ? allocs.slice(services.length) : prodAmounts.map(() => 0);

  return {
    services: services.map((s, i) => ({
      ...s,
      list_price: svcAmounts[i],
      price_override: round2(svcAmounts[i] - svcAlloc[i]),
    })),
    productLineTotals: prodAmounts.map((a, i) => round2(a - prodAlloc[i])),
    discountAmount: round2(allocs.reduce((a, b) => a + b, 0)),
  };
};

module.exports = { round2, discountTotal, allocate, applyDiscount };
