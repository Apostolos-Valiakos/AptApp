// Groups services by their category for grouped dropdowns; uncategorized last.
export const groupServicesByCategory = (services: any[], uncategorizedLabel: string) => {
  const groups = new Map<string, any[]>();
  for (const s of services || []) {
    const key = (s.category || "").trim() || "";
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(s);
  }
  return [...groups.entries()]
    .sort(([a], [b]) => (a === "" ? 1 : b === "" ? -1 : a.localeCompare(b)))
    .map(([label, items]) => ({
      label: label || uncategorizedLabel,
      items: items.slice().sort((x, y) => String(x.name).localeCompare(String(y.name))),
    }));
};
