// How tall the scheduler's 15-minute rows are. The steps of the zoom buttons,
// tallest first; a phone's first look can sit between them (see fitRowHeight).
export const ZOOM_ROW_HEIGHTS = [81, 54, 40, 27, 20, 13, 9];
export const DEFAULT_ROW_HEIGHT = 27;
// Below this a phone's cards can't show a name and a service, so a long day scrolls.
const PHONE_MIN_ROW_HEIGHT = 20;
const SLOT_MINUTES = 15;
const SAVED_KEY = "scheduler.rowHeight";

const minutesOf = (time: string) => {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + (m || 0);
};

/** A phone's first row height: the tallest that shows the shop's hours in `availablePx`, but readable. */
export const fitRowHeight = (availablePx: number, minTime: string, maxTime: string) => {
  const rows = Math.max(1, Math.ceil((minutesOf(maxTime) - minutesOf(minTime)) / SLOT_MINUTES));
  const tallest = ZOOM_ROW_HEIGHTS[0];
  return Math.min(tallest, Math.max(PHONE_MIN_ROW_HEIGHT, Math.floor(availablePx / rows)));
};

export const zoomedIn = (height: number) =>
  ZOOM_ROW_HEIGHTS.filter((h) => h > height).pop() ?? height;
export const zoomedOut = (height: number) =>
  ZOOM_ROW_HEIGHTS.find((h) => h < height) ?? height;

// Each device remembers its own zoom, once the user has picked one.
export const readSavedRowHeight = (): number | null => {
  try {
    const saved = Number(localStorage.getItem(SAVED_KEY));
    return ZOOM_ROW_HEIGHTS.includes(saved) ? saved : null;
  } catch {
    return null;
  }
};
export const saveRowHeight = (height: number) => {
  try {
    localStorage.setItem(SAVED_KEY, String(height));
  } catch {}
};
