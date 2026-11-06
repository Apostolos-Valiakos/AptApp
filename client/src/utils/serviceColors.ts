const HEX = /^#[0-9a-f]{6}$/i;

export const DEFAULT_CATEGORY_COLOR = "#cdebf7";
// What the database puts on a service nobody has coloured. Dark text can't be
// read on it, and it says nothing about what the shop wants, so it counts as
// unset here; the stored value stays as it is.
const UNCHOSEN_SERVICE_COLOR = "#3788d8";

// A service's own colour wins over its category's, and a category without
// its own colour falls back to DEFAULT_CATEGORY_COLOR. Anything that isn't a
// real #rrggbb value (e.g. legacy "#var(...)" junk) counts as unset.
export const resolveServiceColor = (
  serviceColor: string | null | undefined,
  categoryColor: string | null | undefined,
): string => {
  if (serviceColor && HEX.test(serviceColor) && serviceColor.toLowerCase() !== UNCHOSEN_SERVICE_COLOR) return serviceColor;
  if (categoryColor && HEX.test(categoryColor)) return categoryColor;
  return DEFAULT_CATEGORY_COLOR;
};
