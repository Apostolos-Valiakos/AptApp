const HEX = /^#[0-9a-f]{6}$/i;

export const DEFAULT_CATEGORY_COLOR = "#cdebf7";

// A service's own colour wins over its category's, and a category without
// its own colour falls back to DEFAULT_CATEGORY_COLOR. Anything that isn't a
// real #rrggbb value (e.g. legacy "#var(...)" junk) counts as unset.
export const resolveServiceColor = (
  serviceColor: string | null | undefined,
  categoryColor: string | null | undefined,
): string => {
  if (serviceColor && HEX.test(serviceColor)) return serviceColor;
  if (categoryColor && HEX.test(categoryColor)) return categoryColor;
  return DEFAULT_CATEGORY_COLOR;
};
