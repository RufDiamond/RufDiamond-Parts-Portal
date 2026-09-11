import type { MappingApproveInput, MappingEditorDocument, MappingHistoricalDocument, MappingHistory, MappingRevision, MappingSaveInput, MappingWriteContext } from "@rufdiamond/contracts";
import type { Database, Transaction } from "../../db/client.js";
import { AppError } from "../../plugins/error-handler.js";
import { writeAuditLog, type MutationContext } from "../audit/repository.js";
import { loadAuthorization, requireCapability } from "../authorization/policy.js";
import { canonicalJsonHash, withIdempotency } from "../outbox/idempotency.js";
import { enqueueOutboxEvent } from "../outbox/repository.js";
import { catalogueBindingSha256, initialDocument, requireCurrentSource, sourceConflict, sourceContext, validateDocument } from "./binding.js";
import { currentRevision, historicalRevision, insertApproval, insertRevision, listRevisions, loadGraph, mappingTransaction, updateAssociations } from "./repository.js";

export type MappingContext = { userId: string; requestId: string };
type StoredMutation = { revision: MappingRevision; requiresMap: boolean };

async function authorize(tx: Transaction, ctx: MappingContext, operation: "read" | "save" | "approve") {
  const current = await loadAuthorization(tx, ctx.userId);
  requireCapability(current, "publish.draft.view");
  requireCapability(current, "catalog.figure.view");
  if (!current.canViewDraft) throw new AppError("FORBIDDEN", 403, "Draft catalogue access is required.");
  if (operation !== "read") requireCapability(current, "catalog.callout.manage");
  if (operation === "approve") {
    requireCapability(current, "catalog.callout.map");
    requireCapability(current, "publish.execute");
  }
  return current;
}
async function recordMutation(tx: Transaction, ctx: MutationContext, figureId: string, before: MappingRevision | null, after: MappingRevision, action: "saved" | "approved") {
  const reference = (revision: MappingRevision | null) => revision ? { revisionId: revision.revisionId, checksum: revision.checksum } : null;
  await writeAuditLog(tx, ctx, { objectType: "diagram_mapping", objectId: figureId, before: reference(before), after: { ...reference(after), action } });
  await enqueueOutboxEvent(tx, { eventType: `diagram_mapping.${action}`, aggregateType: "diagram_mapping", aggregateId: figureId, payload: { figureId, ...reference(after), actorId: ctx.actorUserId }, deduplicationKey: `diagram_mapping.${action}:${after.revisionId}` });
}

export function createMappingService(database: Database, now: () => Date = () => new Date()) {
  async function history(ctx: MappingContext, figureId: string, before?: number): Promise<MappingHistory> {
    return mappingTransaction(database, async tx => {
      const current = await authorize(tx, ctx, "read");
      const graph = await loadGraph(tx, current, figureId, false);
      return listRevisions(tx, graph, before);
    }, false);
  }
  async function historical(ctx: MappingContext, figureId: string, revisionId: string): Promise<MappingHistoricalDocument> {
    return mappingTransaction(database, async tx => {
      const current = await authorize(tx, ctx, "read");
      const graph = await loadGraph(tx, current, figureId, false);
      const revision = await historicalRevision(tx, graph, revisionId);
      return { revision, source: sourceContext(graph), sourceConflict: sourceConflict(graph, revision.document), currentVersion: graph.head.version };
    }, false);
  }
  async function read(ctx: MappingContext, figureId: string): Promise<MappingEditorDocument> {
    return mappingTransaction(database, async tx => {
      const current = await authorize(tx, ctx, "read");
      const graph = await loadGraph(tx, current, figureId, false);
      const revision = await currentRevision(tx, graph);
      const source = sourceContext(graph);
      if (!revision) return { version: 1, revision: null, document: initialDocument(graph), source, sourceConflict: false };
      return { version: graph.head.version, revision, document: revision.document, source, sourceConflict: sourceConflict(graph, revision.document) };
    }, false);
  }
  async function mutate(ctx: MappingContext, write: MappingWriteContext, input: MappingSaveInput | MappingApproveInput, operation: "save" | "approve"): Promise<MappingRevision> {
    return mappingTransaction(database, async tx => {
      // Reload inside each serializable attempt, before lookup and before replay.
      const current = await authorize(tx, ctx, operation);
      const graph = await loadGraph(tx, current, write.figureId, true);
      const mutation: MutationContext = { actorUserId: current.userId, companyId: current.companyId, capability: operation === "approve" ? "publish.execute" : "catalog.callout.manage", requestId: ctx.requestId };
      const requestHash = canonicalJsonHash({ path: `/admin/figures/${write.figureId}/diagram-mapping${operation === "approve" ? "/approve" : ""}`, figureId: write.figureId, expectedVersion: write.expectedVersion, input });
      const response = await withIdempotency(tx, mutation, `diagram_mapping.${operation}`, write.idempotencyKey, requestHash, async () => {
        if (graph.head.version !== write.expectedVersion) throw new AppError("STALE_MAPPING", 412, "The mapping changed. Reload before writing.");
        const before = await currentRevision(tx, graph);
        let revision: MappingRevision;
        let requiresMap = operation === "approve";
        if (operation === "save") {
          const document = structuredClone((input as MappingSaveInput).document);
          requireCurrentSource(graph, document);
          requiresMap = validateDocument(graph, document);
          if (requiresMap) requireCapability(current, "catalog.callout.map");
          await updateAssociations(tx, graph, document);
          document.catalogueBindingSha256 = catalogueBindingSha256(graph);
          revision = await insertRevision(tx, graph, document, canonicalJsonHash(document), current.userId, now());
        } else {
          const approval = input as MappingApproveInput;
          if (!before || approval.revisionId !== before.revisionId || approval.checksum !== before.checksum) throw new AppError("REVISION_CONFLICT", 409, "Review must identify the exact current revision and checksum.");
          requireCurrentSource(graph, before.document);
          validateDocument(graph, before.document, true);
          revision = await insertApproval(tx, before, current.userId, now());
        }
        // An already approved revision remains immutable and does not duplicate its event.
        if (operation === "save" || !before?.approval) await recordMutation(tx, mutation, write.figureId, before, revision, operation === "save" ? "saved" : "approved");
        return { status: 200, body: { revision, requiresMap } satisfies StoredMutation };
      });
      const stored = response.body as StoredMutation;
      // Original reassociations still require mapping authority even after the graph now matches.
      if (stored.requiresMap) requireCapability(current, "catalog.callout.map");
      return stored.revision;
    });
  }
  return { read, history, historical, save: (ctx: MappingContext, write: MappingWriteContext, input: MappingSaveInput) => mutate(ctx, write, input, "save"), approve: (ctx: MappingContext, write: MappingWriteContext, input: MappingApproveInput) => mutate(ctx, write, input, "approve") };
}
