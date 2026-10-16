import type { CustomerQuoteLine, QuoteStatusRecord } from "@/types/quotes";

/** p59: prices run 30 calendar days from the date the request was submitted. */
export const PRICE_VALIDITY_DAYS = 30;

function addDays(isoDate: string, days: number): string {
  const date = new Date(`${isoDate}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function times(unitPrice: string, qty: number): string {
  return (Math.round(Number(unitPrice) * 100 * qty) / 100).toFixed(2);
}

/**
 * The customer's view of the administrator's records.
 *
 * Only the account's own lines, newest request first (p59). Factory Price is
 * not copied — it does not exist on the result type at all. Nothing the
 * factory said is shown until the administrator has notified the customer.
 *
 * `today` is an ISO date, passed in so expiry is decided in one place.
 */
export function toCustomerQuoteLines(
  records: QuoteStatusRecord[],
  companyId: string,
  today: string,
): CustomerQuoteLine[] {
  return records
    .filter((record) => record.companyId === companyId)
    .map((record, index) => ({ record, index }))
    // Newest request first; lines of one request keep the order they were entered.
    .sort((a, b) => b.record.requestDate.localeCompare(a.record.requestDate) || a.index - b.index)
    .map(({ record }) => {
      const priceValidUntil = addDays(record.requestDate, PRICE_VALIDITY_DAYS);
      const expired = today > priceValidUntil;
      const released = record.notifyCustomer;
      const qty = record.newQty ?? record.requested?.qty ?? null;
      const partNumber = record.newPartNumber ?? record.requested?.partNumber ?? null;
      const description = record.newDescription ?? record.requested?.description ?? null;
      const canOrder =
        released &&
        !expired &&
        // Any availability can be ordered: what the factory lacks goes on back
        // order and ships when it arrives (14 Oct).
        record.available !== null &&
        record.customerPrice !== null &&
        partNumber !== null &&
        description !== null &&
        qty !== null &&
        qty > 0;

      return {
        id: record.id,
        quoteNo: record.quoteNo,
        requestDate: record.requestDate,
        customer: record.customer,
        user: record.user,
        partNumber: record.requested?.partNumber ?? null,
        description: record.requested?.description ?? null,
        qty: record.requested?.qty ?? null,
        response: released
          ? {
              available: record.available,
              estAvailability: record.estAvailability,
              newPartNumber: record.newPartNumber,
              newDescription: record.newDescription,
              newQty: record.newQty,
              unitPrice: record.customerPrice,
              totalPrice:
                record.customerPrice !== null && qty !== null ? times(record.customerPrice, qty) : null,
              comments: record.comments,
            }
          : null,
        priceValidUntil,
        expired,
        requote:
          released && expired && partNumber !== null && description !== null && qty !== null
            ? {
                productLine: record.productLine,
                partNumber,
                description,
                qty,
                catalogPartId: partNumber === record.requested?.partNumber ? record.catalogPartId : null,
                model: record.model,
                serialNumber: record.serialNumber,
                system: record.system,
                figure: record.figure,
                assemblyName: record.assemblyName,
              }
            : null,
        orderable: canOrder
          ? {
              partNumber: partNumber!,
              description: description!,
              qty: qty!,
              unitPrice: record.customerPrice!,
              // A replacement number is not the catalogue part that was asked for.
              catalogPartId:
                record.newPartNumber && record.newPartNumber !== record.requested?.partNumber
                  ? null
                  : record.catalogPartId,
            }
          : null,
      };
    });
}

/**
 * The server's lines for the account with the browser-held quote records laid
 * over them (the local demonstration's quote service), newest request first.
 */
export function mergeCustomerLines(
  serverLines: CustomerQuoteLine[],
  stored: QuoteStatusRecord[],
  companyId: string,
  today: string,
): CustomerQuoteLine[] {
  const replaced = new Set(stored.map((record) => record.id));
  return [
    ...serverLines.filter((line) => !replaced.has(line.id)),
    ...toCustomerQuoteLines(stored, companyId, today),
  ].sort((a, b) =>
    b.requestDate.localeCompare(a.requestDate) || a.quoteNo.localeCompare(b.quoteNo) || a.id.localeCompare(b.id));
}

/* ── The administrator's side (p58) ─────────────────────────────────────── */

/** Whole days from the request to the factory's answer, or null before it arrives. */
export function responseDays(record: QuoteStatusRecord): number | null {
  if (!record.responseDate) return null;
  const from = Date.parse(`${record.requestDate}T00:00:00Z`);
  const to = Date.parse(`${record.responseDate}T00:00:00Z`);
  return Math.round((to - from) / 86_400_000);
}

/** The quantity a line is priced on: what the factory quoted, else what was asked. */
export function quotedQty(record: QuoteStatusRecord): number | null {
  return record.newQty ?? record.requested?.qty ?? null;
}

/** Customer price × quoted quantity, as the Total Price column shows it. */
export function adminTotal(record: QuoteStatusRecord): string | null {
  const qty = quotedQty(record);
  return record.customerPrice !== null && qty !== null ? times(record.customerPrice, qty) : null;
}

/**
 * What still has to be filled in before a line can be released to the
 * customer. Empty when it is ready. A back-ordered line is still released —
 * it needs a price like any other, because the customer can order it (14 Oct).
 */
export function missingBeforeNotify(record: QuoteStatusRecord): string[] {
  const missing: string[] = [];
  if (record.available === null) missing.push("Available");
  if (record.customerPrice === null) missing.push("Unit Price");
  if (quotedQty(record) === null) missing.push("New Qty");
  if (record.requested === null && (!record.newPartNumber || !record.newDescription)) {
    missing.push("New Part No. and New Description");
  }
  return missing;
}

/**
 * A line the factory put on its quotation that the customer never asked for
 * (p58, the row under row 3). It belongs to the same request as `base`.
 */
export function factoryAddedLine(base: QuoteStatusRecord, existingIds: ReadonlySet<string>): QuoteStatusRecord {
  let n = 1;
  while (existingIds.has(`${base.quoteNo}-F${n}`)) n += 1;
  return {
    ...base,
    id: `${base.quoteNo}-F${n}`,
    requested: null,
    catalogPartId: null,
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
  };
}

/** Every customer's lines, newest request first; one request's lines keep their order. */
export function sortAdminRecords(records: QuoteStatusRecord[]): QuoteStatusRecord[] {
  return records
    .map((record, index) => ({ record, index }))
    .sort((a, b) =>
      b.record.requestDate.localeCompare(a.record.requestDate) ||
      b.record.quoteNo.localeCompare(a.record.quoteNo) ||
      a.index - b.index)
    .map(({ record }) => record);
}
