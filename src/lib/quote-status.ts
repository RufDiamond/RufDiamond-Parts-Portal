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
        (record.available === "yes" || record.available === "partial") &&
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
