import type { OrderLine } from "@/types/catalog";

function quote(value: string | number): string {
  return `"${String(value).replace(/"/g, '""')}"`;
}

export interface CsvOptions {
  lines: OrderLine[];
  /** Fraction, e.g. 0.1 for 10% off list. */
  discountRate: number;
  filename: string;
}

/**
 * Export the request as CSV. Columns follow the reference exactly, so the
 * file a purchaser receives matches what the design promised.
 */
export function downloadRequestCsv({
  lines,
  discountRate,
  filename,
}: CsvOptions): void {
  if (typeof window === "undefined") return;

  const factor = 1 - discountRate;
  const rows: (string | number)[][] = [
    [
      "Part number",
      "Description",
      "Qty",
      "List price CAD",
      "Net price CAD",
      "Line total CAD",
    ],
    ...lines.map((line) => [
      line.partNumberSnapshot,
      line.descriptionSnapshot,
      line.qty,
      line.unitPriceSnapshot.toFixed(2),
      (line.unitPriceSnapshot * factor).toFixed(2),
      (line.unitPriceSnapshot * line.qty * factor).toFixed(2),
    ]),
  ];

  const csv = rows.map((row) => row.map(quote).join(",")).join("\n");
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));

  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `${filename}.csv`;
  anchor.click();

  URL.revokeObjectURL(url);
}
