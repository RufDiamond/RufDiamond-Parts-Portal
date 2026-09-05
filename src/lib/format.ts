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
 * Money for display, or an em dash where no price was supplied.
 *
 * 263 of the 536 parts in the FT3 Wagon export carry `UNIT PRICE (CAD)` of 0 —
 * mostly fasteners, but also the hydraulic motor. Zero is not a real price in
 * this catalogue, so it means "not supplied" and must never be rendered as
 * `0.00`: a customer reading that orders a motor expecting it free.
 */
export function formatPrice(value: number, currency: Currency): string {
  return value === 0 ? "—" : formatAmount(value, currency);
}

/** "FIG 1.1" */
export function formatFigureRef(groupNo: string): string {
  return `FIG ${groupNo}`;
}
