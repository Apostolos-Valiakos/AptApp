// What the calendar shows while changes are waiting to sync: the last known
// appointments with every queued write applied on top — new bookings added,
// edits and moves applied, deletions removed, payments reflected. Each
// affected appointment is marked `_offline: "pending" | "conflict"`.
// Pure function, so it can be tested without a browser.
import type { QueuedWrite } from "./db";

export interface OverlayContext {
  services: any[]; // the service catalogue (GET /api/v1/services)
  clientById: (id: string) => any | undefined;
  idMap: Record<string, string>;
}

const APPT_RE = /^\/api\/v1\/appointments(?:\/([^/?]+))?(?:\?.*)?$/;

const minutesOf = (svc: any, catalogue: any) =>
  Number(svc.duration_override || svc.duration_minutes || catalogue?.duration_minutes) || 60;

/** A queued booking's services in the shape GET /api/v1/appointments returns. */
const toDisplayServices = (services: any[], ctx: OverlayContext) =>
  (services || [])
    .filter((s) => s && s.start_time)
    .map((s) => {
      const cat = ctx.services.find((c) => c.id === s.service_id);
      return {
        service_id: s.service_id,
        service_name: cat?.name || s._label || "",
        service_archived: cat ? cat.is_active === false : false,
        service_color: cat?.color_code ?? null,
        category_color: cat?.category_color ?? cat?.category_color_code ?? null,
        variation_name: s.variation_name ?? null,
        price: Number(s.price_override ?? s.price ?? cat?.price ?? 0),
        duration_minutes: minutesOf(s, cat),
        staff_id: s.staff_id,
        start_time: new Date(s.start_time).toISOString(),
      };
    })
    .sort((a, b) => a.start_time.localeCompare(b.start_time));

const clientFields = (clientId: string | null | undefined, ctx: OverlayContext, fallback: any = {}) => {
  const c = clientId ? ctx.clientById(clientId) : undefined;
  return {
    client_id: clientId ?? null,
    first_name: c?.first_name ?? fallback.first_name ?? "",
    last_name: c?.last_name ?? fallback.last_name ?? "",
    client_phone: c?.phone ?? fallback.client_phone ?? null,
  };
};

const totalOf = (appt: any) =>
  (appt.services || []).reduce((sum: number, s: any) => sum + Number(s.price || 0), 0) +
  (appt.products || []).reduce((sum: number, p: any) => sum + Number(p.price || 0) * Number(p.quantity || 1), 0);

const withPaymentStatus = (appt: any) => {
  const total = totalOf(appt);
  const paid = Number(appt.deposit_amount || 0);
  return {
    ...appt,
    payment_status: paid <= 0 ? "unpaid" : paid + 0.005 >= total ? "paid" : "partial",
  };
};

export function applyPendingWrites(appointments: any[], writes: QueuedWrite[], ctx: OverlayContext): any[] {
  // Keyed by id; a synced create is matched by its real id (via idMap) so the
  // server copy and its queued follow-ups merge into one.
  const byId = new Map<string, any>(appointments.map((a) => [String(a.id), a]));
  const realId = (id: string) => ctx.idMap[id] || id;
  const mark = (appt: any, w: QueuedWrite) => ({
    ...appt,
    _offline: appt._offline === "conflict" || w.status === "conflict" ? "conflict" : "pending",
  });

  for (const w of writes) {
    const path = w.endpoint;
    const m = path.match(APPT_RE);

    if (m && w.method === "POST" && !m[1]) {
      const id = realId(w.tempId || w.id);
      if (byId.has(id)) continue; // already synced and in the server list
      const services = toDisplayServices(w.body?.services, ctx);
      if (services.length === 0) continue;
      byId.set(
        id,
        mark(
          withPaymentStatus({
            id,
            version: null,
            status: w.body?.status || "new",
            internal_notes: w.body?.internal_notes ?? "",
            booking_notes: w.body?.booking_notes ?? "",
            is_block: !!w.body?.is_block,
            is_eoppy: !!w.body?.is_eoppy,
            save_receipt: w.body?.save_receipt !== false,
            group_id: null,
            recurrence: w.body?.recurrence ?? null,
            ...clientFields(w.body?.client_id, ctx),
            deposit_amount: 0,
            payment_method: null,
            services,
            products: w.body?.products || [],
            start_time: services[0].start_time,
          }),
          w,
        ),
      );
      continue;
    }

    if (m && m[1] && w.method === "PUT") {
      const id = realId(decodeURIComponent(m[1]));
      const current = byId.get(id);
      if (!current) continue;
      const services = w.body?.services ? toDisplayServices(w.body.services, ctx) : current.services;
      byId.set(
        id,
        mark(
          withPaymentStatus({
            ...current,
            // The queued edit will change the version: later edits of this
            // appointment mustn't repeat the check (they'd conflict with it).
            version: null,
            status: w.body?.status ?? current.status,
            internal_notes: w.body?.internal_notes ?? current.internal_notes,
            booking_notes: w.body?.booking_notes ?? current.booking_notes,
            ...(w.body && "client_id" in w.body ? clientFields(w.body.client_id, ctx, current) : {}),
            services: services.length ? services : current.services,
            products: w.body?.products ?? current.products,
            start_time: (services[0] || current.services?.[0])?.start_time ?? current.start_time,
          }),
          w,
        ),
      );
      continue;
    }

    if (m && m[1] && w.method === "DELETE") {
      const id = realId(decodeURIComponent(m[1]));
      if (w.status === "conflict") {
        const current = byId.get(id);
        if (current) byId.set(id, mark(current, w));
      } else {
        byId.delete(id);
      }
      continue;
    }

    if (path.startsWith("/api/v1/transactions") && w.method === "POST") {
      const targets: string[] = (w.body?.appointment_ids?.length ? w.body.appointment_ids : [w.body?.appointment_id])
        .filter(Boolean)
        .map((x: string) => realId(x));
      const amount = Number(w.body?.amount || 0) + Number(w.body?.amount2 || 0);
      // A combined same-day payment is split across the appointments in order.
      let left = amount;
      for (const id of targets) {
        const current = byId.get(id);
        if (!current) continue;
        const owed = Math.max(0, totalOf(current) - Number(current.deposit_amount || 0));
        const part = targets.length === 1 ? left : Math.min(owed, left);
        left -= part;
        byId.set(
          id,
          mark(
            withPaymentStatus({
              ...current,
              version: null, // payments change the version too
              deposit_amount: Number(current.deposit_amount || 0) + part,
              payment_method: w.body?.payment_method ?? current.payment_method,
            }),
            w,
          ),
        );
      }
    }
  }
  return [...byId.values()];
}
