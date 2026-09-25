import type { OrderLine, Part } from "@/types/catalog";

/**
 * What may go on a quote request.
 *
 * The rule is the client's, and it is about price rather than stock:
 *
 *   - A part with NO price is quotable. RUF Diamond has to ask the factory
 *     what it costs, which is exactly what a quote request is for.
 *   - A part with a visible price is NOT quotable. The price is already on
 *     screen, so there is nothing to quote — the customer orders it.
 *
 * The export carries a missing price as 0, not as null: 263 of the 536 parts
 * read `0.00`, and `formatPrice` prints that verbatim because the client asked
 * for the spreadsheet's own figures. So "no price" is a zero here, and this is
 * the single place that decision is written down.
 */
export function isQuotable(part: Pick<Part, "listPrice">): boolean {
  return part.listPrice === 0;
}

/** The same test for a line already on the request list. */
export function isQuotableLine(line: Pick<OrderLine, "unitPriceSnapshot">): boolean {
  return line.unitPriceSnapshot === 0;
}

/**
 * A priced part is subject to the factory's own changes between the catalogue
 * import and the order, so every screen that shows a price says so.
 */
export const PRICE_DISCLAIMER =
  "Prices are subject to change without notice.";

/** How the blocked-item dialog names one offender — slide 42. */
export function blockedMessage(partNumber: string, description: string): string {
  return `Item ${partNumber} — ${description} cannot be added to this quote request. Please remove it from your selection to continue.`;
}
