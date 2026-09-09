import { createHash } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import type {
  AssemblyReferenceReviewInput,
  SourceReviewDetail,
  ReviewSourceRow,
} from "@rufdiamond/contracts";
import type { Database, Transaction } from "../../db/client.js";
import {
  appUser,
  importIssue,
  importJob,
  importQuantityReview,
  importStagingRow,
} from "../../db/schema/index.js";
import { AppError } from "../../plugins/error-handler.js";
import { requireCapability } from "../authorization/policy.js";
import { writeAuditLog } from "../audit/repository.js";
import { mappingTransaction } from "../diagram-mapping/repository.js";
import { canonicalJsonHash, withIdempotency } from "../outbox/idempotency.js";
import { enqueueOutboxEvent } from "../outbox/repository.js";
import { publisher } from "../publication/validation.js";
import {
  jobRows,
  rowValue,
  scopedJob,
  targetScope,
  validationProblems,
  type StoredJob,
} from "../imports/repository.js";
import {
  normalizeImport,
  type AppliedImportRow,
  type ReviewedAssemblyFields,
} from "../imports/normalizer.js";
import { parseImport } from "../imports/parser.js";
import type { ImportActor, ImportWrite } from "../imports/service.js";
import type { ImportSourceStorage } from "../imports/source-storage.js";

const conflict = () =>
  new AppError(
    "SOURCE_REVIEW_CONFLICT",
    409,
    "The exact reviewed source or target changed. Reload and review again.",
  );
const stale = () =>
  new AppError(
    "STALE_SOURCE_REVIEW",
    412,
    "The review changed. Reload before writing.",
  );
