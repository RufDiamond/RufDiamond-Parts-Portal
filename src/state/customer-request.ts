import "@/lib/contract-formats";
import { isFatTruckPreviewPartId } from "@/lib/fat-truck-preview";
import { CustomerQuotePageSchema, PageSchema, PartUsageRowSchema, PartSchema, type ReleaseRef } from "@rufdiamond/contracts";
import { Type } from "@sinclair/typebox";
import { Value } from "@sinclair/typebox/value";
import type { OrderLine, Part } from "@/types/catalog";
import type { RequestPartInput } from "./RequestContext";

export type RequestIdentity = { partId: string; releasePartId: string; qty: number } | { quoteLineId: string; qty: number } | { previewPartId: string; qty: number };
const previewPartSchema = Type.Omit(PartSchema, ["releasePartId"]);
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function readRequestIdentities(key: string): RequestIdentity[] {
  try {
    const value: unknown = JSON.parse(sessionStorage.getItem(key) ?? "[]");
    if (!Array.isArray(value) || value.length > 200) return [];
    return value.filter((row): row is RequestIdentity => {
      if (!row || typeof row !== "object" || !Number.isSafeInteger(row.qty) || row.qty < 1 || row.qty > 100000) return false;
      return ("quoteLineId" in row && uuid.test(row.quoteLineId))
        || ("previewPartId" in row && isFatTruckPreviewPartId(row.previewPartId))
        || (uuid.test(row.partId) && typeof row.releasePartId === "string");
    });
  } catch { return []; }
}
export function writeRequestIdentities(key: string, lines: OrderLine[]) {
  const identities = lines.flatMap<RequestIdentity>(line => {
    const { qty, quoteLineId, partId, releasePartId } = line;
    if (quoteLineId) return [{ quoteLineId, qty }];
    if (isFatTruckPreviewPartId(partId)) return [{ previewPartId: partId, qty }];
    return releasePartId ? [{ partId, releasePartId, qty }] : [];
  });
  try { sessionStorage.setItem(key, JSON.stringify(identities)); } catch { /* Storage is optional. */ }
}

async function loadCurrentQuotes() {
  const response = await fetch("/api/v1/quotes/mine", { cache: "no-store", credentials: "same-origin" });
  if (!response.ok) throw new Error("Quote data is unavailable.");
  const value: unknown = await response.json();
  if (!Value.Check(CustomerQuotePageSchema, value)) throw new Error("Quote data is unavailable.");
  return value.items;
}

/** Resolve identities against current authorized snapshots before showing any stored line. */
export async function revalidateRequestIdentities(identities: RequestIdentity[]): Promise<RequestPartInput[]> {
  const result: RequestPartInput[] = [];
  let quotes: Awaited<ReturnType<typeof loadCurrentQuotes>> | undefined;
  const releases = new Map<string, ReleaseRef>();
  for (const identity of identities) {
    if ("previewPartId" in identity) {
      if (!isFatTruckPreviewPartId(identity.previewPartId)) throw new Error("Preview part is unavailable.");
      const response = await fetch(`/api/fat-truck-preview/parts/${encodeURIComponent(identity.previewPartId)}`, { cache: "no-store", credentials: "same-origin" });
      if (!response.ok) throw new Error("Preview part is unavailable.");
      const part: unknown = await response.json();
      if (!Value.Check(previewPartSchema, part) || part.id !== identity.previewPartId) throw new Error("Preview part is unavailable.");
      result.push({ part, qty: identity.qty });
      continue;
    }
    if ("quoteLineId" in identity) {
      quotes ??= await loadCurrentQuotes();
      const line = quotes.find(row => row.id === identity.quoteLineId);
      if (!line || line.expired || !line.response?.available || !line.response.unitPrice
        || !line.partNumber || !line.description || !line.qty || identity.qty > line.qty) {
        throw new Error("A saved quote is no longer orderable. Reload Quote Status.");
      }
      result.push({
        quoteLineId: line.id, quoteNo: line.quoteNo, qty: identity.qty,
        part: { id: `quote:${line.id}`, partNumber: line.partNumber, description: line.description,
          listPrice: line.response.unitPrice, currency: "CAD", manufacturer: null,
          status: "active", supersededByPartId: null, requires: [] },
      });
      continue;
    }
    if (!uuid.test(identity.partId)) throw new Error("Request contains an unavailable catalogue identity.");
    let cursor: string | null = null;
    let found: Part | undefined;
    let releaseId: string | undefined;
    const cursors = new Set<string>();
    for (let page = 0; page < 100; page++) {
      const response = await fetch(`/api/v1/catalog/parts/${identity.partId}/usages?limit=100${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`, { cache: "no-store", credentials: "same-origin" });
      if (!response.ok) throw new Error("Catalogue access changed. Reload the request.");
      const value: unknown = await response.json();
      if (!Value.Check(PageSchema(PartUsageRowSchema), value)) throw new Error("Request catalogue data is unavailable.");
      if (value.items.length && !value.releases.length) throw new Error("Request catalogue data is unavailable.");
      for (const ref of value.releases) {
        const previous = releases.get(ref.modelId);
        if (previous && (previous.releaseId !== ref.releaseId || previous.revision !== ref.revision)) throw new Error("Catalogue release changed. Reload the request.");
        releases.set(ref.modelId, ref);
      }
      found = value.items.find(row => row.part.id === identity.partId && row.part.releasePartId === identity.releasePartId)?.part;
      if (found) {
        // A single release on the matching page establishes the row's owner.
        if (value.releases.length === 1) releaseId = value.releases[0].releaseId;
        break;
      }
      if (!value.nextCursor) break;
      if (cursors.has(value.nextCursor)) throw new Error("Request catalogue data is unavailable.");
      cursors.add(value.nextCursor); cursor = value.nextCursor;
    }
    if (!found) throw new Error("A saved part's release is no longer available. Add it again from the current catalogue.");
    result.push({ part: found, qty: identity.qty, releaseId });
  }
  return result;
}
