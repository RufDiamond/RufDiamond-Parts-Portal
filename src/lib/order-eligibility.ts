import { isFatTruckPreviewPartId } from "@/lib/fat-truck-preview";
import type { OrderLine } from "@/types/catalog";
import type { RequestPartInput } from "@/state/RequestContext";

export function hasAvailablePrice(price: number | string | undefined) {
  return price !== undefined && Number.isFinite(Number(price)) && Number(price) > 0;
}

export function canOrderRequestPart(input: RequestPartInput, hosted: boolean): boolean {
  const { part, quoteLineId, releaseId } = input;
  if (!hasAvailablePrice(part.listPrice)) return false;
  if (!hosted) return true;
  return Boolean(quoteLineId || (
    !isFatTruckPreviewPartId(part.id) && part.releasePartId && (releaseId || part.contributingReleases?.length)
  ));
}

export function canOrderRequestLine(line: OrderLine, hosted: boolean): boolean {
  if (!hasAvailablePrice(line.unitPriceSnapshot)) return false;
  if (!hosted) return true;
  return Boolean(line.quoteLineId || (
    !isFatTruckPreviewPartId(line.partId) && line.releaseId && line.releasePartId
  ));
}

export const quoteRequiredHref = "/request?quoteRequired=1";
