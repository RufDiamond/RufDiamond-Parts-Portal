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

/** "FIG 1.1" */
export function formatFigureRef(groupNo: string): string {
  return `FIG ${groupNo}`;
}
