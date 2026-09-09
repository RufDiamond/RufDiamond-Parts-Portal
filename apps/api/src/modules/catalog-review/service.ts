import { eq, sql } from "drizzle-orm";
import type {
  DepictionReviewInput,
  SourceReviewDetail,
} from "@rufdiamond/contracts";
import type { Database, Transaction } from "../../db/client.js";
import * as s from "../../db/schema/index.js";
import { AppError } from "../../plugins/error-handler.js";
import { writeAuditLog } from "../audit/repository.js";
import {
  loadGraph,
  mappingTransaction,
  type MappingGraph,
} from "../diagram-mapping/repository.js";
import { canonicalJsonHash, withIdempotency } from "../outbox/idempotency.js";
import { enqueueOutboxEvent } from "../outbox/repository.js";
import type { ImportActor, ImportWrite } from "../imports/service.js";
import type { AuthorizationContext } from "../authorization/types.js";
import { sourceReviewer } from "./binding.js";
import { quantityReviews, reviewSourceRow } from "./quantity.js";
import type {
  NormalizedImportFields,
  ReviewedAssemblyFields,
} from "../imports/normalizer.js";
import { rowValue } from "../imports/repository.js";

async function exactAssemblyFields(
  tx: Transaction,
  graph: MappingGraph,
  rowId: string,
  fields: ReviewedAssemblyFields,
) {
  const entry = graph.rows.find((r) => r.row.id === rowId);
  const [system] = await tx
    .select()
    .from(s.system)
    .where(eq(s.system.id, graph.figure.systemId));
  if (!entry || !system) return false;
  return fields.pnc === "-" && exactFields(graph, entry, fields, system.name);
}
function exactFields(
  graph: MappingGraph,
  entry: MappingGraph["rows"][number],
  fields: NormalizedImportFields | ReviewedAssemblyFields,
  systemName: string,
) {
  const { row, part } = entry;
  return (
    row.qty === fields.qty &&
    row.quantitySemantics ===
      ("quantitySemantics" in fields ? fields.quantitySemantics : "known") &&
    row.remarks === fields.remarks &&
    row.serviceable === fields.serviceable &&
    row.effectiveFrom === fields.effectiveFrom &&
    row.effectiveTo === fields.effectiveTo &&
    part.partNumber === fields.partNumber &&
    part.description === fields.description &&
    part.manufacturer === fields.manufacturer &&
    part.listPrice === fields.listPrice &&
    part.currency === fields.currency &&
    graph.figure.name.toLowerCase() === fields.figureName.toLowerCase() &&
    graph.figure.groupNo?.toLowerCase() === fields.groupNo?.toLowerCase() &&
    systemName.toLowerCase() === fields.system.toLowerCase() &&
    graph.model.name.toLowerCase() === fields.model.toLowerCase() &&
    graph.variant.label.toLowerCase() === fields.variant.toLowerCase()
  );
}
async function sourceFieldConflicts(tx: Transaction, graph: MappingGraph) {
  const [system] = await tx
    .select()
    .from(s.system)
    .where(eq(s.system.id, graph.figure.systemId));
  const conflicts: string[] = [];
  for (const { alias, staging, job } of graph.sourceReview.aliases) {
    const row = graph.rows.find((r) => r.row.id === alias.figurePartId);
    const normalized = rowValue(staging);
    const fields =
      normalized.fields ??
      (await quantityReviews(tx, job.id)).find(
        (q) => q.stagingRowId === staging.id,
      )?.interpretedFields;
    const call = alias.calloutId
      ? graph.allOccurrences.find((c) => c.id === alias.calloutId)
      : null;
    if (
      !row ||
      !fields ||
      !system ||
      row.row.sourceRowKey !== alias.identityKey ||
      alias.identityKey !== normalized.identityKey ||
      !exactFields(graph, row, fields, system.name) ||
      (alias.calloutId
        ? !call ||
          call.figurePartId !== row.row.id ||
          call.number !== fields.pnc
        : !!fields.pnc && fields.pnc !== "-")
    )
      conflicts.push(staging.id);
  }
  return conflicts;
}

