// Shared places: a staff member that is really a room (ΣΑΟΥΝΑ, ΧΑΜΜΑΜ) takes
// several persons at once (staff.capacity). The server refuses a booking
// over that as over_capacity unless it's sent with allow_over_capacity; these
// are the same rules for the screens.

/** "10:05", in the device's time. */
export const hhmm = (value: string | number | Date) => {
  const d = new Date(value);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
};

/** Places at the same time; 1 for an ordinary staff member. */
export const placesOf = (staff: any) => Math.max(1, Number(staff?.capacity) || 1);

/** How many persons a service row is for. */
export const personsOf = (svc: any) => Math.max(1, Math.floor(Number(svc?.persons)) || 1);

/** The question asked before booking over the places (from an over_capacity answer). */
export const overCapacityMessage = (details: any, t: (key: string, params?: any) => string) => {
  const from = details?.start_time ? hhmm(details.start_time) : "";
  const to = details?.end_time ? hhmm(details.end_time) : "";
  return t("capacity.overMessage", {
    name: details?.staff_name || "",
    persons: details?.persons ?? "",
    capacity: details?.capacity ?? "",
    time: from && to ? `${from}–${to}` : from,
  });
};

/** Asks before booking over the places; true = book anyway. `confirm` is PrimeVue's useConfirm(). */
export const askOverCapacity = (
  confirm: { require: (options: any) => void },
  t: (key: string, params?: any) => string,
  details: any,
): Promise<boolean> =>
  new Promise((resolve) => {
    confirm.require({
      header: t("capacity.header"),
      message: overCapacityMessage(details, t),
      icon: "pi pi-users",
      acceptLabel: t("capacity.accept"),
      rejectLabel: t("common.cancel"),
      accept: () => resolve(true),
      reject: () => resolve(false),
      onHide: () => resolve(false),
    });
  });
