"use client";

import { useMemo, useSyncExternalStore } from "react";
import type { PartUsageSummary } from "@/types/catalog";
import type { CustomerQuoteLine, QuoteStatusRecord } from "@/types/quotes";
import type { RequestConfirmation } from "./RequestContext";

/**
 * The local demonstration's quote service.
 *
 * There is no quote service behind the API yet, so the quote requests a
 * customer submits, and what the RUF Diamond administrator enters against
 * them, are kept in this browser. Only records that were added or edited are
 * stored; the sample records come from the server. When the real service
 * exists, these functions are what it replaces.
 */

const RECORDS_KEY = "rdpp:quote-records:v1";
const NOTICES_KEY = "rdpp:quote-notices:v1";
const CHANGE_EVENT = "rdpp:quote-store";

/** One "your quote is ready" message: one per quote, however many lines it releases. */
export interface QuoteNotice {
  id: string;
  companyId: string;
  customer: string;
  quoteNo: string;
  /** Lines released with this notice. */
  lineIds: string[];
  /** ISO timestamp. */
  at: string;
  seen: boolean;
}

function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function writeJson(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Storage full or blocked: the demonstration carries on without saving.
  }
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

function subscribe(onChange: () => void) {
  window.addEventListener("storage", onChange);
  window.addEventListener(CHANGE_EVENT, onChange);
  return () => {
    window.removeEventListener("storage", onChange);
    window.removeEventListener(CHANGE_EVENT, onChange);
  };
}

const rawOf = (key: string) => () => {
  try {
    return localStorage.getItem(key) ?? "";
  } catch {
    return "";
  }
};

/** Stored records by id. Empty during server rendering. */
export function useStoredQuoteRecords(): Record<string, QuoteStatusRecord> {
  const raw = useSyncExternalStore(subscribe, rawOf(RECORDS_KEY), () => "");
  return useMemo(() => {
    try {
      return raw ? (JSON.parse(raw) as Record<string, QuoteStatusRecord>) : {};
    } catch {
      return {};
    }
  }, [raw]);
}

export function useQuoteNotices(): QuoteNotice[] {
  const raw = useSyncExternalStore(subscribe, rawOf(NOTICES_KEY), () => "");
  return useMemo(() => {
    try {
      return raw ? (JSON.parse(raw) as QuoteNotice[]) : [];
    } catch {
      return [];
    }
  }, [raw]);
}

export function saveQuoteRecords(records: QuoteStatusRecord[]) {
  const stored = readJson<Record<string, QuoteStatusRecord>>(RECORDS_KEY, {});
  for (const record of records) stored[record.id] = record;
  writeJson(RECORDS_KEY, stored);
}

/** The sample records with every stored change applied, and stored additions after them. */
export function mergeQuoteRecords(
  seed: QuoteStatusRecord[],
  stored: Record<string, QuoteStatusRecord>,
): QuoteStatusRecord[] {
  const seedIds = new Set(seed.map((record) => record.id));
  return [
    ...seed.map((record) => stored[record.id] ?? record),
    ...Object.values(stored).filter((record) => !seedIds.has(record.id)),
  ];
}

/**
 * Release lines to their customers: one notice per quote, never one per line
 * — the supervisor's concern on 14 Oct about five parts sending five emails.
 */
export function notifyCustomers(records: QuoteStatusRecord[], today: string): QuoteNotice[] {
  const released = records.map((record) => ({
    ...record,
    notifyCustomer: true,
    responseDate: record.responseDate ?? today,
  }));
  saveQuoteRecords(released);

  const byQuote = new Map<string, QuoteStatusRecord[]>();
  for (const record of released) {
    const key = `${record.companyId}|${record.quoteNo}`;
    byQuote.set(key, [...(byQuote.get(key) ?? []), record]);
  }
  const at = new Date().toISOString();
  const notices: QuoteNotice[] = [...byQuote.values()].map((group) => ({
    id: `${group[0].quoteNo}-${at}`,
    companyId: group[0].companyId,
    customer: group[0].customer,
    quoteNo: group[0].quoteNo,
    lineIds: group.map((record) => record.id),
    at,
    seen: false,
  }));
  writeJson(NOTICES_KEY, [...readJson<QuoteNotice[]>(NOTICES_KEY, []), ...notices]);
  return notices;
}

