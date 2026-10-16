/** Server copy of the admin "ready to notify" rule. A back-ordered line still needs a price. */

export interface NotifyReadinessInput {
  available: string | null;
  customerPrice: string | null;
  newQty: number | null;
  requestedQty: number | null;
  requested: unknown;
  newPartNumber: string | null;
  newDescription: string | null;
}

export function missingBeforeNotify(row: NotifyReadinessInput): string[] {
  const missing: string[] = [];
  if (row.available == null) missing.push("Available");
  if (row.customerPrice == null) missing.push("Unit Price");
  const qty = row.newQty ?? row.requestedQty;
  if (qty == null) missing.push("New Qty");
  if (row.requested == null && (!row.newPartNumber || !row.newDescription)) {
    missing.push("New Part No. and New Description");
  }
  return missing;
}
