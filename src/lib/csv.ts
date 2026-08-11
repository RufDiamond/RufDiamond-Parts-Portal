import type { OrderLine } from "@/types/catalog";

function quote(value: string | number): string {
  return `"${String(value).replace(/"/g, '""')}"`;
}

/**
 * Build the request CSV.
 *
 * One row per request line: part number, description, quantity, unit price and
 * line total. Unit price and line total are given twice — at list, and net of
 * the account's discount — so the header is never ambiguous about which figure
 * a purchaser is reading.
 */
export function buildRequestCsv(
  lines: OrderLine[],
  discountRate: number,
): string {
  const factor = 1 - Math.min(1, Math.max(0, discountRate));

  const rows: (string | number)[][] = [
    [
      "Part number",
      "Description",
      "Qty",
      "Unit price CAD (list)",
      "Unit price CAD (net)",
      "Line total CAD (list)",
      "Line total CAD (net)",
    ],
    ...lines.map((line) => [
      line.partNumberSnapshot,
      line.descriptionSnapshot,
      line.qty,
      line.unitPriceSnapshot.toFixed(2),
      (line.unitPriceSnapshot * factor).toFixed(2),
      line.lineTotal.toFixed(2),
      (line.lineTotal * factor).toFixed(2),
    ]),
  ];

  return rows.map((row) => row.map(quote).join(",")).join("\n");
}

export interface CsvOptions {
  lines: OrderLine[];
  /** Fraction, e.g. 0.1 for 10% off list. */
  discountRate: number;
  filename: string;
}

/** Hand the CSV to the browser as a download. */
export function downloadRequestCsv({
  lines,
  discountRate,
  filename,
}: CsvOptions): void {
  if (typeof window === "undefined") return;

  const csv = buildRequestCsv(lines, discountRate);
  const url = URL.createObjectURL(
    new Blob([csv], { type: "text/csv;charset=utf-8" }),
  );

  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `${filename}.csv`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();

  URL.revokeObjectURL(url);
}
