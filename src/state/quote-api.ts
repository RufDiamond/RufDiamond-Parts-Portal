"use client";

import type {
  AddFactoryQuoteLineInput,
  CustomerQuotePage,
  NotifyQuoteInput,
  PatchQuoteLineInput,
  QuoteLine,
  QuoteLinePage,
  SubmitCommerceOrderInput,
  SubmitCommerceOrderResult,
  SubmitQuoteInput,
  SubmitQuoteResult,
} from "@rufdiamond/contracts";
import type { QuoteStatusRecord } from "@/types/quotes";
import type { QuoteNotice } from "./quote-store";

export class QuoteApiError extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
    this.name = "QuoteApiError";
  }
}

function idempotencyKey(prefix: string): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return `${prefix}-${crypto.randomUUID()}`;
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

async function send<T>(
  path: string,
  init: { method: string; csrfToken?: string; body?: unknown; key?: string },
): Promise<T> {
  const headers: Record<string, string> = {};
  if (init.body !== undefined) {
    headers["content-type"] = "application/json";
    if (init.csrfToken) headers["x-csrf-token"] = init.csrfToken;
    if (init.key) headers["idempotency-key"] = init.key;
  } else if (init.method !== "GET" && init.csrfToken) {
    headers["content-type"] = "application/json";
    headers["x-csrf-token"] = init.csrfToken;
  }
  const response = await fetch(`/api/v1/${path}`, {
    method: init.method,
    credentials: "same-origin",
    cache: "no-store",
    redirect: "error",
    headers,
    ...(init.body !== undefined ? { body: JSON.stringify(init.body) } : init.method !== "GET" ? { body: "{}" } : {}),
  });
  let result: unknown = null;
  try {
    result = await response.json();
  } catch {
    /* empty */
  }
  if (!response.ok) {
    const detail = result && typeof result === "object" && "detail" in result && typeof (result as { detail: unknown }).detail === "string"
      ? (result as { detail: string }).detail
      : "The quote service could not complete this request.";
    throw new QuoteApiError(response.status, detail);
  }
  return result as T;
}

export function apiLineToRecord(line: QuoteLine): QuoteStatusRecord {
  return {
    id: line.id,
    companyId: line.companyId,
    productLine: line.productLine,
    quoteNo: line.quoteNo,
    requestDate: line.requestDate,
    customer: line.customer,
    user: line.user,
    requested: line.requested,
    catalogPartId: line.catalogPartId,
    responseDate: line.responseDate,
    available: line.available,
    estAvailability: line.estAvailability,
    newPartNumber: line.newPartNumber,
    newDescription: line.newDescription,
    newQty: line.newQty,
    factoryPrice: line.factoryPrice,
    customerPrice: line.customerPrice,
    comments: line.comments,
    notifyCustomer: line.notifyCustomer,
    model: line.model,
    serialNumber: line.serialNumber,
    system: line.system,
    figure: line.figure,
    assemblyName: line.assemblyName,
    version: line.version,
  };
}

export function createQuoteApi(csrfToken: string) {
  const pendingKeys = new Map<string, { body: string; key: string }>();
  async function submit<T>(path: string, input: unknown) {
    const body = JSON.stringify(input);
    const pending = pendingKeys.get(path);
    const key = pending?.body === body ? pending.key : idempotencyKey(path);
    pendingKeys.set(path, { body, key });
    const result = await send<T>(path, { method: "POST", csrfToken, body: input, key });
    if (pendingKeys.get(path)?.key === key) pendingKeys.delete(path);
    return result;
  }
  return {
    submitQuote(input: SubmitQuoteInput) {
      return submit<SubmitQuoteResult>("quotes", input);
    },
    listMine() {
      return send<CustomerQuotePage>("quotes/mine", { method: "GET" });
    },
    listAdmin(productLine?: string) {
      const query = productLine ? `?productLine=${encodeURIComponent(productLine)}` : "";
      return send<QuoteLinePage>(`admin/quotes${query}`, { method: "GET" });
    },
    patchLine(id: string, input: PatchQuoteLineInput) {
      return send<QuoteLine>(`admin/quotes/${id}`, {
        method: "PATCH",
        csrfToken,
        body: input,
        key: idempotencyKey("quote-patch"),
      });
    },
    notify(input: NotifyQuoteInput) {
      return send<{ notices: QuoteNotice[] }>("admin/quotes/notify", {
        method: "POST",
        csrfToken,
        body: input,
        key: idempotencyKey("quote-notify"),
      });
    },
    addFactoryLine(input: AddFactoryQuoteLineInput) {
      return send<QuoteLine>("admin/quotes/factory-lines", {
        method: "POST",
        csrfToken,
        body: input,
        key: idempotencyKey("quote-factory"),
      });
    },
    markNoticesSeen() {
      return send<{ ok: true }>("quotes/notices/seen", { method: "POST", csrfToken });
    },
    submitCommerceOrder(input: SubmitCommerceOrderInput) {
      return submit<SubmitCommerceOrderResult>("commerce-orders", input);
    },
  };
}

export type QuoteApi = ReturnType<typeof createQuoteApi>;
