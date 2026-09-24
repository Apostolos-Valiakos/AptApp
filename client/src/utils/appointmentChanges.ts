export interface ServiceSnapshot {
  service_id: any;
  staff_id: any;
  start_time: number;
  duration: number;
  price: number;
}

export const snapshotServices = (list: any[]): ServiceSnapshot[] =>
  (list || []).map((s) => ({
    service_id: s.service_id ?? null,
    staff_id: s.staff_id ?? null,
    start_time: s.start_time ? new Date(s.start_time).getTime() : 0,
    duration: Number(s.duration_override ?? s.duration_minutes ?? 0),
    price: Number(s.price_override ?? s.price ?? 0),
  }));

interface Lookups {
  services: any[];
  staff: any[];
  t: (key: string, params?: any) => string;
  locale: string;
}

const fmtTime = (ms: number, locale: string) =>
  new Date(ms).toLocaleString(locale, {
    weekday: "short",
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });

// Human-readable before → after lines; empty array means nothing relevant changed.
export const describeServiceChanges = (
  before: ServiceSnapshot[],
  after: ServiceSnapshot[],
  { services, staff, t, locale }: Lookups,
): string[] => {
  const svcName = (id: any) =>
    services?.find((s: any) => s.id == id)?.name || "—";
  const staffName = (id: any) => {
    const m = staff?.find((s: any) => s.id == id);
    return m?.name || m?.title || "—";
  };
  const lines: string[] = [];
  const multi = Math.max(before.length, after.length) > 1;

  for (let i = 0; i < Math.max(before.length, after.length); i++) {
    const b = before[i];
    const a = after[i];
    if (!b && a) {
      lines.push(
        `${t("booking.changeConfirm.added")}: ${svcName(a.service_id)} — ${staffName(a.staff_id)}, ${fmtTime(a.start_time, locale)}`,
      );
      continue;
    }
    if (b && !a) {
      lines.push(
        `${t("booking.changeConfirm.removed")}: ${svcName(b.service_id)} — ${staffName(b.staff_id)}, ${fmtTime(b.start_time, locale)}`,
      );
      continue;
    }
    const prefix = multi ? `${svcName(b.service_id)}: ` : "";
    if (b.service_id != a.service_id)
      lines.push(
        `${t("booking.changeConfirm.service")}: ${svcName(b.service_id)} → ${svcName(a.service_id)}`,
      );
    if (b.staff_id != a.staff_id)
      lines.push(
        `${prefix}${t("booking.changeConfirm.staff")}: ${staffName(b.staff_id)} → ${staffName(a.staff_id)}`,
      );
    if (b.start_time !== a.start_time)
      lines.push(
        `${prefix}${t("booking.changeConfirm.time")}: ${fmtTime(b.start_time, locale)} → ${fmtTime(a.start_time, locale)}`,
      );
    if (b.duration !== a.duration)
      lines.push(
        `${prefix}${t("booking.changeConfirm.duration")}: ${b.duration} → ${a.duration} min`,
      );
    if (b.price !== a.price)
      lines.push(
        `${prefix}${t("booking.changeConfirm.price")}: €${b.price.toFixed(2)} → €${a.price.toFixed(2)}`,
      );
  }
  return lines;
};
