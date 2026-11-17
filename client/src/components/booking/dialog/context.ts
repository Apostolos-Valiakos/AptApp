// How the booking dialog's parts reach one another. The dialog makes the
// state (useBookingState.ts) and its parts, and provides all of it to its
// components (BookingHeader, BookingMainTab, BookingPaymentTab, BookingFooter,
// BookingClientPane), which take it with useBookingDialog().
import { inject, type InjectionKey } from "vue";
import type { BookingState } from "./useBookingState";
import type { useBookingClient } from "./useBookingClient";
import type { useBookingLoad } from "./useBookingLoad";
import type { useBookingSave } from "./useBookingSave";
import type { useBookingPayment } from "./useBookingPayment";
import type { useBookingDelete } from "./useBookingDelete";

/**
 * The calls one part makes into another. The dialog fills each in as soon
 * as its part is made, before any part that calls it at once (loading).
 */
export type Later = {
  groupWithSameDayAppointment: (clientId: string) => Promise<void>;
  loadClientById: (clientId: string, fallback: any) => Promise<void>;
  loadWalkInClient: () => Promise<void>;
  loadSiblingAppointments: (clientId: string, startTime: Date) => Promise<void>;
  savedClientNotes: () => string;
  saveClientNotes: () => Promise<void>;
  resetPayment: () => void;
  suggestAmountToPay: () => void;
  markLoaded: () => void;
  save: (close?: boolean) => Promise<boolean>;
};

export type BookingDialogContext = BookingState &
  ReturnType<typeof useBookingClient> &
  ReturnType<typeof useBookingLoad> &
  ReturnType<typeof useBookingSave> &
  ReturnType<typeof useBookingPayment> &
  ReturnType<typeof useBookingDelete>;

export const BookingDialogKey: InjectionKey<BookingDialogContext> = Symbol("booking-dialog");

/** The open booking dialog, for its components. */
export const useBookingDialog = () => {
  const ctx = inject(BookingDialogKey);
  if (!ctx) throw new Error("useBookingDialog() outside the booking dialog");
  return ctx;
};
