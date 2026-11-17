// How the financials page's tiles and tabs reach its data.
import { inject, type InjectionKey } from "vue";
import type { FinancialsContext } from "./useFinancials";

export const FinancialsKey: InjectionKey<FinancialsContext> = Symbol("financials");

export const useFinancialsPage = () => {
  const ctx = inject(FinancialsKey);
  if (!ctx) throw new Error("useFinancialsPage() outside the financials page");
  return ctx;
};
