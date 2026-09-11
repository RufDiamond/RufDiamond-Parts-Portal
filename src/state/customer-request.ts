import { PageSchema, PartUsageRowSchema, type ReleaseRef } from "@rufdiamond/contracts";
import { Value } from "@sinclair/typebox/value";
import type { OrderLine, Part } from "@/types/catalog";

export type RequestIdentity = { partId: string; releasePartId: string; qty: number };
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function readRequestIdentities(key: string): RequestIdentity[] {
  try {
    const value: unknown = JSON.parse(sessionStorage.getItem(key) ?? "[]");
    if (!Array.isArray(value) || value.length > 200) return [];
    return value.filter((row): row is RequestIdentity => typeof row === "object" && row !== null && uuid.test(row.partId) && typeof row.releasePartId === "string" && Number.isFinite(row.qty) && row.qty > 0 && row.qty <= 100000);
  } catch { return []; }
}
export function writeRequestIdentities(key: string, lines: OrderLine[]) {
  try { sessionStorage.setItem(key, JSON.stringify(lines.filter(line => line.releasePartId).map(line => ({ partId: line.partId, releasePartId: line.releasePartId, qty: line.qty })))); } catch { /* Storage is optional. */ }
}

/** Resolve identities against current authorized snapshots before showing any stored line. */
export async function revalidateRequestIdentities(identities: RequestIdentity[]): Promise<{ part: Part; qty: number }[]> {
  const result: { part: Part; qty: number }[] = [];
  const releases = new Map<string, ReleaseRef>();
  for (const identity of identities) {
    if (!uuid.test(identity.partId)) throw new Error("Request contains an unavailable catalogue identity.");
    let cursor: string | null = null;
    let found: Part | undefined;
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
      if (found || !value.nextCursor) break;
      if (cursors.has(value.nextCursor)) throw new Error("Request catalogue data is unavailable.");
      cursors.add(value.nextCursor); cursor = value.nextCursor;
    }
    if (!found) throw new Error("A saved part's release is no longer available. Add it again from the current catalogue.");
    result.push({ part: found, qty: identity.qty });
  }
  return result;
}
