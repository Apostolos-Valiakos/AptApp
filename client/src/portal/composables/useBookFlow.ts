// The Book screen's state (REDESIGN_SPEC.md §5.2): 1 service, 2 therapist
// ("Anyone" first) and time on a 14-day strip, 3 confirm. Also moving a
// booking (N2): steps 2 and 3 with the service kept and its own time free.
// Free times come from the server's one rule (domain/availability.js), the
// same one that checks the booking when it's sent, and that the assistant uses.
import { computed, reactive, ref } from "vue";
import { useRoute, useRouter } from "vue-router";
import { api, ApiError } from "../../api/http";
import { toLocalDateStr } from "../../utils/staffAvailability";
import { usePortalBookingActions, PortalActionError } from "./usePortalBookingActions";
import { useFeedback } from "./useFeedback";
import { usePortalBookingsStore, type PortalBooking } from "../stores/bookings";
import { useBookingSuccessStore } from "../stores/success";

export type Slot = { start_time: string; staff_id: string; staff_name: string };
export type DayCount = { date: string; count: number };
export const ANYONE = "any";
export const STRIP_DAYS = 14;

export const useBookFlow = () => {
  const route = useRoute();
  const router = useRouter();
  const actions = usePortalBookingActions();
  const feedback = useFeedback();
  const bookings = usePortalBookingsStore();
  const success = useBookingSuccessStore();

  const services = ref<any[]>([]);
  const staff = ref<any[]>([]);
  const days = ref<DayCount[]>([]);
  const slots = ref<Slot[]>([]);
  const state = reactive({
    step: 1 as 1 | 2 | 3,
    disabled: false,
    loadingServices: true,
    loadingSlots: false,
    submitting: false,
    service: null as any,
    staffChoice: ANYONE as string,
    date: toLocalDateStr(new Date()),
    slot: null as Slot | null,
    notes: "",
    /** The booking being moved, in reschedule mode. */
    moving: null as PortalBooking | null,
    error: "",
  });

  const query = (params: Record<string, string | undefined>) =>
    new URLSearchParams(Object.entries(params).filter(([, v]) => v) as [string, string][]).toString();
  const common = () => ({
    service_id: state.service?.id,
    staff_id: state.staffChoice === ANYONE ? undefined : state.staffChoice,
    exclude: state.moving?.id,
  });

  const loadSlots = async () => {
    if (!state.service) return;
    state.loadingSlots = true;
    state.slot = null;
    try {
      slots.value = await api.get<Slot[]>(`/api/v1/portal/availability/slots?${query({ ...common(), date: state.date })}`);
    } catch {
      slots.value = [];
    } finally {
      state.loadingSlots = false;
    }
  };

  // The strip's counts, then the first day with a free time (from today).
  const loadDays = async ({ pickFirstFree = false } = {}) => {
    try {
      days.value = await api.get<DayCount[]>(
        `/api/v1/portal/availability/days?${query({ ...common(), from: toLocalDateStr(new Date()), days: String(STRIP_DAYS) })}`,
      );
    } catch {
      days.value = [];
    }
    if (pickFirstFree) state.date = days.value.find((d) => d.count > 0)?.date || state.date;
  };

  const chooseService = async (service: any, staffChoice: string = ANYONE) => {
    state.service = service;
    state.staffChoice = staffChoice;
    state.step = 2;
    try {
      staff.value = await api.get(`/api/v1/portal/staff?service_id=${encodeURIComponent(service.id)}`);
    } catch {
      staff.value = [];
    }
    if (staffChoice !== ANYONE && !staff.value.some((m) => m.id === staffChoice)) state.staffChoice = ANYONE;
    await loadDays({ pickFirstFree: true });
    await loadSlots();
  };

  const setStaff = async (choice: string) => {
    state.staffChoice = choice;
    feedback.tick();
    await loadDays({ pickFirstFree: !days.value.find((d) => d.date === state.date)?.count });
    await loadSlots();
  };
  const setDate = async (date: string) => {
    state.date = date;
    feedback.tick();
    await loadSlots();
  };
  const pickSlot = (slot: Slot) => {
    state.slot = slot;
    feedback.tick();
  };

  /** Loads the services, then follows the link: ?service=&staff= or a booking to move. */
  const init = async () => {
    state.loadingServices = true;
    try {
      services.value = await api.get("/api/v1/portal/services");
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) state.disabled = true;
    } finally {
      state.loadingServices = false;
    }
    if (state.disabled) return;

    const movingId = route.params.id as string | undefined;
    if (movingId) {
      if (!bookings.loaded) await bookings.load();
      const booking = bookings.byId(movingId);
      const service = booking && services.value.find((s) => s.id === booking.services[0]?.service_id);
      if (!booking || booking.services.length !== 1 || !service) {
        state.error = booking && booking.services.length !== 1 ? "multi_service" : "not_found";
        return;
      }
      state.moving = booking;
      await chooseService(service, booking.services[0].staff_id || ANYONE);
      return;
    }
    const wanted = services.value.find((s) => s.id === route.query.service);
    if (wanted) await chooseService(wanted, (route.query.staff as string) || ANYONE);
  };

  const back = () => {
    if (state.step === 3) state.step = 2;
    else if (state.step === 2 && !state.moving) {
      state.step = 1;
      state.service = null;
    }
  };

  const submit = async () => {
    if (!state.service || !state.slot) return;
    state.submitting = true;
    try {
      if (state.moving) {
        await actions.reschedule(state.moving.id, { start_time: state.slot.start_time, staff_id: state.slot.staff_id });
        success.show(state.moving.id, "moved");
      } else {
        const done = await actions.book({ service_id: state.service.id, staff_id: state.slot.staff_id, start_time: state.slot.start_time, booking_notes: state.notes });
        success.show(done.id, "booked");
      }
      state.step = 1;
      state.service = null;
      state.slot = null;
      state.notes = "";
      router.replace("/portal/bookings");
    } catch (err) {
      // Taken meanwhile: back to the times, freshly loaded.
      if (err instanceof PortalActionError && err.reason === "slot_unavailable") {
        state.step = 2;
        await loadDays();
        await loadSlots();
      }
    } finally {
      state.submitting = false;
    }
  };

  const staffName = computed(() => (state.staffChoice === ANYONE ? null : staff.value.find((m) => m.id === state.staffChoice)?.name || null));

  return { state, services, staff, days, slots, staffName, init, chooseService, setStaff, setDate, pickSlot, back, submit, loadSlots };
};
