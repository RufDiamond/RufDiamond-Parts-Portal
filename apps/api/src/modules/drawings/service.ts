import { randomUUID } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import type { DrawingAttachment, DrawingDelivery, DrawingUploadInput, DrawingUploadIntent } from "@rufdiamond/contracts";
import type { Database, Transaction } from "../../db/client.js";
import { drawingFile, drawingUploadIntent, figure } from "../../db/schema/index.js";
import { AppError } from "../../plugins/error-handler.js";
import { loadAuthorization, requireCapability } from "../authorization/policy.js";
import { loadGraph, mappingTransaction } from "../diagram-mapping/repository.js";
import { writeAuditLog } from "../audit/repository.js";
import { enqueueOutboxEvent } from "../outbox/repository.js";
import { isPinnedVersion, MAX_DRAWING_BYTES, type DrawingScanner, type DrawingStorage } from "./storage.js";
import { tooLarge, validatePng } from "./validation.js";
import { readDrawingContent } from "./content.js";

type Actor = { userId: string; requestId: string };
const unavailable = () => new AppError("DRAWING_STORAGE_UNAVAILABLE", 503, "Private drawing storage is unavailable. Try again later.");
async function objectOperation<T>(fn: () => Promise<T>): Promise<T> { try { return await fn(); } catch (error) { if (error instanceof AppError) throw error; throw unavailable(); } }
async function authorize(tx: Transaction, actor: Actor, write: boolean) {
  const current = await loadAuthorization(tx, actor.userId);
  requireCapability(current, "publish.draft.view"); requireCapability(current, "catalog.figure.view");
  if (!current.canViewDraft) throw new AppError("FORBIDDEN", 403, "Draft catalogue access is required.");
  if (write) { requireCapability(current, "catalog.drawing.upload"); requireCapability(current, "catalog.figure.edit"); }
  return current;
}
function precondition(actual: number, expected: number) { if (actual !== expected) throw new AppError("STALE_FIGURE", 412, "The figure changed. Reload before attaching a drawing."); }
function attachment(row: typeof drawingFile.$inferSelect, figureId: string, figureVersion: number): DrawingAttachment {
  if (!isPinnedVersion(row.objectVersionId ?? undefined) || row.mediaType !== "image/png" || row.validationStatus !== "valid" || !row.width || !row.height) throw unavailable();
  return { figureId, figureVersion, drawingFileId: row.id, fileVersion: row.fileVersion, filename: row.filename, sha256: row.sha256, width: row.width, height: row.height, bytes: Number(row.bytes) };
}
export function createDrawingService(database: Database, storage: DrawingStorage, scanner: DrawingScanner, now: () => Date = () => new Date()) {
  // Bound aggregate decoder/scanner allocation per API instance. Excess requests retry explicitly.
  let validations = 0;
  async function intent(actor: Actor, figureId: string, expectedVersion: number, input: DrawingUploadInput): Promise<DrawingUploadIntent> {
    if (input.bytes > MAX_DRAWING_BYTES) tooLarge();
    const stored = await mappingTransaction(database, async tx => {
      const scope = await authorize(tx, actor, true); const graph = await loadGraph(tx, scope, figureId, true);
      precondition(graph.figure.version, expectedVersion);
      const id = randomUUID(), createdAt = now();
      const [row] = await tx.insert(drawingUploadIntent).values({ id, actorUserId: actor.userId, figureId, objectKey: `quarantine/${figureId}/${id}.png`, filename: input.filename, expectedBytes: input.bytes, expectedSha256: input.sha256, expectedFigureVersion: expectedVersion, createdAt, expiresAt: new Date(createdAt.getTime() + 900_000) }).returning();
      await writeAuditLog(tx, { actorUserId: actor.userId, companyId: scope.companyId, capability: "catalog.drawing.upload", requestId: actor.requestId }, { objectType: "drawing_upload", objectId: id, after: { figureId, action: "intent_created" } });
      return row;
    });
    const lifetime = Math.floor((stored.expiresAt.getTime() - now().getTime()) / 1000);
    if (lifetime <= 0) throw new AppError("UPLOAD_EXPIRED", 409, "This upload has expired. Create a new upload.");
    const signed = await objectOperation(() => storage.createUpload(stored.objectKey, Math.min(900, lifetime)));
    await mappingTransaction(database, async tx => {
      const scope = await authorize(tx, actor, true); const graph = await loadGraph(tx, scope, figureId, false);
      precondition(graph.figure.version, expectedVersion); pending(stored);
    }, false);
    return { uploadId: stored.id, figureId, figureVersion: expectedVersion, ...signed, expiresAt: stored.expiresAt.toISOString() };
  }
  async function loadIntent(tx: Transaction, actor: Actor, figureId: string, uploadId: string, lock: boolean) {
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(uploadId)) throw new AppError("UPLOAD_NOT_FOUND", 404, "The upload was not found.");
    const query = tx.select().from(drawingUploadIntent).where(and(eq(drawingUploadIntent.id, uploadId), eq(drawingUploadIntent.figureId, figureId), eq(drawingUploadIntent.actorUserId, actor.userId)));
    const [row] = await (lock ? query.for("update") : query);
    if (!row) throw new AppError("UPLOAD_NOT_FOUND", 404, "The upload was not found.");
    return row;
  }
  async function replay(tx: Transaction, row: typeof drawingUploadIntent.$inferSelect) {
    const [drawing] = await tx.select().from(drawingFile).where(eq(drawingFile.id, row.finalizedDrawingId!));
    if (!drawing) throw unavailable();
    return attachment(drawing, row.figureId, row.expectedFigureVersion + 1);
  }
  function pending(row: typeof drawingUploadIntent.$inferSelect) {
    if (row.state !== "pending" || row.expiresAt.getTime() <= now().getTime()) throw new AppError("UPLOAD_EXPIRED", 409, "This upload has expired. Create a new upload.");
  }
  async function finalize(actor: Actor, figureId: string, uploadId: string, expectedVersion: number): Promise<DrawingAttachment> {
    const initial = await mappingTransaction(database, async tx => {
      const scope = await authorize(tx, actor, true); const graph = await loadGraph(tx, scope, figureId, false);
      const row = await loadIntent(tx, actor, figureId, uploadId, false);
      precondition(row.expectedFigureVersion, expectedVersion);
      if (row.state === "finalized") return { row, replay: await replay(tx, row) };
      pending(row); precondition(graph.figure.version, expectedVersion);
      return { row, replay: null };
    }, false);
    if (initial.replay) return initial.replay;
    if (validations >= 2) throw new AppError("DRAWING_VALIDATION_BUSY", 503, "File verification is busy. Try again shortly.");
    validations++;
    let verified: Awaited<ReturnType<typeof validatePng>>; let versionId: string;
    try {
      const object = await objectOperation(() => storage.inspect(initial.row.objectKey));
      if (!isPinnedVersion(object.versionId)) throw unavailable();
      versionId = object.versionId;
      if (object.bytes > MAX_DRAWING_BYTES) tooLarge();
      if (object.bytes !== initial.row.expectedBytes) throw new AppError("DRAWING_SIZE_MISMATCH", 422, "The uploaded file size differs from the upload intent.");
      verified = await objectOperation(() => validatePng(storage.read(initial.row.objectKey, versionId), { bytes: initial.row.expectedBytes, sha256: initial.row.expectedSha256, contentType: object.contentType }, scanner));
    } finally { validations--; }
    return mappingTransaction(database, async tx => {
      const scope = await authorize(tx, actor, true); const graph = await loadGraph(tx, scope, figureId, true);
      const row = await loadIntent(tx, actor, figureId, uploadId, true);
      precondition(row.expectedFigureVersion, expectedVersion);
      if (row.state === "finalized") return replay(tx, row);
      pending(row); precondition(graph.figure.version, expectedVersion);
      const [drawing] = await tx.insert(drawingFile).values({ objectKey: row.objectKey, objectVersionId: versionId, filename: row.filename, mediaType: "image/png", bytes: BigInt(verified.bytes), sha256: verified.sha256, width: verified.width, height: verified.height, fileVersion: (graph.drawing?.fileVersion ?? 0) + 1, validationStatus: "valid", validationReport: { png: "decoded", malware: "clean" }, uploadedByUserId: actor.userId, createdAt: now() }).returning();
      await tx.update(figure).set({ drawingFileId: drawing.id, version: sql`${figure.version} + 1`, updatedAt: now() }).where(and(eq(figure.id, figureId), eq(figure.version, expectedVersion)));
      await tx.update(drawingUploadIntent).set({ state: "finalized", finalizedDrawingId: drawing.id, finalizedAt: now() }).where(eq(drawingUploadIntent.id, uploadId));
      const after = attachment(drawing, figureId, expectedVersion + 1);
      await writeAuditLog(tx, { actorUserId: actor.userId, companyId: scope.companyId, capability: "catalog.drawing.upload", requestId: actor.requestId }, { objectType: "drawing", objectId: figureId, before: { drawingFileId: graph.figure.drawingFileId }, after: { drawingFileId: drawing.id, sha256: drawing.sha256, figureVersion: after.figureVersion } });
      await enqueueOutboxEvent(tx, { eventType: "drawing.attached", aggregateType: "figure", aggregateId: figureId, payload: { figureId, drawingFileId: drawing.id, actorId: actor.userId }, deduplicationKey: `drawing.attached:${uploadId}` });
      return after;
    });
  }
  async function delivery(actor: Actor, figureId: string): Promise<DrawingDelivery> {
    const selected = await mappingTransaction(database, async tx => {
      const scope = await authorize(tx, actor, false); const graph = await loadGraph(tx, scope, figureId, false);
      if (!graph.drawing) throw new AppError("DRAWING_NOT_FOUND", 404, "This figure has no drawing.");
      return { drawing: graph.drawing, metadata: attachment(graph.drawing, figureId, graph.figure.version) };
    }, false);
    const url = await objectOperation(() => storage.createDownload(selected.drawing.objectKey, selected.drawing.objectVersionId!, 300));
    // Sign outside transaction, then verify it is still the current scoped attachment.
    await mappingTransaction(database, async tx => {
      const scope = await authorize(tx, actor, false); const graph = await loadGraph(tx, scope, figureId, false);
      precondition(graph.figure.version, selected.metadata.figureVersion);
      if (graph.figure.drawingFileId !== selected.drawing.id) throw new AppError("DRAWING_CHANGED", 409, "The drawing changed. Reload it.");
    }, false);
    return { ...selected.metadata, url, expiresAt: new Date(now().getTime() + 300_000).toISOString() };
  }
  async function content(actor: Actor, figureId: string, drawingFileId: string, figureVersion: number) {
    const select = () => mappingTransaction(database, async tx => {
      const scope = await authorize(tx, actor, false); const graph = await loadGraph(tx, scope, figureId, false);
      precondition(graph.figure.version, figureVersion);
      if (!graph.drawing || graph.drawing.id !== drawingFileId) throw new AppError("DRAWING_CHANGED", 409, "The drawing changed. Reload it.");
      const metadata = attachment(graph.drawing, figureId, figureVersion);
      return { objectKey: graph.drawing.objectKey, objectVersionId: graph.drawing.objectVersionId!, sha256: metadata.sha256, bytes: metadata.bytes };
    }, false);
    const source = await select();
    const bytes = await readDrawingContent(storage, source);
    await select();
    return bytes;
  }
  return { intent, finalize, delivery, content };
}
