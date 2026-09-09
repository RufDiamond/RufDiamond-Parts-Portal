import { and, desc, eq } from "drizzle-orm";
import type { Transaction } from "../../db/client.js";
import * as s from "../../db/schema/index.js";
import {
  loadAuthorization,
  requireCapability,
} from "../authorization/policy.js";
import { canonicalJsonHash } from "../outbox/idempotency.js";
import type { AuthorizationContext } from "../authorization/types.js";
import { AppError } from "../../plugins/error-handler.js";
import { quantityReviewer, reviewSourceRow } from "./quantity.js";
import { publisher } from "../publication/validation.js";

export type SourceGraph = {
  figure: typeof s.figure.$inferSelect;
  model: typeof s.model.$inferSelect;
  variant: typeof s.variant.$inferSelect;
  system: typeof s.system.$inferSelect;
  drawing: typeof s.drawingFile.$inferSelect | null;
  rows: Array<{
    row: typeof s.figurePart.$inferSelect;
    part: typeof s.part.$inferSelect;
  }>;
  occurrences: Array<typeof s.callout.$inferSelect>;
};
export async function sourceReviewer(
  tx: Transaction,
  userId: string,
  approve: boolean,
) {
  const ctx = approve
    ? await publisher(tx, userId, "publish.execute")
    : await loadAuthorization(tx, userId);
  requireCapability(ctx, "publish.draft.view");
  requireCapability(ctx, "catalog.figure.view");
  if (!ctx.canViewDraft)
    throw new AppError("FORBIDDEN", 403, "Draft catalogue access is required.");
  if (approve) {
    for (const capability of [
      "publish.execute",
      "catalog.callout.manage",
      "catalog.callout.map",
    ])
      requireCapability(ctx, capability);
  }
  return ctx;
}
const scoped = (ctx: AuthorizationContext, g: SourceGraph) =>
  (ctx.brandIds === "all" || ctx.brandIds.includes(g.model.productLineId)) &&
  (ctx.variantIds === "all" || ctx.variantIds.includes(g.variant.id));
export async function loadSourceReviews(tx: Transaction, graph: SourceGraph) {
  const aliases = await tx
    .select({
      alias: s.importSourceAlias,
      job: s.importJob,
      staging: s.importStagingRow,
    })
    .from(s.importSourceAlias)
    .innerJoin(s.importJob, eq(s.importJob.id, s.importSourceAlias.jobId))
    .innerJoin(
      s.importStagingRow,
      eq(s.importStagingRow.id, s.importSourceAlias.stagingRowId),
    )
    .where(
      and(
        eq(s.importSourceAlias.figureId, graph.figure.id),
        eq(s.importJob.state, "applied"),
      ),
    )
    .orderBy(desc(s.importJob.appliedAt), desc(s.importJob.createdAt));
  const currentAliases = graph.rows.flatMap(({ row }) => {
    const a = aliases.find((a) => a.alias.figurePartId === row.id);
    return a ? [a] : [];
  });
  const source = {
    system: {
      id: graph.system.id,
      version: graph.system.version,
      name: graph.system.name,
    },
    figure: {
      id: graph.figure.id,
      version: graph.figure.version,
      sourceKey: graph.figure.sourceKey,
      variantId: graph.variant.id,
      variantVersion: graph.variant.version,
      modelId: graph.model.id,
      modelVersion: graph.model.version,
    },
    drawing: graph.drawing
      ? {
          id: graph.drawing.id,
          sha256: graph.drawing.sha256,
          fileVersion: graph.drawing.fileVersion,
          objectVersionId: graph.drawing.objectVersionId,
        }
      : null,
    rows: graph.rows.map(({ row, part }) => ({
      id: row.id,
      version: row.version,
      sourceRowKey: row.sourceRowKey,
      partId: part.id,
      partVersion: part.version,
      qty: row.qty,
      quantitySemantics: row.quantitySemantics,
    })),
    observations: graph.occurrences.map((c) => ({
      id: c.id,
      version: c.version,
      sourceKey: c.sourceKey,
      figurePartId: c.figurePartId,
      number: c.number,
    })),
    aliases: currentAliases.map(({ alias, job, staging }) => ({
      ...reviewSourceRow(job, staging),
      aliasId: alias.id,
      figurePartId: alias.figurePartId,
      calloutId: alias.calloutId,
      objectKey: job.objectKey,
      objectVersionId: job.objectVersionId,
      sourceBytes: job.sourceBytes,
      raw: staging.sourcePayload,
    })),
  };
  const bindingSha256 = canonicalJsonHash(source),
    history = await tx
      .select()
      .from(s.catalogDepictionReview)
      .where(eq(s.catalogDepictionReview.figureId, graph.figure.id))
      .orderBy(s.catalogDepictionReview.reviewVersion);
  const current: Array<typeof s.catalogDepictionReview.$inferSelect> = [];
  for (const decision of history) {
    if (
      decision.sourceBindingSha256 !== bindingSha256 ||
      canonicalJsonHash(decision.source) !== bindingSha256 ||
      currentAliases.length !== graph.rows.length ||
      decision.rowIds.some((id) => !graph.rows.some((r) => r.row.id === id))
    )
      continue;
    if (
      decision.mode === "table-only" &&
      (decision.rowIds.length !== graph.rows.length ||
        graph.occurrences.some(
          (o) => !graph.rows.some((r) => r.row.id === o.figurePartId),
        ) ||
        graph.figure.drawingFileId !== null)
    )
      continue;
    try {
      const ctx =
        decision.mode === "assembly-reference-unspecified"
          ? await quantityReviewer(tx, decision.actorId, true)
          : await sourceReviewer(tx, decision.actorId, true);
      if (!scoped(ctx, graph)) continue;
    } catch (error) {
      if (
        error instanceof AppError &&
        (error.status === 403 || error.status === 404)
      )
        continue;
      throw error;
    }
    current.push(decision);
  }
  return {
    source,
    bindingSha256,
    history,
    current,
    aliases: currentAliases,
    tableOnly: current.some((r) => r.mode === "table-only"),
    excludedRowIds: new Set(current.flatMap((r) => r.rowIds)),
  };
}
export function depictionProvenance(
  review: typeof s.catalogDepictionReview.$inferSelect,
): s.DepictionProvenance {
  return {
    decisionId: review.id,
    mode: review.mode,
    rowIds: review.rowIds,
    sourceBindingSha256: review.sourceBindingSha256,
    source: review.source,
    reviewerId: review.actorId,
    reviewerName: review.reviewerName,
    reviewedAt: review.reviewedAt.toISOString(),
    evidence: review.evidence,
    quantityDecisionId: review.quantityDecisionId,
  };
}
