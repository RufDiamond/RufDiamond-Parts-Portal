import { and, desc, eq, inArray, lt, sql } from "drizzle-orm";
import type { MappingHistory, MappingRevision, DiagramMappingDocument } from "@rufdiamond/contracts";
import type { Database, Transaction } from "../../db/client.js";
import { callout, diagramMapping, diagramMappingApproval, diagramMappingRevision, drawingFile, figure, figurePart, model, part, variant } from "../../db/schema/index.js";
import { AppError } from "../../plugins/error-handler.js";
import type { AuthorizationContext } from "../authorization/types.js";

function notFound(): never { throw new AppError("FIGURE_NOT_FOUND", 404, "The requested figure was not found."); }
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Transactions lock model before figure/head. Serializable isolation also detects graph phantoms. */
export async function loadGraph(tx: Transaction, ctx: AuthorizationContext, figureId: string, lock: boolean) {
  if (!uuid.test(figureId)) notFound();
  const query = tx.select({ figure, model, variant }).from(figure).innerJoin(variant, eq(figure.variantId, variant.id)).innerJoin(model, eq(variant.modelId, model.id)).where(and(
    eq(figure.id, figureId),
    ctx.brandIds === "all" ? undefined : inArray(model.productLineId, [...ctx.brandIds]),
    ctx.variantIds === "all" ? undefined : inArray(figure.variantId, [...ctx.variantIds]),
  ));
  const [scope] = await query;
  if (!scope) notFound();
  if (lock) {
    await tx.select({ id: model.id }).from(model).where(eq(model.id, scope.model.id)).for("update");
    await tx.select({ id: figure.id }).from(figure).where(eq(figure.id, figureId)).for("update");
    await tx.select({ id: variant.id }).from(variant).where(eq(variant.id, scope.variant.id)).for("share");
  }
  const headQuery = tx.select().from(diagramMapping).where(eq(diagramMapping.figureId, figureId));
  const [head] = await (lock ? headQuery.for("update") : headQuery);
  // New figure creation must create its coordination head atomically.
  if (!head) throw new AppError("MAPPING_UNAVAILABLE", 409, "Mapping is not initialized for this figure.");
  const drawingQuery = tx.select().from(drawingFile).where(eq(drawingFile.id, scope.figure.drawingFileId ?? "00000000-0000-0000-0000-000000000000"));
  const [drawing] = await (lock ? drawingQuery.for("share") : drawingQuery);
  const rowQuery = tx.select({ row: figurePart, part }).from(figurePart).innerJoin(part, eq(figurePart.partId, part.id)).where(eq(figurePart.figureId, figureId)).orderBy(figurePart.id);
  const rows = await (lock ? rowQuery.for("share") : rowQuery);
  const occurrenceQuery = tx.select().from(callout).where(eq(callout.figureId, figureId)).orderBy(callout.id);
  const occurrences = await (lock ? occurrenceQuery.for("update") : occurrenceQuery);
  return { ...scope, head, drawing: drawing ?? null, rows, occurrences };
}
export type MappingGraph = Awaited<ReturnType<typeof loadGraph>>;

export async function listRevisions(tx: Transaction, graph: MappingGraph, before?: number): Promise<MappingHistory> {
  const rows = await tx.select({ id: diagramMappingRevision.id, revision: diagramMappingRevision.revision, checksum: diagramMappingRevision.documentChecksum, createdAt: diagramMappingRevision.createdAt, reviewer: diagramMappingApproval.reviewedByUserId, reviewedAt: diagramMappingApproval.reviewedAt })
    .from(diagramMappingRevision).leftJoin(diagramMappingApproval, eq(diagramMappingApproval.revisionId, diagramMappingRevision.id))
    .where(and(eq(diagramMappingRevision.headId, graph.head.id), before === undefined ? undefined : lt(diagramMappingRevision.revision, before)))
    .orderBy(desc(diagramMappingRevision.revision)).limit(21);
  return { items: rows.slice(0, 20).map(r => ({ revisionId: r.id, revisionNumber: r.revision, checksum: r.checksum, createdAt: r.createdAt.toISOString(), approval: r.reviewer && r.reviewedAt ? { reviewerId: r.reviewer, reviewedAt: r.reviewedAt.toISOString() } : null })), nextBefore: rows.length > 20 ? rows[19].revision : null };
}
export async function historicalRevision(tx: Transaction, graph: MappingGraph, revisionId: string): Promise<MappingRevision> {
  if (!uuid.test(revisionId)) throw new AppError("REVISION_NOT_FOUND", 404, "The requested revision was not found.");
  const [row] = await tx.select().from(diagramMappingRevision).where(and(eq(diagramMappingRevision.headId, graph.head.id), eq(diagramMappingRevision.id, revisionId)));
  if (!row) throw new AppError("REVISION_NOT_FOUND", 404, "The requested revision was not found.");
  const [approval] = await tx.select().from(diagramMappingApproval).where(eq(diagramMappingApproval.revisionId, row.id));
  return { revisionId: row.id, version: row.revision + 1, checksum: row.documentChecksum, document: row.document, approval: approval ? { reviewerId: approval.reviewedByUserId, reviewedAt: approval.reviewedAt.toISOString() } : null };
}

