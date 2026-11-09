// Sauna and hammam services are booked on the staff member that is the room
// itself (ΣΑΟΥΝΑ, ΧΑΜΜΑΜ), found by name: in a combination's parts and when
// booked on their own. A default staff member set on the service wins over this.

const plain = (s: string | null | undefined) =>
  (s || "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();

const ROOMS = [
  // Hammam first: "ΗΑΜΑΜ" is also written with a Greek Η.
  { pattern: /χαμ+αμ|ηαμαμ|ham+am/, words: ["χαμμαμ", "χαμαμ", "hammam", "hamam"] },
  { pattern: /σαουνα|sauna/, words: ["σαουνα", "sauna"] },
];

const roomStaff = (staff: any[], room: (typeof ROOMS)[number]) => {
  const candidates = (staff || []).filter((s) => s && s.is_active !== false && room.pattern.test(plain(s.name)));
  return (
    candidates.find((s) => room.words.includes(plain(s.name))) ||
    candidates.find((s) => Number(s.capacity) > 1) ||
    candidates[0] ||
    null
  );
};

/**
 * Whether a service with this name is a sauna or hammam one (`matched`), and
 * the staff member it then belongs on (null when the shop has none).
 */
export const placeStaffFor = (serviceName: string | null | undefined, staff: any[]) => {
  const name = plain(serviceName);
  const room = name ? ROOMS.find((r) => r.pattern.test(name)) : undefined;
  if (!room) return { matched: false, staffId: null as string | null };
  const found = roomStaff(staff, room);
  return { matched: true, staffId: found ? (found.id as string) : null };
};

/**
 * The staff member a part of a combination is booked on: the service's own
 * default, else the sauna/hammam room for such a service, else `otherwise`.
 */
export const staffForPart = (
  part: { name?: string | null; default_staff_id?: string | null },
  staff: any[],
  otherwise: string | null,
) => {
  if (part.default_staff_id) return part.default_staff_id;
  const place = placeStaffFor(part.name, staff);
  return place.matched ? place.staffId : otherwise;
};
