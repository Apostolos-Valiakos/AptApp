// Deterministic, network-free colored-initials avatar — same idea as the
// scheduler's staff avatars, but pure CSS so it never depends on an external
// image request inside a dialog that opens often.
const PALETTE = [
  "#6366f1", "#0ea5e9", "#14b8a6", "#f59e0b", "#ef4444",
  "#8b5cf6", "#22c55e", "#ec4899", "#3b82f6", "#f97316",
];

const hashString = (s: string) => {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
};

export const avatarColor = (name: string) =>
  PALETTE[hashString(name || "?") % PALETTE.length];

export const initials = (name: string) =>
  (name || "")
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0])
    .join("")
    .toUpperCase() || "?";
