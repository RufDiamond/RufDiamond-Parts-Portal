import { afterEach, expect, it, vi } from "vitest";
import { quoteEmailDeliveries } from "../src/modules/quotes/email-delivery.js";

afterEach(() => vi.unstubAllEnvs());

it("never acknowledges quote delivery using an implicit logging port", async () => {
  vi.stubEnv("QUOTE_EMAIL_SENDING", "enabled");
  vi.stubEnv("QUOTE_FACTORY_EMAIL", "factory@example.test");
  vi.stubEnv("QUOTE_RUF_EMAIL", "parts@example.test");
  const delivery = quoteEmailDeliveries()["quote.submitted.email"]!;
  await expect(delivery({
    eventId: "e", eventType: "quote.submitted.email", aggregateType: "quote_request",
    aggregateId: "q", payloadVersion: 1, payload: { quoteNo: "RD-00001" },
    providerIdempotencyKey: "e",
  })).rejects.toThrow("QUOTE_EMAIL_TRANSPORT_UNCONFIGURED");
});
