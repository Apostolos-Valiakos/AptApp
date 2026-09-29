// Groups services by their category for grouped dropdowns; uncategorized last.
// Preserves the order `services` already arrives in (the server returns rows
// pre-sorted by each category's and service's own drag-configured position)
// rather than re-sorting alphabetically, so admin-configured ordering carries
// through to every screen that groups services this way.
export const groupServicesByCategory = (services: any[], uncategorizedLabel: string) => {
  const groups = new Map<string, any[]>();
  let uncategorized: any[] | null = null;
  for (const s of services || []) {
    const key = (s.category || "").trim() || "";
    if (key === "") {
      if (!uncategorized) uncategorized = [];
      uncategorized.push(s);
      continue;
    }
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(s);
  }
  const result = [...groups.entries()].map(([label, items]) => ({ label, items }));
  if (uncategorized) result.push({ label: uncategorizedLabel, items: uncategorized });
  return result;
};
