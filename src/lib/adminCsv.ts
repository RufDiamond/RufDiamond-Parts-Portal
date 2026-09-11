import type { AdminOrder, AdminPartRow } from "@/types/admin";

function quote(value: string | number): string {
  return `"${String(value).replace(/"/g, '""')}"`;
}

function toCsv(rows: (string | number)[][]): string {
  return rows.map((row) => row.map(quote).join(",")).join("\n");
}

/** Hand a built CSV to the browser as a download. */
export function downloadCsv(filename: string, csv: string): void {
  if (typeof window === "undefined") return;

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

/**
 * Parts export. Columns match the import panel's stated contract, so a file
 * exported here can be edited and imported back.
 */
export function buildPartsCsv(rows: AdminPartRow[]): string {
  return toCsv([
    [
      "Part number",
      "Description",
      "System",
      "Figure",
      "Qty",
      "Unit price CAD",
      "Remarks",
      "Superseded by",
      "Replaces",
      "Also requires",
    ],
    ...rows.map((row) => [
      row.part.partNumber,
      row.part.description,
      row.systems.join(" · "),
      row.figures.map((groupNo) => `FIG ${groupNo}`).join(" · "),
      row.totalQty,
      row.part.listPrice === undefined ? "" : typeof row.part.listPrice === "string" ? row.part.listPrice : row.part.listPrice.toFixed(2),
      row.remarks.join(" · "),
      row.supersededBy?.partNumber ?? "",
      row.supersedes?.partNumber ?? "",
      row.requires
        .map((ref) => `${ref.partNumber}${ref.qty ? ` (${ref.qty}x)` : ""}`)
        .join(" · "),
    ]),
  ]);
}

/** Orders export, for handing to accounting. */
export function buildOrdersCsv(
  orders: AdminOrder[],
  stateLabel: (state: AdminOrder["state"]) => string,
): string {
  return toCsv([
    [
      "Order",
      "Customer",
      "Product line",
      "Machine",
      "Serial range",
      "Lines",
      "Value CAD",
      "Discount tier",
      "Status",
    ],
    ...orders.map((order) => [
      order.reference,
      order.customer,
      order.productLine,
      order.model,
      order.serialRange,
      order.lines,
      order.valueCad.toFixed(2),
      order.discountTier,
      stateLabel(order.state),
    ]),
  ]);
}
