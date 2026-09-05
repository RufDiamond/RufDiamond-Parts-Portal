import type { Currency } from "@/types/catalog";

const formatters = new Map<Currency, Intl.NumberFormat>();

/**
 * Money as bare figures — "1,076.92" — with the currency named in the column
 * head rather than repeated on every row.
 */
export function formatAmount(value: number, currency: Currency): string {
  let formatter = formatters.get(currency);
  if (!formatter) {
    formatter = new Intl.NumberFormat(currency === "USD" ? "en-US" : "en-CA", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
    formatters.set(currency, formatter);
  }
  return formatter.format(value);
}

/**
 * Money for display.
 *
 * 263 of the 536 parts in the FT3 Wagon export carry `UNIT PRICE (CAD)` of 0.
 * The client's decision is to print what the export holds, so a missing price
 * shows as `0.00` exactly as it does in the spreadsheet and in the design deck.
 * See `clients.md` — filling those prices is an open item with RUFDiamond.
 */
export function formatPrice(value: number, currency: Currency): string {
  return formatAmount(value, currency);
}

/** "FIG 1.1" */
export function formatFigureRef(groupNo: string): string {
  return `FIG ${groupNo}`;
}
