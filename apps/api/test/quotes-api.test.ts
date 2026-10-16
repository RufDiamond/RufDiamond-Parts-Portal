import { describe, expect, it } from "vitest";
import { quoteEmailDeliveries, createLoggingQuoteEmailPort } from "../src/modules/quotes/email-delivery.js";

describe("quote email deliveries", () => {
  it("registers submit, notify, and commerce-order handlers", () => {
    const sent: string[] = [];
    const deliveries = quoteEmailDeliveries(createLoggingQuoteEmailPort((line) => sent.push(line)));
    expect(Object.keys(deliveries).sort()).toEqual([
      "commerce-order.submitted.email",
      "quote.notified.email",
      "quote.submitted.email",
    ]);
  });

  it("delivers quote.submitted to factory and RUF inboxes", async () => {
    const messages: Array<{ kind: string; to: string[]; subject: string }> = [];
    const deliveries = quoteEmailDeliveries({
      async deliver(message) {
        messages.push({ kind: message.kind, to: message.to, subject: message.subject });
      },
    });
    await deliveries["quote.submitted.email"]!({
      eventId: "e1",
      eventType: "quote.submitted.email",
      aggregateType: "quote_request",
      aggregateId: "a1",
      payloadVersion: 1,
      payload: { quoteNo: "RD-00001", companyName: "Demo Dealer", productLine: "Fat Truck", lineIds: ["x"], generalComment: "" },
      providerIdempotencyKey: "k1",
    });
    expect(messages).toHaveLength(1);
    expect(messages[0].kind).toBe("quote.submitted");
    expect(messages[0].to.length).toBeGreaterThanOrEqual(2);
    expect(messages[0].subject).toContain("RD-00001");
  });
});
