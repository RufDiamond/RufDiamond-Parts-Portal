import type { Currency } from "@/types/catalog";

const formatters = new Map<Currency, Intl.NumberFormat>();

/**
 * Money as bare figures — "1,076.92" — with the currency named in the column
 * head rather than repeated on every row.
 */
export function formatAmount(value: number | string | undefined, currency: Currency): string {
  if (value === undefined) return "";
  if (typeof value === "string") {
    if (!/^\d+\.\d{2}$/.test(value)) return "";
    const [whole, cents] = value.split(".");
    return `${whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",")}.${cents}`;
  }
  if (!Number.isFinite(value)) return "";
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
 * Display an authorized source price. Missing/forbidden prices stay absent;
 * an actual source zero remains 0.00 and receives the separate quote notice.
 */
export function formatPrice(value: number | string | undefined, currency: Currency): string {
  return formatAmount(value, currency);
}

export function isZeroPrice(value: number | string | undefined): boolean {
  return value === 0 || value === "0.00";
}

/** "FIG 1.1" */
export function formatFigureRef(groupNo: string): string {
  return `FIG ${groupNo}`;
}
