import { randomUUID } from "node:crypto";
import { and, desc, eq, sql } from "drizzle-orm";
import type { ActivateReleaseInput, DiagramMappingDocument, PublishInput, PublishResult } from "@rufdiamond/contracts";
import type { Database, Transaction } from "../../db/client.js";
import * as s from "../../db/schema/index.js";
import { AppError } from "../../plugins/error-handler.js";
import { writeAuditLog, type MutationContext } from "../audit/repository.js";
import { mappingTransaction } from "../diagram-mapping/repository.js";
import { canonicalJsonHash, withIdempotency } from "../outbox/idempotency.js";
import { enqueueOutboxEvent } from "../outbox/repository.js";
import { assertScope, modelScope, publisher, requireIntactSnapshot, unavailable, uuid, validateModel, type PublicationGraph } from "./validation.js";

type Context = { userId: string; requestId: string };
const jsonValue = (value: unknown) => JSON.parse(JSON.stringify(value, (_key, nested) => typeof nested === "bigint" ? nested.toString() : nested));
function conflict(): never { throw new AppError("PUBLICATION_CONFLICT", 409, "Publication state changed. Reload before publishing or activating."); }
function validateKey(key: string) { if (!key?.trim() || key.length > 255) throw new AppError("INVALID_IDEMPOTENCY_KEY", 400, "Supply an idempotency key of 1 to 255 characters."); }
export function remapDocument(document: DiagramMappingDocument, map: (id: string) => string): DiagramMappingDocument {
  return { ...structuredClone(document), figureId: map(document.figureId), drawingFileId: map(document.drawingFileId), occurrences: document.occurrences.map(o => ({ ...structuredClone(o), calloutId: map(o.calloutId), figurePartId: o.figurePartId === null ? null : map(o.figurePartId) })) };
}
async function snapshot(tx: Transaction, graph: PublicationGraph, releaseId: string) {
  const ids = new Map<string, string>();
  for (const source of [graph.model, ...graph.variants, ...graph.systems.map(x => x.system), ...graph.figures, ...graph.parts, ...graph.drawings, ...graph.allRows, ...graph.graphs.flatMap(x => x.graph.occurrences)]) ids.set(source.id, randomUUID());
  const local = (id: string) => { const result = ids.get(id); if (!result) throw new Error("Unresolved snapshot identity"); return result; };
  for (const d of graph.drawings) {
    await tx.insert(s.releaseDrawing).values({ releaseId, id: local(d.id), workingId: d.id, objectKey: d.objectKey, filename: d.filename, mediaType: d.mediaType, bytes: d.bytes, sha256: d.sha256, width: d.width, height: d.height, pages: d.pages, fileVersion: d.fileVersion, objectVersionId: d.objectVersionId, previewObjectKey: d.previewObjectKey, previewObjectVersionId: d.previewObjectVersionId, previewSha256: d.previewSha256, previewBytes: d.previewBytes, previewWidth: d.previewWidth, previewHeight: d.previewHeight });
  }
  const m = graph.model;
  await tx.insert(s.releaseModel).values({ releaseId, id: local(m.id), workingId: m.id, productLineId: graph.line.id, productLineName: graph.line.name, manufacturer: graph.line.manufacturer, country: graph.line.country, isDistributed: graph.line.isDistributed, name: m.name, status: m.status, sortOrder: m.sortOrder, photoDrawingId: m.photoFileId ? local(m.photoFileId) : null });
  for (const v of graph.variants) await tx.insert(s.releaseVariant).values({ releaseId, id: local(v.id), workingId: v.id, modelId: local(m.id), label: v.label, serialFrom: v.serialFrom, serialTo: v.serialTo, catalogRevision: v.catalogRevision });
  for (const { system, enabled } of graph.systems) if (enabled) await tx.insert(s.releaseSystem).values({ releaseId, id: local(system.id), workingId: system.id, modelId: local(m.id), name: system.name, sortOrder: system.sortOrder });
  // One statement permits self-table supersession references regardless of order.
  if (graph.parts.length) await tx.insert(s.releasePart).values(graph.parts.map(p => ({ releaseId, id: local(p.id), workingId: p.id, partNumber: p.partNumber, description: p.description, manufacturer: p.manufacturer, listPrice: p.listPrice, currency: p.currency, status: p.status, supersededByPartId: p.supersededByPartId ? local(p.supersededByPartId) : null })));
  for (const r of graph.relationships) await tx.insert(s.releasePartRequires).values({ releaseId, partId: local(r.partId), requiredPartId: local(r.requiredPartId), qty: r.qty });
  for (const f of graph.figures) await tx.insert(s.releaseFigure).values({ releaseId, id: local(f.id), workingId: f.id, variantId: local(f.variantId), systemId: local(f.systemId), drawingId: local(f.drawingFileId!), name: f.name, groupNo: f.groupNo, sourceKey: f.sourceKey, sortOrder: f.sortOrder });
  for (const r of graph.allRows) await tx.insert(s.releaseFigurePart).values({ releaseId, id: local(r.id), workingId: r.id, figureId: local(r.figureId), partId: local(r.partId), sourceRowKey: r.sourceRowKey, qty: r.qty, remarks: r.remarks, serviceable: r.serviceable, effectiveFrom: r.effectiveFrom, effectiveTo: r.effectiveTo });
  for (const { graph: source, revision } of graph.graphs) {
    for (const c of source.occurrences) {
      const rect = revision.document.occurrences.find(o => o.calloutId === c.id)!.labelRegion!;
      await tx.insert(s.releaseCallout).values({ releaseId, id: local(c.id), workingId: c.id, figureId: local(c.figureId), figurePartId: local(c.figurePartId!), sourceKey: c.sourceKey, number: c.number, x: ((rect.x + rect.width / 2) / revision.document.imageWidth * 100).toFixed(4), y: ((rect.y + rect.height / 2) / revision.document.imageHeight * 100).toFixed(4), maskPath: c.maskPath });
    }
    await tx.insert(s.releaseDiagramMapping).values({ releaseId, figureId: local(source.figure.id), drawingId: local(source.drawing!.id), document: remapDocument(revision.document, local), sourceRevisionId: revision.revisionId, sourceDocumentChecksum: revision.checksum, reviewedByUserId: revision.approval!.reviewerId, reviewedAt: new Date(revision.approval!.reviewedAt) });
  }
}
async function activate(tx: Transaction, ctx: MutationContext, modelId: string, releaseId: string, version: number, action: string, now: Date) {
  const [previous] = await tx.select().from(s.publicationRelease).where(and(eq(s.publicationRelease.modelId, modelId), eq(s.publicationRelease.status, "active")));
  const [changed] = await tx.update(s.model).set({ publicationVersion: sql`${s.model.publicationVersion} + 1` }).where(and(eq(s.model.id, modelId), eq(s.model.publicationVersion, version))).returning({ id: s.model.id });
  if (!changed) conflict();
  if (previous) await tx.update(s.publicationRelease).set({ status: "inactive" }).where(eq(s.publicationRelease.id, previous.id));
  await tx.update(s.publicationRelease).set({ status: "active", activatedAt: now }).where(eq(s.publicationRelease.id, releaseId));
  await writeAuditLog(tx, ctx, { objectType: "publication_release", objectId: releaseId, before: { activeReleaseId: previous?.id ?? null }, after: { action, activeReleaseId: releaseId, publicationVersion: version + 1 } });
  await enqueueOutboxEvent(tx, { eventType: `publication.${action}`, aggregateType: "publication_release", aggregateId: releaseId, payload: { modelId, releaseId, actorId: ctx.actorUserId }, deduplicationKey: `publication:${modelId}:${version + 1}` });
}
export function createPublicationService(database: Database, now: () => Date = () => new Date()) {
  async function publishModel(ctx: Context, input: PublishInput, key: string): Promise<PublishResult> {
    validateKey(key);
    return mappingTransaction(database, async tx => {
      const current = await publisher(tx, ctx.userId, "publish.execute");
      const scoped = await modelScope(tx, current, input.modelId);
      const mutation: MutationContext = { actorUserId: current.userId, companyId: current.companyId, capability: "publish.execute", requestId: ctx.requestId };
      const response = await withIdempotency(tx, mutation, "publication.publish", key, canonicalJsonHash(input), async () => {
        if (scoped.model.version !== input.expectedWorkingVersion || scoped.model.publicationVersion !== input.expectedPublicationVersion) conflict();
        const graph = await validateModel(tx, current, input.modelId);
        if (graph.issues.length) throw new AppError("PUBLICATION_BLOCKED", 422, "The model has publication blockers.", graph.issues);
        const [latest] = await tx.select().from(s.publicationRelease).where(eq(s.publicationRelease.modelId, input.modelId)).orderBy(desc(s.publicationRelease.revision)).limit(1);
        // Source checksum describes source values, not randomized release-local IDs.
        const checksum = canonicalJsonHash(jsonValue({ line: graph.line, model: { ...graph.model, publicationVersion: undefined }, variants: graph.variants, systems: graph.systems, figures: graph.figures, parts: graph.parts, relationships: graph.relationships, drawings: graph.drawings, rows: graph.allRows, mappings: graph.graphs.map(x => ({ revision: x.revision, occurrences: x.graph.occurrences })) }));
        const releaseId = randomUUID(); const revision = (latest?.revision ?? 0) + 1;
        await tx.insert(s.publicationRelease).values({ id: releaseId, modelId: input.modelId, revision, summary: input.summary, createdByUserId: current.userId, sourceChecksum: checksum });
        await snapshot(tx, graph, releaseId);
        await tx.update(s.publicationRelease).set({ status: "inactive", publishedAt: now() }).where(eq(s.publicationRelease.id, releaseId));
        await activate(tx, mutation, input.modelId, releaseId, input.expectedPublicationVersion, "published", now());
        return { status: 201, body: { modelId: input.modelId, releaseId, revision, checksum } satisfies PublishResult };
      });
      return response.body as PublishResult;
    });
  }
  async function activateRelease(ctx: Context, releaseId: string, input: ActivateReleaseInput, key: string, rollback = false): Promise<PublishResult> {
    validateKey(key);
    return mappingTransaction(database, async tx => {
      const current = await publisher(tx, ctx.userId, rollback ? "publish.rollback" : "publish.execute");
      if (!uuid.test(releaseId)) unavailable();
      const [release] = await tx.select().from(s.publicationRelease).where(eq(s.publicationRelease.id, releaseId));
      if (!release || !release.publishedAt) unavailable();
      const scope = await modelScope(tx, current, release.modelId);
      const [snapshotModel] = await tx.select().from(s.releaseModel).where(eq(s.releaseModel.releaseId, releaseId));
      const snapshotVariants = await tx.select().from(s.releaseVariant).where(eq(s.releaseVariant.releaseId, releaseId));
      if (!snapshotModel || !snapshotVariants.length) unavailable();
      assertScope(current, snapshotModel.productLineId, snapshotVariants.map(v => v.workingId));
      const mutation: MutationContext = { actorUserId: current.userId, companyId: current.companyId, capability: rollback ? "publish.rollback" : "publish.execute", requestId: ctx.requestId };
      const result = await withIdempotency(tx, mutation, rollback ? "publication.rollback" : "publication.activate", key, canonicalJsonHash({ releaseId, input }), async () => {
        const [active] = await tx.select().from(s.publicationRelease).where(and(eq(s.publicationRelease.modelId, release.modelId), eq(s.publicationRelease.status, "active")));
        if (scope.model.publicationVersion !== input.expectedPublicationVersion || (active?.id ?? null) !== input.expectedActiveReleaseId || release.status !== "inactive" || (rollback && (!active || release.revision >= active.revision))) conflict();
        await requireIntactSnapshot(tx, releaseId);
        await activate(tx, mutation, release.modelId, releaseId, input.expectedPublicationVersion, rollback ? "rolled_back" : "activated", now());
        return { status: 200, body: { modelId: release.modelId, releaseId, revision: release.revision, checksum: release.sourceChecksum } satisfies PublishResult };
      });
      return result.body as PublishResult;
    });
  }
  async function queue(ctx: Context, query: { cursor?: string; limit?: number } = {}) {
    return mappingTransaction(database, async tx => {
      const current = await publisher(tx, ctx.userId, "publish.draft.view");
      const models = await tx.select().from(s.model).orderBy(s.model.id);
      const items = [];
      for (const model of models) {
        let graph: PublicationGraph;
        try { graph = await validateModel(tx, current, model.id, false); } catch (error) { if (error instanceof AppError && error.status === 404) continue; throw error; }
        const [active] = await tx.select().from(s.publicationRelease).where(and(eq(s.publicationRelease.modelId, model.id), eq(s.publicationRelease.status, "active")));
        items.push({ modelId: model.id, name: model.name, workingVersion: model.version, publicationVersion: model.publicationVersion, activeReleaseId: active?.id ?? null, blockers: graph.issues });
      }
      const signature = canonicalJsonHash({ scope: current.scopeVersion, items });
      let after = "";
      if (query.cursor) {
        try { const cursor = JSON.parse(Buffer.from(query.cursor, "base64url").toString()); if (cursor.signature !== signature || typeof cursor.after !== "string") throw new Error(); after = cursor.after; }
        catch { throw new AppError("PUBLICATION_CURSOR_STALE", 409, "Publication queue changed. Restart pagination."); }
      }
      const available = items.filter(item => item.modelId > after); const limit = query.limit ?? 50; const selected = available.slice(0, limit);
      return { items: selected, nextCursor: available.length > limit ? Buffer.from(JSON.stringify({ signature, after: selected.at(-1)!.modelId })).toString("base64url") : null };
    }, false);
  }
  return { publishModel, activateRelease, queue };
}
