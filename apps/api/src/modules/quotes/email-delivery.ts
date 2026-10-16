import type { OutboxDelivery, DeliveryMessage } from "../outbox/worker.js";

export interface QuoteEmailMessage {
  kind: "quote.submitted" | "quote.notified" | "commerce-order.submitted";
  to: string[];
  subject: string;
  body: string;
  providerIdempotencyKey: string;
  payload: Record<string, unknown>;
}

export interface QuoteEmailPort {
  deliver(message: QuoteEmailMessage): Promise<void>;
}

const FACTORY_INBOX = process.env.QUOTE_FACTORY_EMAIL ?? "factory@rufdiamond.com";
const RUF_PARTS_INBOX = process.env.QUOTE_RUF_EMAIL ?? "parts@rufdiamond.com";

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function text(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

/** Dual quote docs on submit: factory + RUF (PPT p53). */
export function createQuoteSubmittedDelivery(port: QuoteEmailPort): OutboxDelivery {
  return async (message: DeliveryMessage) => {
    const payload = asRecord(message.payload);
    const quoteNo = text(payload.quoteNo, "unknown");
    const companyName = text(payload.companyName, "Customer");
    const body = [
      `Quote request ${quoteNo} from ${companyName}.`,
      `Product line: ${text(payload.productLine)}`,
      `Lines: ${Array.isArray(payload.lineIds) ? payload.lineIds.length : 0}`,
      `Comment: ${text(payload.generalComment) || "(none)"}`,
      "",
      "Attach / generate the factory quotation and the dealer Customer Price quotation.",
    ].join("\n");
    await port.deliver({
      kind: "quote.submitted",
      to: [FACTORY_INBOX, RUF_PARTS_INBOX],
      subject: `Quote request ${quoteNo} — ${companyName}`,
      body,
      providerIdempotencyKey: message.providerIdempotencyKey,
      payload,
    });
  };
}

/** Notify Customer: portal notice already stored; also email the customer account. */
export function createQuoteNotifiedDelivery(port: QuoteEmailPort & {
  resolveCustomerEmails?: (companyId: string) => Promise<string[]>;
}): OutboxDelivery {
  return async (message: DeliveryMessage) => {
    const payload = asRecord(message.payload);
    const quoteNo = text(payload.quoteNo, "unknown");
    const companyId = text(payload.companyId);
    const customerName = text(payload.customerName, "Customer");
    const recipients = port.resolveCustomerEmails && companyId
      ? await port.resolveCustomerEmails(companyId)
      : [RUF_PARTS_INBOX];
    const to = recipients.length > 0 ? recipients : [RUF_PARTS_INBOX];
    await port.deliver({
      kind: "quote.notified",
      to,
      subject: `Your quote ${quoteNo} is ready`,
      body: [
        `Hello ${customerName},`,
        "",
        `Quote ${quoteNo} is ready in the Ruf Diamond Parts Portal.`,
        "Sign in and open Quote Status to review prices and place an order.",
      ].join("\n"),
      providerIdempotencyKey: message.providerIdempotencyKey,
      payload,
    });
  };
}

export function createCommerceOrderSubmittedDelivery(port: QuoteEmailPort): OutboxDelivery {
  return async (message: DeliveryMessage) => {
    const payload = asRecord(message.payload);
    const reference = text(payload.reference, "unknown");
    await port.deliver({
      kind: "commerce-order.submitted",
      to: [RUF_PARTS_INBOX],
      subject: `Order ${reference} submitted`,
      body: [
        `Commerce order ${reference} was submitted.`,
        `Customer PO: ${text(payload.customerPo)}`,
        `Net total: ${text(payload.netTotal)} ${text(payload.currency)}`,
      ].join("\n"),
      providerIdempotencyKey: message.providerIdempotencyKey,
      payload,
    });
  };
}

/** Console/log port used until SMTP credentials are configured. */
export function createLoggingQuoteEmailPort(log: (line: string) => void = console.info): QuoteEmailPort {
  return {
    async deliver(message) {
      log(`[quote-email] ${message.kind} → ${message.to.join(", ")} | ${message.subject}`);
    },
  };
}

export function quoteEmailDeliveries(port: QuoteEmailPort = createLoggingQuoteEmailPort()): Record<string, OutboxDelivery> {
  return {
    "quote.submitted.email": createQuoteSubmittedDelivery(port),
    "quote.notified.email": createQuoteNotifiedDelivery(port),
    "commerce-order.submitted.email": createCommerceOrderSubmittedDelivery(port),
  };
}
