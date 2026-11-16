import { compareCatalogueModels, naturalCatalogueOrder } from "@/lib/fat-truck-models";
import type { PartUsageRow } from "@/types/catalog";

export const usageColumns = [
  ["no", "No."], ["partNo", "Part no."], ["description", "Description"],
  ["price", "Unit price"], ["model", "Model"], ["serial", "Serial"],
  ["system", "System"], ["page", "Page"], ["assembly", "Assembly name"],
] as const;
export type UsageSortKey = (typeof usageColumns)[number][0];
type UsageResult = { row: PartUsageRow; index: number };
type Direction = "ascending" | "descending";

export function sortPartUsages(rows: UsageResult[], by: UsageSortKey, direction: Direction): UsageResult[] {
  const factor = direction === "ascending" ? 1 : -1;
  const compareText = (left?: string | null, right?: string | null, compare = naturalCatalogueOrder.compare, order = factor) =>
    !left ? (right ? 1 : 0) : !right ? -1 : order * compare(left, right);
  return [...rows].sort((a, b) => {
    const x = a.row;
    const y = b.row;
    const defaults = () => compareText(x.modelName, y.modelName, compareCatalogueModels, 1)
      || compareText(x.serial, y.serial, naturalCatalogueOrder.compare, 1)
      || compareText(x.groupNo, y.groupNo, naturalCatalogueOrder.compare, 1)
      || a.index - b.index;
    switch (by) {
      case "no": return factor * (a.index - b.index);
      case "price": {
        const left = x.part.listPrice;
        const right = y.part.listPrice;
        return (left === undefined ? (right === undefined ? 0 : 1) : right === undefined ? -1 : factor * (Number(left) - Number(right))) || defaults();
      }
      case "partNo": return compareText(x.part.partNumber, y.part.partNumber) || defaults();
      case "description": return compareText(x.part.description, y.part.description) || defaults();
      case "model": return compareText(x.modelName, y.modelName, compareCatalogueModels) || defaults();
      case "serial": return compareText(x.serial, y.serial) || defaults();
      case "system": return compareText(x.systemName, y.systemName) || defaults();
      case "page": return compareText(x.groupNo, y.groupNo) || defaults();
      case "assembly": return compareText(x.assemblyName, y.assemblyName) || defaults();
    }
  });
}