/** The customer has opened Quote Status: their notices are no longer new. */
export function markNoticesSeen(companyId: string) {
  const notices = readJson<QuoteNotice[]>(NOTICES_KEY, []);
  if (!notices.some((notice) => notice.companyId === companyId && !notice.seen)) return;
  writeJson(NOTICES_KEY, notices.map((notice) => notice.companyId === companyId ? { ...notice, seen: true } : notice));
}

/** "2026-10-14" in Ontario, where the parts are quoted from. */
export function ontarioToday(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "America/Toronto" });
}

interface Requested {
  partId: string | null;
  partNumber: string;
  description: string;
  qty: number;
}

/** New, unanswered quote lines for one request, carrying the catalogue context where known. */
export function buildQuoteRecords({ quoteNo, companyId, customer, productLine, requested, usage }: {
  quoteNo: string;
  companyId: string;
  customer: string;
  productLine: string | null;
  requested: Requested[];
  usage: Record<string, PartUsageSummary>;
}): QuoteStatusRecord[] {
  const today = ontarioToday();
  return requested.map((line, index) => {
    const place = line.partId ? usage[line.partId] : undefined;
    return {
      id: `${quoteNo}-${String(index + 1).padStart(2, "0")}`,
      companyId,
      productLine: productLine === "IronHorse" || productLine === "Agilis" ? productLine : "Fat Truck",
      quoteNo,
      requestDate: today,
      customer,
      user: "—",
      requested: { partNumber: line.partNumber, description: line.description, qty: line.qty },
      catalogPartId: line.partId,
      responseDate: null,
      available: null,
      estAvailability: null,
      newPartNumber: null,
      newDescription: null,
      newQty: null,
      factoryPrice: null,
      customerPrice: null,
      comments: "",
      notifyCustomer: false,
      model: place?.modelName?.toUpperCase() ?? "—",
      serialNumber: place?.serial ?? "—",
      system: place?.systemName?.toUpperCase() ?? "—",
      figure: place?.groupNo ? `FIG ${place.groupNo}` : "—",
      assemblyName: place?.assemblyName?.toUpperCase() ?? "—",
    };
  });
}

/** Register a submitted quote request so it appears in Quote Status, waiting for the factory (p54). */
export function registerQuoteRequest(
  confirmation: RequestConfirmation,
  companyId: string,
  usage: Record<string, PartUsageSummary>,
) {
  saveQuoteRecords(buildQuoteRecords({
    quoteNo: confirmation.reference,
    companyId,
    customer: confirmation.companyName ?? "—",
    productLine: confirmation.details.brand,
    requested: confirmation.lines.map((line) => ({
      partId: line.quoteNo ? null : line.partId,
      partNumber: line.partNumberSnapshot,
      description: line.descriptionSnapshot,
      qty: line.qty,
    })),
    usage,
  }));
}

/** A fresh quote request for an expired line, waiting for the factory again (14 Oct). */
export function requestNewQuote(line: CustomerQuoteLine, quoteNo: string, companyId: string): QuoteStatusRecord {
  const ask = line.requote!;
  const [record] = buildQuoteRecords({
    quoteNo,
    companyId,
    customer: line.customer,
    productLine: ask.productLine,
    requested: [{ partId: ask.catalogPartId, partNumber: ask.partNumber, description: ask.description, qty: ask.qty }],
    usage: {},
  });
  const fresh = {
    ...record,
    user: line.user,
    model: ask.model,
    serialNumber: ask.serialNumber,
    system: ask.system,
    figure: ask.figure,
    assemblyName: ask.assemblyName,
  };
  saveQuoteRecords([fresh]);
  return fresh;
}
