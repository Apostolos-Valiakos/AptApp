// The four things a client can do to a booking — book, move, cancel, confirm
// attendance — done the same way from the portal's screens and from the AI
// assistant's cards: the same server routes (so the same rules: only offered
// times, only bookings still to come), the same texts when the server says
// no, the same feedback, and every open screen told to reload.
import { useI18n } from "vue-i18n";
import { api, ApiError } from "../../api/http";
import { useFeedback } from "./useFeedback";

export type NewBooking = { service_id: string; staff_id: string; start_time: string; booking_notes?: string };

/** A refused action: `reason` is the server's code, `message` the client's text. */
export class PortalActionError extends Error {
  constructor(
    message: string,
    public reason: string,
  ) {
    super(message);
  }
}

export const newIdempotencyKey = () =>
  typeof crypto !== "undefined" && typeof crypto.randomUUID === "function" ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`;

/** Every open portal screen reloads its bookings on this. */
export const announceAppointmentsChanged = () => window.dispatchEvent(new CustomEvent("appointments-changed"));

export const usePortalBookingActions = () => {
  const { t, te } = useI18n();
  const feedback = useFeedback();

  // The server's code ({ reason } from a booking, { error } elsewhere) as a
  // text; a 404 is a booking gone or no longer changeable.
  const refusal = (err: unknown, fallback: string): PortalActionError => {
    if (!(err instanceof ApiError)) return new PortalActionError(t("portal.actions.errors.offline"), "offline");
    const code = String(err.data?.reason || err.data?.error || "");
    const key = `portal.actions.errors.${code}`;
    if (code && te(key)) return new PortalActionError(t(key), code);
    if (err.status === 404) return new PortalActionError(t("portal.actions.errors.not_found"), "not_found");
    return new PortalActionError(fallback, code || `http_${err.status}`);
  };

  /**
   * Runs one action. `quiet` leaves out the toast (the assistant's card shows
   * the outcome itself); the vibration and the reload happen either way.
   */
  const run = async <T>(request: () => Promise<T>, done: string, failed: string, quiet: boolean): Promise<T> => {
    let result: T;
    try {
      result = await request();
    } catch (err) {
      const refused = refusal(err, failed);
      if (quiet) feedback.warning();
      else feedback.error(refused.message);
      throw refused;
    }
    feedback.success(quiet ? undefined : done);
    announceAppointmentsChanged();
    return result;
  };

  return {
    /** `key` makes a repeat of the same booking (a retry) a no-op on the server. */
    book: (booking: NewBooking, { key = newIdempotencyKey(), quiet = false } = {}) =>
      run(
        () => api.post<{ id: string }>("/api/v1/appointments", {
          ...(booking.booking_notes ? { booking_notes: booking.booking_notes } : {}),
          services: [{ service_id: booking.service_id, staff_id: booking.staff_id, start_time: booking.start_time }],
        }, { headers: { "Idempotency-Key": key } }),
        t("portal.actions.booked"),
        t("portal.actions.bookFailed"),
        quiet,
      ),
    reschedule: (id: string, to: { start_time: string; staff_id?: string | null }, { quiet = false } = {}) =>
      run(
        () => api.post(`/api/v1/portal/appointments/${encodeURIComponent(id)}/reschedule`, { start_time: to.start_time, ...(to.staff_id ? { staff_id: to.staff_id } : {}) }),
        t("portal.actions.moved"),
        t("portal.actions.moveFailed"),
        quiet,
      ),
    cancel: (id: string, { quiet = false } = {}) =>
      run(
        () => api.post(`/api/v1/portal/appointments/${encodeURIComponent(id)}/cancel`),
        t("portal.toast.appointmentCancelled"),
        t("portal.toast.cancelFailed"),
        quiet,
      ),
    confirmAttendance: (id: string, { quiet = false } = {}) =>
      run(
        () => api.post(`/api/v1/portal/appointments/${encodeURIComponent(id)}/confirm`),
        t("portal.toast.appointmentConfirmed"),
        t("portal.toast.confirmFailed"),
        quiet,
      ),
  };
};
