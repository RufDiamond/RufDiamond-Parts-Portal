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

function factoryInbox(): string {
  return process.env.QUOTE_FACTORY_EMAIL ?? "";
}
function rufInbox(): string {
  return process.env.QUOTE_RUF_EMAIL ?? "";
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function text(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function requireSending(): void {
  if (process.env.QUOTE_EMAIL_SENDING !== "enabled") {
    throw new Error("QUOTE_EMAIL_SENDING_DISABLED");
  }
}

/** Dual quote docs on submit: factory inbox and RUF inbox. Order mail is separate. */
export function createQuoteSubmittedDelivery(port: QuoteEmailPort): OutboxDelivery {
  return async (message: DeliveryMessage) => {
    requireSending();
    const factory = factoryInbox();
    const ruf = rufInbox();
    if (!factory || !ruf) throw new Error("QUOTE_SUBMIT_RECIPIENTS_UNRESOLVED");
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
      to: [factory, ruf],
      subject: `Quote request ${quoteNo} — ${companyName}`,
      body,
      providerIdempotencyKey: message.providerIdempotencyKey,
      payload,
    });
  };
}

/**
 * Notify Customer mail. Recipients must already be an explicit authorized list
 * on the payload. An empty list fails. The RUF inbox is not a fallback.
 * Real sending stays off until QUOTE_EMAIL_SENDING=enabled.
 */
export function createQuoteNotifiedDelivery(port: QuoteEmailPort): OutboxDelivery {
  return async (message: DeliveryMessage) => {
    requireSending();
    const payload = asRecord(message.payload);
    const quoteNo = text(payload.quoteNo, "unknown");
    const customerName = text(payload.customerName, "Customer");
    const recipients = Array.isArray(payload.authorizedRecipients)
      ? payload.authorizedRecipients.filter((value): value is string => typeof value === "string" && value.includes("@"))
      : [];
    if (recipients.length === 0) throw new Error("QUOTE_NOTIFY_RECIPIENTS_UNRESOLVED");
    await port.deliver({
      kind: "quote.notified",
      to: recipients,
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
    requireSending();
    const ruf = rufInbox();
    if (!ruf) throw new Error("ORDER_RECIPIENTS_UNRESOLVED");
    const payload = asRecord(message.payload);
    const reference = text(payload.reference, "unknown");
    await port.deliver({
      kind: "commerce-order.submitted",
      to: [ruf],
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
