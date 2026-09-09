import { and, eq, inArray, or, sql, type AnyColumn } from "drizzle-orm";
import type { FigureDetail, Part, ReleaseRef } from "@rufdiamond/contracts";
import type { Database, Transaction } from "../../db/client.js";
import * as s from "../../db/schema/index.js";
import { AppError } from "../../plugins/error-handler.js";
import { loadAuthorization, requireCapability } from "../authorization/policy.js";
import { scopeSql } from "../authorization/scope-sql.js";
import { mappingTransaction } from "../diagram-mapping/repository.js";
import { canonicalJsonHash } from "../outbox/idempotency.js";
import { remapDocument } from "../publication/service.js";
import { unavailable, uuid } from "../publication/validation.js";
import { isPinnedVersion, type DrawingStorage } from "../drawings/storage.js";

type Context = { userId: string; requestId: string };
function sameReleaseTargets(release: AnyColumn, foreign: AnyColumn, targets: Array<{ releaseId: string; id: string }>) {
  return targets.length ? or(...targets.map(t => and(eq(release, t.releaseId), eq(foreign, t.id))))! : sql`false`;
}
/** All active pointers and permitted snapshot identities are captured in one read
 * transaction. No working catalogue table participates in customer projection. */
export async function loadCatalog(tx: Transaction, ctx: Context) {
  const authority = await loadAuthorization(tx, ctx.userId); requireCapability(authority, "catalog.figure.view");
  const permitted = await tx.select({ release: s.publicationRelease, model: s.releaseModel, variant: s.releaseVariant }).from(s.publicationRelease)
    .innerJoin(s.releaseModel, eq(s.releaseModel.releaseId, s.publicationRelease.id))
    .innerJoin(s.releaseVariant, and(eq(s.releaseVariant.releaseId, s.publicationRelease.id), eq(s.releaseVariant.modelId, s.releaseModel.id)))
    .where(and(eq(s.publicationRelease.status, "active"), scopeSql(s.releaseModel.productLineId, authority.brandIds), scopeSql(s.releaseVariant.workingId, authority.variantIds)))
    .orderBy(s.publicationRelease.id, s.releaseVariant.id);
  const releaseIds = [...new Set(permitted.map(p => p.release.id))];
  const variants = permitted.map(p => p.variant);
  const figures = await tx.select().from(s.releaseFigure).where(sameReleaseTargets(s.releaseFigure.releaseId, s.releaseFigure.variantId, variants)).orderBy(s.releaseFigure.workingId);
  const rows = await tx.select().from(s.releaseFigurePart).where(sameReleaseTargets(s.releaseFigurePart.releaseId, s.releaseFigurePart.figureId, figures)).orderBy(s.releaseFigurePart.workingId);
  const systems = await tx.select().from(s.releaseSystem).where(inArray(s.releaseSystem.releaseId, releaseIds)).orderBy(s.releaseSystem.workingId);
  const drawings = await tx.select().from(s.releaseDrawing).where(sameReleaseTargets(s.releaseDrawing.releaseId, s.releaseDrawing.id, figures.map(f => ({ releaseId: f.releaseId, id: f.drawingId }))));
  const callouts = await tx.select().from(s.releaseCallout).where(sameReleaseTargets(s.releaseCallout.releaseId, s.releaseCallout.figureId, figures)).orderBy(s.releaseCallout.workingId);
  const mappings = await tx.select().from(s.releaseDiagramMapping).where(sameReleaseTargets(s.releaseDiagramMapping.releaseId, s.releaseDiagramMapping.figureId, figures));
  const parts = await tx.select().from(s.releasePart).where(inArray(s.releasePart.releaseId, releaseIds)).orderBy(s.releasePart.workingId);
  const requires = await tx.select().from(s.releasePartRequires).where(inArray(s.releasePartRequires.releaseId, releaseIds));
  return { authority, permitted, variants, figures, rows, systems, drawings, callouts, mappings, parts, requires };
}
type Catalog = Awaited<ReturnType<typeof loadCatalog>>;
const ref = (p: Catalog["permitted"][number]): ReleaseRef => ({ modelId: p.model.workingId, releaseId: p.release.id, revision: p.release.revision });
const variantDto = (v: Catalog["variants"][number], c: Catalog) => ({ id: v.workingId, modelId: c.permitted.find(p => p.release.id === v.releaseId)!.model.workingId, label: v.label, serialFrom: v.serialFrom, serialTo: v.serialTo, catalogRevision: v.catalogRevision });
const systemDto = (s: Catalog["systems"][number]) => ({ id: s.workingId, name: s.name, sortOrder: s.sortOrder });
function figureDto(f: Catalog["figures"][number], c: Catalog) {
  return { id: f.workingId, variantId: c.variants.find(v => v.releaseId === f.releaseId && v.id === f.variantId)!.workingId, systemId: c.systems.find(s => s.releaseId === f.releaseId && s.id === f.systemId)!.workingId, name: f.name, groupNo: f.groupNo, drawingFileId: c.drawings.find(d => d.releaseId === f.releaseId && d.id === f.drawingId)!.workingId, status: "published" as const };
}
function partDto(p: Catalog["parts"][number], c: Catalog): Part {
  const stable = (id: string) => { const found = c.parts.find(x => x.releaseId === p.releaseId && x.id === id); if (!found) throw new Error("Broken release part identity"); return found.workingId; };
  return { id: p.workingId, releasePartId: p.id, partNumber: p.partNumber, description: p.description, manufacturer: p.manufacturer, currency: p.currency as Part["currency"], status: p.status, supersededByPartId: p.supersededByPartId ? stable(p.supersededByPartId) : null, requires: c.requires.filter(r => r.releaseId === p.releaseId && r.partId === p.id).map(r => ({ partId: stable(r.requiredPartId), qty: r.qty })), ...(c.authority.canViewPrices && p.listPrice !== null ? { listPrice: p.listPrice } : {}) };
}
function figureDetail(c: Catalog, id: string): FigureDetail {
  const f = c.figures.find(f => f.workingId === id); if (!f) unavailable();
  const source = c.permitted.find(p => p.release.id === f.releaseId && p.variant.id === f.variantId)!;
  const drawing = c.drawings.find(d => d.releaseId === f.releaseId && d.id === f.drawingId)!;
  if (!drawing.width || !drawing.height || !["image/png", "image/jpeg"].includes(drawing.mediaType)) throw new AppError("DRAWING_UNAVAILABLE", 503, "Historical drawing metadata needs restoration.");
  const rows = c.rows.filter(r => r.releaseId === f.releaseId && r.figureId === f.id);
  const calls = c.callouts.filter(r => r.releaseId === f.releaseId && r.figureId === f.id);
  const mapping = c.mappings.find(m => m.releaseId === f.releaseId && m.figureId === f.id);
  const stableIds = new Map([[f.id, f.workingId], [drawing.id, drawing.workingId], ...rows.map(r => [r.id, r.workingId] as [string, string]), ...calls.map(r => [r.id, r.workingId] as [string, string])]);
  const stable = (id: string) => { const value = stableIds.get(id); if (!value) throw new Error("Broken same-release mapping identity"); return value; };
  const document = mapping ? remapDocument(mapping.document, stable) : null;
  return {
    release: ref(source), figure: figureDto(f, c), drawing: { id: drawing.workingId, contentUrl: `/api/v1/catalog/figures/${f.workingId}/drawing?releaseId=${f.releaseId}`, filename: drawing.filename, format: drawing.mediaType === "image/png" ? "png" : "jpg", width: drawing.width, height: drawing.height, version: drawing.fileVersion },
    system: systemDto(c.systems.find(s => s.releaseId === f.releaseId && s.id === f.systemId)!), variant: variantDto(source.variant, c),
    mapping: mapping && document ? { document, sourceRevisionId: mapping.sourceRevisionId, sourceDocumentChecksum: mapping.sourceDocumentChecksum, storedDocumentChecksum: canonicalJsonHash(mapping.document), documentChecksum: canonicalJsonHash(document), reviewerId: mapping.reviewedByUserId, reviewedAt: mapping.reviewedAt.toISOString() } : null,
    callouts: calls.map(call => ({ id: call.workingId, figureId: f.workingId, figurePartId: stable(call.figurePartId), number: call.number, x: Number(call.x), y: Number(call.y), maskPath: call.maskPath })),
    rows: rows.map(r => ({ figurePart: { id: r.workingId, figureId: f.workingId, partId: c.parts.find(p => p.releaseId === f.releaseId && p.id === r.partId)!.workingId, qty: r.qty, remarks: r.remarks, serviceable: r.serviceable }, part: partDto(c.parts.find(p => p.releaseId === f.releaseId && p.id === r.partId)!, c), calloutNumbers: [...new Set(calls.filter(call => call.figurePartId === r.id).map(call => call.number))].sort((a, b) => a.localeCompare(b, "en", { numeric: true })) })),
  };
}
export type CatalogQuery = { kind: "product-lines" | "models" | "variants" | "systems" | "figures" | "search" | "usages" | "part-usages" | "usage-index"; id?: string; systemId?: string; q?: string; mode?: "any" | "part" | "description"; cursor?: string; limit?: number };
function matchesPart(p: Catalog["parts"][number], query: CatalogQuery) {
  if (query.kind === "part-usages") return p.workingId === query.id;
  if (query.kind !== "search" && query.kind !== "usages") return true;
  const term = query.q?.trim().toLowerCase(); if (!term) return false;
  const normalize = (value: string) => value.toLowerCase().replace(/[\s._/-]+/g, "");
  const numberMatch = normalize(p.partNumber).includes(normalize(term));
  const descriptionMatch = p.description.toLowerCase().includes(term);
  return query.mode === "part" ? numberMatch : query.mode === "description" ? descriptionMatch : numberMatch || descriptionMatch;
}
export function createCatalogRepository(database: Database, storage: DrawingStorage) {
  async function readPublishedFigure(ctx: Context, figureId: string) { return mappingTransaction(database, async tx => figureDetail(await loadCatalog(tx, ctx), figureId), false); }
  async function list(ctx: Context, query: CatalogQuery) {
    return mappingTransaction(database, async tx => {
      const c = await loadCatalog(tx, ctx);
      requireCapability(c.authority, ["product-lines", "models", "variants", "systems"].includes(query.kind) ? "catalog.model.view" : ["search", "usages", "part-usages", "usage-index"].includes(query.kind) ? "parts.record.view" : "catalog.figure.view");
      const entries: Array<{ key: string; item: unknown; release: ReleaseRef }> = [];
      const push = (key: string, item: unknown, releaseId: string) => entries.push({ key, item, release: ref(c.permitted.find(p => p.release.id === releaseId)!) });
      if (query.kind === "product-lines" || query.kind === "models") {
        const seen = new Set<string>();
        for (const p of c.permitted) {
          const m = p.model; const id = query.kind === "product-lines" ? m.productLineId : m.workingId; if (seen.has(id)) continue; seen.add(id);
          push(id, query.kind === "product-lines" ? { id, name: m.productLineName, manufacturer: m.manufacturer, country: m.country, isDistributed: m.isDistributed } : { id, productLineId: m.productLineId, name: m.name, status: m.status, catalogState: "live", updatedAt: p.release.publishedAt!.toISOString() }, p.release.id);
        }
      } else if (query.kind === "variants") {
        const permitted = c.permitted.filter(p => p.model.workingId === query.id); if (!permitted.length) unavailable();
        for (const p of permitted) push(p.variant.workingId, variantDto(p.variant, c), p.release.id);
      } else if (query.kind === "systems" || query.kind === "figures") {
        const variant = c.variants.find(v => v.workingId === query.id); if (!variant) unavailable();
        if (query.kind === "systems") for (const s of c.systems.filter(s => s.releaseId === variant.releaseId)) push(s.workingId, systemDto(s), s.releaseId);
        else {
          const system = c.systems.find(s => s.releaseId === variant.releaseId && s.workingId === query.systemId); if (!system) unavailable();
          for (const f of c.figures.filter(f => f.releaseId === variant.releaseId && f.variantId === variant.id && f.systemId === system.id)) push(f.workingId, figureDto(f, c), f.releaseId);
        }
      } else {
        const matched = new Set<string>();
        const orderedRows = [...c.rows].sort((a, b) => {
          const left = c.figures.find(f => f.releaseId === a.releaseId && f.id === a.figureId)!;
          const right = c.figures.find(f => f.releaseId === b.releaseId && f.id === b.figureId)!;
          return left.sortOrder - right.sortOrder || (left.groupNo ?? "").localeCompare(right.groupNo ?? "", "en", { numeric: true }) || left.workingId.localeCompare(right.workingId) || a.workingId.localeCompare(b.workingId);
        });
        for (const row of orderedRows) {
          const f = c.figures.find(f => f.releaseId === row.releaseId && f.id === row.figureId)!;
          const p = c.parts.find(p => p.releaseId === row.releaseId && p.id === row.partId)!;
          if (!matchesPart(p, query)) continue;
          if (query.kind === "search") { if (matched.has(`${p.releaseId}:${p.id}`)) continue; matched.add(`${p.releaseId}:${p.id}`); push(`${p.workingId}:${p.releaseId}`, partDto(p, c), p.releaseId); }
          else {
            const scope = c.permitted.find(x => x.release.id === f.releaseId && x.variant.id === f.variantId)!;
            const system = c.systems.find(s => s.releaseId === f.releaseId && s.id === f.systemId)!;
            const summary = { figureId: f.workingId, groupNo: f.groupNo, assemblyName: f.name, systemName: system.name, modelName: scope.model.name, serial: scope.variant.label };
            if (query.kind === "usage-index") {
              if (matched.has(p.workingId)) continue; matched.add(p.workingId);
              push(p.workingId, { partId: p.workingId, summary: { ...summary, productLineName: scope.model.productLineName } }, p.releaseId);
            } else push(`${p.workingId}:${f.workingId}:${row.workingId}`, { part: partDto(p, c), ...summary }, p.releaseId);
          }
        }
        // Required/superseding parts may legitimately have no depicted row. Only
        // traverse dependencies reachable from permitted rows, never every part
        // in a release that also contains an unauthorized variant.
        if (query.kind !== "usage-index") {
          const reachable = new Set<string>(); const pending = c.rows.map(r => ({ releaseId: r.releaseId, id: r.partId }));
          while (pending.length) {
            const item = pending.shift()!; const key = `${item.releaseId}:${item.id}`; if (reachable.has(key)) continue; reachable.add(key);
            const p = c.parts.find(p => p.releaseId === item.releaseId && p.id === item.id)!;
            if (p.supersededByPartId) pending.push({ releaseId: p.releaseId, id: p.supersededByPartId });
            for (const r of c.requires.filter(r => r.releaseId === p.releaseId && r.partId === p.id)) pending.push({ releaseId: r.releaseId, id: r.requiredPartId });
            if (c.rows.some(r => r.releaseId === p.releaseId && r.partId === p.id) || !matchesPart(p, query)) continue;
            push(`${p.workingId}:${p.releaseId}`, query.kind === "search" ? partDto(p, c) : { part: partDto(p, c), figureId: null, groupNo: null, assemblyName: null, systemName: null, modelName: null, serial: null }, p.releaseId);
          }
        }
        if (query.kind === "part-usages" && !entries.length) unavailable();
      }
      entries.sort((a, b) => a.key.localeCompare(b.key));
      const signature = canonicalJsonHash({ releases: c.permitted.map(ref), scope: c.authority.scopeVersion, mode: query.mode ?? "any" });
      let after = "";
      if (query.cursor) {
        try { const cursor = JSON.parse(Buffer.from(query.cursor, "base64url").toString()); if (cursor.signature !== signature || typeof cursor.key !== "string" || cursor.query !== canonicalJsonHash({ kind: query.kind, id: query.id ?? null, systemId: query.systemId ?? null, q: query.q ?? null })) throw new Error(); after = cursor.key; }
        catch { throw new AppError("CATALOG_CURSOR_STALE", 409, "Catalogue or scope changed. Restart pagination."); }
      }
      const limit = query.limit ?? 50; const available = entries.filter(e => e.key > after); const selected = available.slice(0, limit);
      return { items: selected.map(e => e.item), nextCursor: available.length > limit ? Buffer.from(JSON.stringify({ signature, key: selected.at(-1)!.key, query: canonicalJsonHash({ kind: query.kind, id: query.id ?? null, systemId: query.systemId ?? null, q: query.q ?? null }) })).toString("base64url") : null, releases: [...new Map(selected.map(e => [e.release.releaseId, e.release])).values()] };
    }, false);
  }
  async function drawing(ctx: Context, figureId: string, releaseId: string) {
    const select = () => mappingTransaction(database, async tx => {
      const c = await loadCatalog(tx, ctx); const f = c.figures.find(f => f.workingId === figureId && f.releaseId === releaseId);
      if (!f) {
        const current = c.figures.find(f => f.workingId === figureId);
        if (current && uuid.test(releaseId)) {
          const [historical] = await tx.select({ id: s.releaseFigure.id }).from(s.releaseFigure)
            .innerJoin(s.publicationRelease, eq(s.publicationRelease.id, s.releaseFigure.releaseId))
            .where(and(eq(s.releaseFigure.releaseId, releaseId), eq(s.releaseFigure.workingId, figureId), eq(s.publicationRelease.modelId, c.permitted.find(p => p.release.id === current.releaseId)!.release.modelId), eq(s.publicationRelease.status, "inactive")));
          if (historical) throw new AppError("RELEASE_CHANGED", 409, "The active release changed. Reload the complete figure.");
        }
        unavailable();
      }
      const d = c.drawings.find(d => d.releaseId === releaseId && d.id === f.drawingId)!;
      if (!isPinnedVersion(d.objectVersionId ?? undefined)) throw new AppError("DRAWING_VERSION_UNAVAILABLE", 503, "Historical immutable object identity requires restoration.");
      return d;
    }, false);
    const source = await select();
    let url: string;
    try { url = await storage.createDownload(source.objectKey, source.objectVersionId!, 300); }
    catch { throw new AppError("DRAWING_UNAVAILABLE", 503, "Drawing delivery is temporarily unavailable."); }
    // Signing may block on an external provider; fresh policy and active pointer
    // must still permit delivery when the URL is issued.
    await select(); return url;
  }
  return { readPublishedFigure, list, drawing };
}
