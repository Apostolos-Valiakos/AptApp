// A payment recorded the wrong way: the refund starts on the way the latest
// payment was made, and a payment can be moved to the right way in one step.
// RF1–RF2.
import { describe, expect, test } from "vitest";
import { reactive } from "vue";
import RefundDialog from "../../client/src/components/booking/RefundDialog.vue";
import ChangePaymentMethodDialog from "../../client/src/components/booking/ChangePaymentMethodDialog.vue";
import el from "../../client/src/i18n/locales/el";
import { fakeServer, mountScreen, pageText, settle } from "./helpers";

const ways = { body: { methods: [{ method: "card", net: 49 }], last_method: "card" } };
const byTestId = (id: string) => document.querySelector<HTMLElement>(`[data-testid="${id}"]`);

describe("RF1 the refund starts on the way the latest payment was made", () => {
  test("paid by card: the refund method is card, and what was paid each way is shown", async () => {
    fakeServer({ "GET /api/v1/appointments/a1/payment-methods": ways });
    const props = reactive({ visible: false, appointmentId: "a1", maxRefundable: 49 });
    mountScreen(RefundDialog, { props });
    props.visible = true;
    await settle();
    expect(byTestId("refund-method")?.textContent).toContain(el.common.paymentMethod.card);
    expect(byTestId("refund-paid-ways")?.textContent).toContain("49");
  });

  test("nothing known: it starts on cash", async () => {
    fakeServer({ "GET /api/v1/appointments/a1/payment-methods": { body: { methods: [], last_method: null } } });
    const props = reactive({ visible: false, appointmentId: "a1", maxRefundable: 10 });
    mountScreen(RefundDialog, { props });
    props.visible = true;
    await settle();
    expect(byTestId("refund-method")?.textContent).toContain(el.common.paymentMethod.cash);
  });
});

describe("RF2 moving a payment to the right way in one step", () => {
  test("opens on the card payment's whole amount, to cash; one request does both", async () => {
    const server = fakeServer({
      "GET /api/v1/appointments/a1/payment-methods": ways,
      "POST /api/v1/appointments/a1/change-payment-method": { body: { success: true, payment_status: "paid", new_balance: 0 } },
    });
    const props = reactive({ visible: false, appointmentId: "a1" });
    mountScreen(ChangePaymentMethodDialog, { props });
    props.visible = true;
    await settle();
    expect(byTestId("change-method-from")?.textContent).toContain(el.common.paymentMethod.card);
    expect(byTestId("change-method-to")?.textContent).toContain(el.common.paymentMethod.cash);
    byTestId("change-method-confirm")!.click();
    await settle();
    expect(server.called("POST", "/api/v1/appointments/a1/change-payment-method")[0]?.body).toEqual({
      from_method: "card",
      to_method: "cash",
      amount: 49,
    });
    expect(pageText()).toContain(el.changeMethod.success);
  });
});
