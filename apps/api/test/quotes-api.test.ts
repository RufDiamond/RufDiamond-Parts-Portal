import { Value } from "@sinclair/typebox/value";
import { describe, expect, it } from "vitest";
import { SubmitCommerceOrderInputSchema } from "@rufdiamond/contracts";
import { quoteEmailDeliveries } from "../src/modules/quotes/email-delivery.js";
import { applyDiscount, formatDecimal, parseDecimal } from "../src/modules/quotes/money.js";
import { missingBeforeNotify } from "../src/modules/quotes/notify-ready.js";

const message = {
  eventId: "e1",
  eventType: "quote.submitted.email",
  aggregateType: "quote_request",
  aggregateId: "a1",
  payloadVersion: 1,
  payload: { quoteNo: "RD-00001", companyName: "Demo Dealer", productLine: "Fat Truck", lineIds: ["x"], generalComment: "" },
  providerIdempotencyKey: "k1",
};

describe("quote email deliveries", () => {
  it("does not send while sending is disabled", async () => {
    delete process.env.QUOTE_EMAIL_SENDING;
    const deliveries = quoteEmailDeliveries({ async deliver() { throw new Error("should not send"); } });
    await expect(deliveries["quote.submitted.email"]!(message)).rejects.toThrow("QUOTE_EMAIL_SENDING_DISABLED");
    await expect(deliveries["commerce-order.submitted.email"]!({ ...message, eventType: "commerce-order.submitted.email" })).rejects.toThrow("QUOTE_EMAIL_SENDING_DISABLED");
  });

  it("sends a new quote to the factory and RUF, and an order to RUF only", async () => {
    process.env.QUOTE_EMAIL_SENDING = "enabled";
    process.env.QUOTE_FACTORY_EMAIL = "factory@example.test";
    process.env.QUOTE_RUF_EMAIL = "parts@example.test";
    const sent: Array<{ kind: string; to: string[] }> = [];
    const deliveries = quoteEmailDeliveries({
      async deliver(item) { sent.push({ kind: item.kind, to: item.to }); },
    });
    await deliveries["quote.submitted.email"]!(message);
    await deliveries["commerce-order.submitted.email"]!({
      ...message,
      eventType: "commerce-order.submitted.email",
      payload: { reference: "RD-00002", customerPo: "PO-1", netTotal: "10.00", currency: "CAD" },
    });
    expect(sent[0]).toEqual({ kind: "quote.submitted", to: ["factory@example.test", "parts@example.test"] });
    expect(sent[1]).toEqual({ kind: "commerce-order.submitted", to: ["parts@example.test"] });
    delete process.env.QUOTE_EMAIL_SENDING;
  });

  it("fails notify mail when no explicit recipients are authorized", async () => {
    process.env.QUOTE_EMAIL_SENDING = "enabled";
    const deliveries = quoteEmailDeliveries({ async deliver() { throw new Error("should not send"); } });
    await expect(deliveries["quote.notified.email"]!({
      ...message,
      eventType: "quote.notified.email",
      payload: { quoteNo: "RD-00001", companyId: "c", customerName: "Dealer", authorizedRecipients: [] },
    })).rejects.toThrow("QUOTE_NOTIFY_RECIPIENTS_UNRESOLVED");
    delete process.env.QUOTE_EMAIL_SENDING;
  });
});

describe("order price contract", () => {
  it("rejects a client unitPrice", () => {
    const body = {
      orderType: "regular",
      scheduleDate: null,
      poNumber: "PO-1",
      vin: "VIN123",
      shippingMethod: "purolator-ground",
      shipping: emptyAddress(),
      billing: emptyAddress(),
      instructions: "",
      currency: "CAD",
      lines: [{ kind: "quote", quoteLineId: "10000000-0000-4000-8000-000000000001", qty: 1, unitPrice: "0.01" }],
    };
    expect(Value.Check(SubmitCommerceOrderInputSchema, body)).toBe(false);
  });
});

describe("notify readiness and discount math", () => {
  it("rejects a line with no customer price", () => {
    expect(missingBeforeNotify({
      available: "yes",
      customerPrice: null,
      newQty: 1,
      requestedQty: 1,
      requested: { partNumber: "A", description: "B", qty: 1 },
      newPartNumber: null,
      newDescription: null,
    })).toContain("Unit Price");
  });

  it("discounts a list price without binary float drift", () => {
    const net = applyDiscount(parseDecimal("50.0000", 4), "0.100000", 4);
    expect(formatDecimal(net, 4)).toBe("45.0000");
  });
});

function emptyAddress() {
  return {
    firstName: "A", lastName: "B", company: "C", address: "1", city: "D",
    province: "ON", country: "CA", postalCode: "A1A1A1", email: "a@example.test", phone: "1",
  };
}