async function detail(
  tx: Transaction,
  graph: MappingGraph,
  userId: string,
): Promise<SourceReviewDetail> {
  const source = graph.sourceReview;
  const fieldConflicts = await sourceFieldConflicts(tx, graph);
  const unresolved = graph.allOccurrences.filter(
    (o) => !graph.rows.some((r) => r.row.id === o.figurePartId),
  );
  let canReview = true;
  try {
    await sourceReviewer(tx, userId, true);
  } catch (error) {
    if (!(error instanceof AppError) || error.status !== 403) throw error;
    canReview = false;
  }
  return {
    id: graph.figure.id,
    version: graph.head.sourceReviewVersion,
    target: "figure",
    sourceBindingSha256: source.bindingSha256,
    sourceConflict:
      unresolved.length > 0 ||
      fieldConflicts.length > 0 ||
      source.history.some((r) => !source.current.some((c) => c.id === r.id)),
    canReview,
    rows: source.aliases.map(({ job, staging, alias }) => ({
      ...reviewSourceRow(job, staging),
      figurePartId: alias.figurePartId,
      figurePartVersion: graph.rows.find(
        (r) => r.row.id === alias.figurePartId,
      )!.row.version,
    })),
    issues: [
      ...unresolved.map((o) => ({
        id: o.id,
        version: o.version,
        stagingRowId: null,
        code: "SOURCE_OBSERVATION_UNRESOLVED",
        field: "PNC",
        message: `Retained source reference ${o.number} has no established row association; source review cannot waive it.`,
      })),
      ...fieldConflicts.map((id) => ({
        id,
        version: 1,
        stagingRowId: id,
        code: "CANONICAL_SOURCE_FIELDS_CONFLICT",
        field: null,
        message:
          "Canonical fields or reference identity disagree with the retained source; depiction review cannot reconcile them.",
      })),
    ],
    approvals: source.history.map((r) => ({
      decisionId: r.id,
      mode: r.mode,
      rowIds: r.rowIds,
      reviewerId: r.actorId,
      reviewerName: r.reviewerName,
      reviewedAt: r.reviewedAt.toISOString(),
      evidence: r.evidence,
      quantityDecisionId: r.quantityDecisionId,
      current: source.current.some((c) => c.id === r.id),
    })),
  };
}
/** Same named staging decision, attached to actual canonical aliases only after atomic apply. */
export async function bindAppliedQuantityReviews(
  tx: Transaction,
  jobId: string,
  ctx: AuthorizationContext,
) {
  const reviews = await quantityReviews(tx, jobId);
  for (const review of reviews) {
    const [alias] = await tx
      .select()
      .from(s.importSourceAlias)
      .where(eq(s.importSourceAlias.stagingRowId, review.stagingRowId));
    if (!alias)
      throw new AppError(
        "SOURCE_REVIEW_CONFLICT",
        409,
        "The reviewed source row did not receive its exact canonical binding.",
      );
    const graph = await loadGraph(tx, ctx, alias.figureId, true),
      row = graph.rows.find((r) => r.row.id === alias.figurePartId);
    if (
      !row ||
      !(await exactAssemblyFields(
        tx,
        graph,
        alias.figurePartId,
        review.interpretedFields,
      )) ||
      row.row.qty !== null ||
      row.row.quantitySemantics !== "unspecified-installed" ||
      row.part.partNumber !== review.interpretedFields.partNumber ||
      row.row.sourceRowKey !== alias.identityKey ||
      row.row.remarks !== review.interpretedFields.remarks ||
      alias.calloutId !== null
    )
      throw new AppError(
        "SOURCE_REVIEW_CONFLICT",
        409,
        "Applied assembly fields do not match the exact reviewed source.",
      );
    await tx.insert(s.catalogDepictionReview).values({
      figureId: alias.figureId,
      reviewVersion: graph.head.sourceReviewVersion,
      sourceBindingSha256: graph.sourceReview.bindingSha256,
      source: graph.sourceReview.source,
      mode: "assembly-reference-unspecified",
      rowIds: [alias.figurePartId],
      quantityDecisionId: review.id,
      actorId: review.actorId,
      reviewerName: review.reviewerName,
      reviewedAt: review.reviewedAt,
      evidence: review.evidence,
    });
    await tx
      .update(s.diagramMapping)
      .set({
        sourceReviewVersion: sql`${s.diagramMapping.sourceReviewVersion}+1`,
      })
      .where(eq(s.diagramMapping.id, graph.head.id));
  }
}
export function createDepictionReviewService(
  database: Database,
  now: () => Date,
) {
  async function read(actor: ImportActor, id: string) {
    return mappingTransaction(
      database,
      async (tx) => {
        const ctx = await sourceReviewer(tx, actor.userId, false);
        return detail(tx, await loadGraph(tx, ctx, id, false), actor.userId);
      },
      false,
    );
  }
  async function approve(
    actor: ImportActor,
    id: string,
    write: ImportWrite,
    input: DepictionReviewInput,
  ) {
    return mappingTransaction(database, async (tx) => {
      const ctx = await sourceReviewer(tx, actor.userId, true),
        graph = await loadGraph(tx, ctx, id, true);
      const audit = {
        actorUserId: actor.userId,
        companyId: ctx.companyId,
        capability: "publish.execute",
        requestId: actor.requestId,
      };
      return (
        await withIdempotency(
          tx,
          audit,
          "catalog_source.depiction_review",
          write.idempotencyKey,
          canonicalJsonHash({
            id,
            input,
            expectedVersion: write.expectedVersion,
          }),
          async () => {
            if (graph.head.sourceReviewVersion !== write.expectedVersion)
              throw new AppError(
                "STALE_SOURCE_REVIEW",
                412,
                "The review changed. Reload before writing.",
              );
            if (graph.sourceReview.bindingSha256 !== input.sourceBindingSha256)
              throw new AppError(
                "SOURCE_REVIEW_CONFLICT",
                409,
                "The exact source or target changed. Reload and review again.",
              );
            if (
              !graph.rows.length ||
              (await sourceFieldConflicts(tx, graph)).length > 0 ||
              graph.sourceReview.aliases.length !== graph.rows.length ||
              input.rowIds.some(
                (id) => !graph.rows.some((r) => r.row.id === id),
              )
            )
              throw new AppError(
                "SOURCE_REVIEW_INVALID",
                422,
                "Every reviewed row requires an exact current canonical source alias.",
              );
            if (
              input.mode === "table-only" &&
              (graph.drawing !== null ||
                graph.allOccurrences.some(
                  (o) => !graph.rows.some((r) => r.row.id === o.figurePartId),
                ) ||
                input.rowIds.length !== graph.rows.length)
            )
              throw new AppError(
                "SOURCE_REVIEW_INVALID",
                422,
                "Table-only review must cover the complete exact row set of a figure without a drawing.",
              );
            if (input.mode === "assembly-reference-unspecified") {
              const row = graph.rows.find((r) => r.row.id === input.rowIds[0])!,
                alias = graph.sourceReview.aliases.find(
                  (a) => a.alias.figurePartId === row.row.id,
                )!;
              const [quantity] = await tx
                .select()
                .from(s.importQuantityReview)
                .where(eq(s.importQuantityReview.id, input.quantityDecisionId));
              const [issue] = quantity
                ? await tx
                    .select()
                    .from(s.importIssue)
                    .where(eq(s.importIssue.id, quantity.issueId))
                : [];
              if (
                !quantity ||
                !issue ||
                issue.version !== quantity.issueVersion ||
                issue.stagingRowId !== alias.staging.id ||
                quantity.stagingRowVersion !== alias.staging.version ||
                canonicalJsonHash(quantity.source) !==
                  quantity.sourceBindingSha256 ||
                !(await exactAssemblyFields(
                  tx,
                  graph,
                  row.row.id,
                  quantity.interpretedFields,
                )) ||
                quantity.stagingRowId !== alias.staging.id ||
                quantity.jobId !== alias.job.id ||
                row.row.qty !== null ||
                row.row.quantitySemantics !== "unspecified-installed" ||
                quantity.interpretedFields.partNumber !== row.part.partNumber ||
                quantity.interpretedFields.remarks !== row.row.remarks ||
                String(
                  (alias.staging.sourcePayload as Record<string, unknown>).QTY,
                ) !== "0"
              )
                throw new AppError(
                  "SOURCE_REVIEW_INVALID",
                  422,
                  "The original combined quantity decision must match this exact current assembly source row.",
                );
            } else if (
              input.rowIds.some(
                (id) =>
                  graph.rows.find((r) => r.row.id === id)!.row
                    .quantitySemantics === "unspecified-installed" &&
                  !graph.sourceReview.current.some(
                    (r) =>
                      r.mode === "assembly-reference-unspecified" &&
                      r.rowIds.includes(id),
                  ),
              )
            )
              throw new AppError(
                "SOURCE_REVIEW_INVALID",
                422,
                "An unspecified assembly quantity requires its attributable combined source decision.",
              );
            const [user] = await tx
              .select({ name: s.appUser.name })
              .from(s.appUser)
              .where(eq(s.appUser.id, actor.userId));
            const [decision] = await tx
              .insert(s.catalogDepictionReview)
              .values({
                figureId: id,
                reviewVersion: graph.head.sourceReviewVersion,
                sourceBindingSha256: input.sourceBindingSha256,
                source: graph.sourceReview.source,
                mode: input.mode,
                rowIds: [...input.rowIds].sort(),
                quantityDecisionId:
                  input.mode === "assembly-reference-unspecified"
                    ? input.quantityDecisionId
                    : null,
                actorId: actor.userId,
                reviewerName: user.name,
                reviewedAt: now(),
                evidence: input.evidence,
              })
              .returning();
            await tx
              .update(s.diagramMapping)
              .set({
                sourceReviewVersion: sql`${s.diagramMapping.sourceReviewVersion}+1`,
              })
              .where(eq(s.diagramMapping.id, graph.head.id));
            await writeAuditLog(tx, audit, {
              objectType: "catalog_depiction_review",
              objectId: decision.id,
              before: null,
              after: {
                decisionId: decision.id,
                figureId: id,
                sourceBindingSha256: input.sourceBindingSha256,
                mode: input.mode,
                rowIds: input.rowIds,
              },
            });
            await enqueueOutboxEvent(tx, {
              eventType: "catalog_source.depiction_reviewed",
              aggregateType: "figure",
              aggregateId: id,
              payload: { decisionId: decision.id, actorId: actor.userId },
              deduplicationKey: `catalog_source.depiction_reviewed:${decision.id}`,
            });
            return {
              status: 200,
              body: await detail(
                tx,
                await loadGraph(tx, ctx, id, false),
                actor.userId,
              ),
            };
          },
        )
      ).body as SourceReviewDetail;
    });
  }
  return { read, approve };
}