export async function currentRevision(tx: Transaction, graph: MappingGraph): Promise<MappingRevision | null> {
  if (!graph.head.currentRevisionId) return null;
  const [row] = await tx.select().from(diagramMappingRevision).where(and(eq(diagramMappingRevision.id, graph.head.currentRevisionId), eq(diagramMappingRevision.headId, graph.head.id)));
  if (!row) throw new Error("Mapping head references missing revision");
  const [approval] = await tx.select().from(diagramMappingApproval).where(eq(diagramMappingApproval.revisionId, row.id));
  return { revisionId: row.id, version: graph.head.version, checksum: row.documentChecksum, document: row.document, approval: approval ? { reviewerId: approval.reviewedByUserId, reviewedAt: approval.reviewedAt.toISOString() } : null };
}

export async function updateAssociations(tx: Transaction, graph: MappingGraph, document: DiagramMappingDocument) {
  for (const occurrence of document.occurrences) {
    const stored = graph.occurrences.find(item => item.id === occurrence.calloutId)!;
    if (stored.figurePartId === occurrence.figurePartId) continue;
    await tx.update(callout).set({ figurePartId: occurrence.figurePartId, version: sql`${callout.version} + 1` }).where(and(eq(callout.id, stored.id), eq(callout.figureId, graph.figure.id)));
    stored.figurePartId = occurrence.figurePartId;
    stored.version += 1;
  }
}

export async function insertRevision(tx: Transaction, graph: MappingGraph, document: DiagramMappingDocument, checksum: string, actorId: string, now: Date): Promise<MappingRevision> {
  const [revision] = await tx.insert(diagramMappingRevision).values({ headId: graph.head.id, revision: graph.head.version, document, drawingFileId: document.drawingFileId, drawingSha256: document.drawingSha256, imageWidth: document.imageWidth, imageHeight: document.imageHeight, catalogueBindingSha256: document.catalogueBindingSha256, documentChecksum: checksum, createdByUserId: actorId, createdAt: now }).returning({ id: diagramMappingRevision.id });
  const [head] = await tx.update(diagramMapping).set({ currentRevisionId: revision.id, version: sql`${diagramMapping.version} + 1` }).where(and(eq(diagramMapping.id, graph.head.id), eq(diagramMapping.version, graph.head.version))).returning({ version: diagramMapping.version });
  if (!head) throw new AppError("STALE_MAPPING", 412, "The mapping changed. Reload before saving.");
  return { revisionId: revision.id, version: head.version, checksum, document, approval: null };
}

export async function insertApproval(tx: Transaction, revision: MappingRevision, actorId: string, now: Date): Promise<MappingRevision> {
  if (revision.approval) return revision;
  await tx.insert(diagramMappingApproval).values({ revisionId: revision.revisionId, documentChecksum: revision.checksum, reviewedByUserId: actorId, reviewedAt: now });
  return { ...revision, approval: { reviewerId: actorId, reviewedAt: now.toISOString() } };
}

function databaseErrorCode(error: unknown): string | undefined {
  if (!(error instanceof Error)) return undefined;
  const code = "code" in error && typeof error.code === "string" ? error.code : undefined;
  return code ?? (error.cause ? databaseErrorCode(error.cause) : undefined);
}
export async function mappingTransaction<T>(database: Database, fn: (tx: Transaction) => Promise<T>, write = true): Promise<T> {
  for (let attempt = 0; ; attempt += 1) {
    try { return await database.transaction(fn, { isolationLevel: write ? "serializable" : "repeatable read", ...(write ? {} : { accessMode: "read only" as const }) }); }
    catch (error) {
      const code = databaseErrorCode(error);
      if ((code === "40001" || code === "40P01") && attempt < 2) continue;
      if (code && ["40001", "40P01", "55P03", "57014", "57P01", "57P02", "57P03", "53300", "08000", "08003", "08006", "ECONNREFUSED", "ECONNRESET", "ETIMEDOUT"].includes(code)) throw new AppError("MAPPING_TEMPORARILY_UNAVAILABLE", 503, "Mapping is temporarily unavailable. Try again.");
      throw error;
    }
  }
}