type StoredRow = typeof importStagingRow.$inferSelect;
type Target = Awaited<ReturnType<typeof targetScope>>;
export function importSourceBinding(
  job: StoredJob,
  target: Target,
  rows: StoredRow[],
) {
  return {
    jobId: job.id,
    sourceChecksum: job.sourceChecksum,
    objectKey: job.objectKey,
    objectVersionId: job.objectVersionId,
    sourceBytes: job.sourceBytes,
    lineageKey: job.lineageKey,
    modelId: job.modelId,
    modelVersion: target.model.version,
    variantId: job.variantId,
    variantVersion: target.variant.version,
    rows: rows
      .map((r) => ({
        id: r.id,
        version: r.version,
        sourceRowKey: r.sourceRowKey,
        identityKey: rowValue(r).identityKey,
        contentHash: rowValue(r).contentHash,
      }))
      .sort((a, b) => a.id.localeCompare(b.id)),
  };
}
export function reviewSourceRow(
  job: StoredJob,
  row: StoredRow,
): ReviewSourceRow {
  const raw = row.sourcePayload as Record<string, unknown>,
    normalized = rowValue(row);
  const string = (v: unknown) =>
    v === null || v === undefined ? null : String(v);
  return {
    stagingRowId: row.id,
    stagingRowVersion: row.version,
    sourceRowKey: row.sourceRowKey,
    identityKey: normalized.identityKey,
    contentHash: normalized.contentHash,
    sourceChecksum: job.sourceChecksum,
    jobId: job.id,
    lineageKey: job.lineageKey!,
    rowNumber: row.rowNumber,
    partNumber: String(raw["PART NO"] ?? ""),
    description: String(raw.DESCRIPTION ?? ""),
    reference: string(raw.PNC),
    rawQuantity: typeof raw.QTY === "number" ? raw.QTY : string(raw.QTY),
    remarks: string(raw.REMARKS),
    figurePartId: null,
    figurePartVersion: null,
  };
}
export async function quantityReviewer(
  tx: Transaction,
  userId: string,
  approve: boolean,
) {
  const ctx = await publisher(
    tx,
    userId,
    approve ? "publish.execute" : "publish.draft.view",
  );
  requireCapability(ctx, "parts.import");
  return ctx;
}
export async function quantityReviews(tx: Transaction, jobId: string) {
  return tx
    .select()
    .from(importQuantityReview)
    .where(eq(importQuantityReview.jobId, jobId));
}
/** Only interpretations whose exact issue and immutable source are current qualify. */
export async function resolvedImportRows(
  tx: Transaction,
  job: StoredJob,
  target: Target,
): Promise<AppliedImportRow[]> {
  const rows = await jobRows(tx, job.id),
    reviews = await quantityReviews(tx, job.id);
  const binding = canonicalJsonHash(importSourceBinding(job, target, rows));
  const result: AppliedImportRow[] = rows.map(rowValue);
  for (const review of reviews) {
    const row = rows.find((r) => r.id === review.stagingRowId);
    const [issue] = await tx
      .select()
      .from(importIssue)
      .where(
        and(eq(importIssue.id, review.issueId), eq(importIssue.jobId, job.id)),
      );
    if (
      !row ||
      row.version !== review.stagingRowVersion ||
      !issue ||
      issue.version !== review.issueVersion ||
      issue.stagingRowId !== row.id ||
      issue.field !== "QTY" ||
      issue.code !== "INVALID_FIELD" ||
      review.sourceBindingSha256 !== binding ||
      canonicalJsonHash(review.source) !== binding
    )
      throw conflict();
    const authority = await quantityReviewer(tx, review.actorId, true);
    await targetScope(tx, authority, job.modelId, job.variantId);
    result[rows.indexOf(row)] = {
      ...rowValue(row),
      fields: review.interpretedFields,
    };
  }
  return result;
}
export function createQuantityReviewService(
  database: Database,
  storage: ImportSourceStorage,
  now: () => Date,
) {
  async function detail(
    tx: Transaction,
    job: StoredJob,
    target: Target,
    userId: string,
  ): Promise<SourceReviewDetail> {
    const rows = await jobRows(tx, job.id),
      reviews = await quantityReviews(tx, job.id),
      binding = canonicalJsonHash(importSourceBinding(job, target, rows));
    const issues = await tx
      .select()
      .from(importIssue)
      .where(eq(importIssue.jobId, job.id));
    let canReview = true;
    try {
      await quantityReviewer(tx, userId, true);
    } catch (error) {
      if (!(error instanceof AppError) || error.status !== 403) throw error;
      canReview = false;
    }
    return {
      id: job.id,
      version: job.version,
      target: "import",
      sourceBindingSha256: binding,
      sourceConflict: reviews.some((r) => r.sourceBindingSha256 !== binding),
      canReview: canReview && job.state !== "applied",
      rows: rows.map((r) => reviewSourceRow(job, r)),
      issues: issues.map((i) => ({
        id: i.id,
        version: i.version,
        stagingRowId: i.stagingRowId,
        code: i.code,
        field: i.field,
        message: i.message,
      })),
      approvals: reviews.map((r) => ({
        decisionId: r.id,
        reviewerId: r.actorId,
        reviewerName: r.reviewerName,
        reviewedAt: r.reviewedAt.toISOString(),
        evidence: r.evidence,
        mode: "assembly-reference-unspecified",
        rowIds: [r.stagingRowId],
        current: r.sourceBindingSha256 === binding,
      })),
    };
  }
  async function read(actor: ImportActor, id: string) {
    return mappingTransaction(
      database,
      async (tx) => {
        const ctx = await quantityReviewer(tx, actor.userId, false),
          { job, target } = await scopedJob(tx, ctx, id);
        return detail(tx, job, target, actor.userId);
      },
      false,
    );
  }
  async function approve(
    actor: ImportActor,
    id: string,
    write: ImportWrite,
    input: AssemblyReferenceReviewInput,
  ) {
    const source = await mappingTransaction(
      database,
      async (tx) => {
        const ctx = await quantityReviewer(tx, actor.userId, true);
        return (await scopedJob(tx, ctx, id)).job;
      },
      false,
    );
    if (!source.format || !source.objectVersionId) throw conflict();
    let bytes: Buffer;
    try {
      bytes = await storage.read(source.objectKey, source.objectVersionId);
    } catch {
      throw new AppError(
        "IMPORT_SOURCE_UNAVAILABLE",
        503,
        "The exact private source version is unavailable.",
      );
    }
    if (
      bytes.length !== source.sourceBytes ||
      createHash("sha256").update(bytes).digest("hex") !== source.sourceChecksum
    )
      throw conflict();
    const parsed = await parseImport(bytes, source.format);
    return mappingTransaction(database, async (tx) => {
      const ctx = await quantityReviewer(tx, actor.userId, true),
        { job, target } = await scopedJob(tx, ctx, id, true);
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
          "catalog_source.quantity_review",
          write.idempotencyKey,
          canonicalJsonHash({
            id,
            input,
            expectedVersion: write.expectedVersion,
          }),
          async () => {
            if (job.version !== write.expectedVersion) throw stale();
            if (job.state !== "validated")
              throw new AppError(
                "SOURCE_REVIEW_INVALID",
                422,
                "Validate this staged source before reviewing an assembly reference.",
              );
            const rows = await jobRows(tx, id),
              binding = importSourceBinding(job, target, rows);
            if (canonicalJsonHash(binding) !== input.sourceBindingSha256)
              throw conflict();
            const row = rows.find((r) => r.id === input.stagingRowId),
              [issue] = await tx
                .select()
                .from(importIssue)
                .where(
                  and(
                    eq(importIssue.id, input.issueId),
                    eq(importIssue.jobId, id),
                  ),
                )
                .for("update");
            if (!row || !issue || issue.stagingRowId !== row.id)
              throw new AppError(
                "SOURCE_REVIEW_NOT_FOUND",
                404,
                "The requested source row or issue was not found.",
              );
            if (
              row.version !== input.stagingRowVersion ||
              issue.version !== input.issueVersion
            )
              throw stale();
            if (
              (await quantityReviews(tx, id)).some(
                (r) =>
                  r.issueId === issue.id && r.issueVersion === issue.version,
              )
            )
              throw conflict();
            if (
              issue.code !== "INVALID_FIELD" ||
              issue.field !== "QTY" ||
              issue.severity !== "error"
            )
              throw new AppError(
                "SOURCE_REVIEW_INVALID",
                422,
                "Only an exact invalid quantity issue can receive this interpretation.",
              );
            const original = normalizeImport(parsed),
              originalRow = original.rows.find(
                (r) => r.sourceRowKey === row.sourceRowKey,
              );
            if (
              !originalRow ||
              canonicalJsonHash(originalRow) !==
                canonicalJsonHash(rowValue(row))
            )
              throw conflict();
            const reviewed = normalizeImport(parsed, [row.rowNumber!]),
              interpreted = reviewed.rows.find(
                (r) => r.sourceRowKey === row.sourceRowKey,
              )?.fields;
            if (
              !interpreted ||
              !("quantitySemantics" in interpreted) ||
              interpreted.quantitySemantics !== "unspecified-installed" ||
              reviewed.issues.some((i) => i.sourceRowKey === row.sourceRowKey)
            )
              throw new AppError(
                "SOURCE_REVIEW_INVALID",
                422,
                "A raw zero with an informational reference and otherwise valid fields is required.",
              );
            const effective = await resolvedImportRows(tx, job, target);
            effective[rows.indexOf(row)] = {
              ...rowValue(row),
              fields: interpreted,
            };
            const problems = await validationProblems(
              tx,
              job,
              target,
              effective,
            );
            if (problems.length)
              throw new AppError(
                "SOURCE_REVIEW_INVALID",
                422,
                "Unresolved source conflicts must be corrected before this interpretation.",
                problems.map((p) => ({
                  path: p.sourceRowKey,
                  code: p.code,
                  message: p.message,
                })),
              );
            const [user] = await tx
              .select({ name: appUser.name })
              .from(appUser)
              .where(eq(appUser.id, actor.userId));
            const [decision] = await tx
              .insert(importQuantityReview)
              .values({
                jobId: id,
                stagingRowId: row.id,
                stagingRowVersion: row.version,
                issueId: issue.id,
                issueVersion: issue.version,
                sourceBindingSha256: input.sourceBindingSha256,
                source: binding,
                interpretedFields: interpreted as ReviewedAssemblyFields,
                actorId: actor.userId,
                reviewerName: user.name,
                reviewedAt: now(),
                evidence: input.evidence,
              })
              .returning();
            const [updated] = await tx
              .update(importJob)
              .set({ version: sql`${importJob.version}+1`, updatedAt: now() })
              .where(eq(importJob.id, id))
              .returning();
            await writeAuditLog(tx, audit, {
              objectType: "import_quantity_review",
              objectId: decision.id,
              before: null,
              after: {
                jobId: id,
                decisionId: decision.id,
                sourceBindingSha256: input.sourceBindingSha256,
                mode: input.decision,
              },
            });
            await enqueueOutboxEvent(tx, {
              eventType: "catalog_source.quantity_reviewed",
              aggregateType: "import_job",
              aggregateId: id,
              payload: { decisionId: decision.id, actorId: actor.userId },
              deduplicationKey: `catalog_source.quantity_reviewed:${decision.id}`,
            });
            return {
              status: 200,
              body: await detail(tx, updated, target, actor.userId),
            };
          },
        )
      ).body as SourceReviewDetail;
    });
  }
  return { read, approve };
}
