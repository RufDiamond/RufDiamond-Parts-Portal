import { createHash, randomUUID } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import {
  canApplyImport,
  type ImportDetail,
  type ImportIssueReviewInput,
  type ImportUploadMetadata,
} from "@rufdiamond/contracts";
import type { Database, Transaction } from "../../db/client.js";
import {
  importIssue,
  importIssueReview,
  importJob,
  importStagingRow,
} from "../../db/schema/index.js";
import { AppError } from "../../plugins/error-handler.js";
import { writeAuditLog, type MutationContext } from "../audit/repository.js";
import {
  loadAuthorization,
  requireCapability,
} from "../authorization/policy.js";
import { mappingTransaction } from "../diagram-mapping/repository.js";
import type { DrawingScanner } from "../drawings/storage.js";
import { canonicalJsonHash, withIdempotency } from "../outbox/idempotency.js";
import { enqueueOutboxEvent } from "../outbox/repository.js";
import { normalizeImport } from "./normalizer.js";
import { parseImport } from "./parser.js";
import {
  applyGraph,
  detail,
  jobRows,
  missing,
  persistProblems,
  rowValue,
  sameSource,
  scopedJob,
  targetScope,
  validationProblems,
} from "./repository.js";
import type { ImportSourceStorage } from "./source-storage.js";
export type ImportActor = { userId: string; requestId: string };
export type ImportWrite = { expectedVersion: number; idempotencyKey: string };
const stale = () =>
  new AppError(
    "STALE_IMPORT",
    412,
    "The import or target changed. Reload before writing.",
  );
async function authorize(tx: Transaction, actor: ImportActor) {
  const ctx = await loadAuthorization(tx, actor.userId);
  requireCapability(ctx, "parts.import");
  requireCapability(ctx, "publish.draft.view");
  if (!ctx.canViewDraft)
    throw new AppError("FORBIDDEN", 403, "Draft import access is required.");
  return ctx;
}
const mutation = (actor: ImportActor, companyId: string): MutationContext => ({
  actorUserId: actor.userId,
  companyId,
  capability: "parts.import",
  requestId: actor.requestId,
});
async function record(
  tx: Transaction,
  ctx: MutationContext,
  id: string,
  action: string,
  after: unknown,
) {
  await writeAuditLog(tx, ctx, {
    objectType: "import_job",
    objectId: id,
    before: null,
    after,
  });
  await enqueueOutboxEvent(tx, {
    eventType: `import.${action}`,
    aggregateType: "import_job",
    aggregateId: id,
    payload: { jobId: id, actorId: ctx.actorUserId },
    deduplicationKey: `import.${action}:${id}:${canonicalJsonHash(after)}`,
  });
}

export function createImportService(
  database: Database,
  storage: ImportSourceStorage,
  scanner: DrawingScanner,
  now = () => new Date(),
) {
  async function preflight(
    actor: ImportActor,
    input: ImportUploadMetadata,
    write: ImportWrite,
  ) {
    return mappingTransaction(
      database,
      async (tx) => {
        const ctx = await authorize(tx, actor),
          target = await targetScope(tx, ctx, input.modelId, input.variantId);
        const [existing] = await tx
          .select()
          .from(importJob)
          .where(
            and(
              eq(importJob.variantId, input.variantId),
              eq(importJob.sourceChecksum, input.sha256),
            ),
          );
        if (existing) {
          if (!sameSource(existing, input))
            throw new AppError(
              "IMPORT_SOURCE_CONFLICT",
              409,
              "The exact source was already declared with different metadata.",
            );
        } else if (target.model.version !== write.expectedVersion)
          throw stale();
        return ctx;
      },
      false,
    );
  }
  async function read(actor: ImportActor, id: string) {
    return mappingTransaction(
      database,
      async (tx) => {
        const ctx = await authorize(tx, actor);
        return detail(tx, (await scopedJob(tx, ctx, id)).job);
      },
      false,
    );
  }
  async function stage(
    actor: ImportActor,
    input: ImportUploadMetadata,
    write: ImportWrite,
    bytes: Buffer,
  ): Promise<ImportDetail> {
    await preflight(actor, input, write);
    if (!input.filename.endsWith(`.${input.format}`))
      throw new AppError(
        "INVALID_IMPORT_FORMAT",
        400,
        "Filename and source format must match.",
      );
    if (createHash("sha256").update(bytes).digest("hex") !== input.sha256)
      throw new AppError(
        "SOURCE_HASH_MISMATCH",
        422,
        "The source bytes do not match the declared checksum.",
      );
    let parsed;
    try {
      parsed = normalizeImport(await parseImport(bytes, input.format));
    } catch (error) {
      throw new AppError(
        "INVALID_IMPORT_SOURCE",
        422,
        error instanceof Error ? error.message : "Invalid source.",
      );
    }
    const scan = await scanner.scan(bytes);
    if (scan !== "clean")
      throw new AppError(
        scan === "infected" ? "IMPORT_INFECTED" : "IMPORT_SCAN_UNAVAILABLE",
        scan === "infected" ? 422 : 503,
        "The source did not receive a clean malware scan.",
      );
    const id = randomUUID(),
      objectKey = `imports/${input.variantId}/${id}.${input.format}`;
    let objectVersionId: string;
    try {
      objectVersionId = (await storage.put(objectKey, bytes, input.format))
        .versionId;
    } catch {
      throw new AppError(
        "IMPORT_STORAGE_UNAVAILABLE",
        503,
        "Private versioned source storage is unavailable.",
      );
    }
    let retained = false;
    try {
      const result = await mappingTransaction(database, async (tx) => {
        const ctx = await authorize(tx, actor),
          target = await targetScope(
            tx,
            ctx,
            input.modelId,
            input.variantId,
            true,
          ),
          audit = mutation(actor, ctx.companyId);
        const response = await withIdempotency(
          tx,
          audit,
          "import.stage",
          write.idempotencyKey,
          canonicalJsonHash({
            input: { ...input },
            expectedVersion: write.expectedVersion,
          }),
          async () => {
            const [existing] = await tx
              .select()
              .from(importJob)
              .where(
                and(
                  eq(importJob.variantId, input.variantId),
                  eq(importJob.sourceChecksum, input.sha256),
                ),
              );
            if (existing) {
              if (!sameSource(existing, input))
                throw new AppError(
                  "IMPORT_SOURCE_CONFLICT",
                  409,
                  "The exact source was already declared with different metadata.",
                );
              return { status: 201, body: await detail(tx, existing) };
            }
            if (target.model.version !== write.expectedVersion) throw stale();
            const [job] = await tx
              .insert(importJob)
              .values({
                id,
                modelId: input.modelId,
                variantId: input.variantId,
                sourceChecksum: input.sha256,
                objectKey,
                objectVersionId,
                filename: input.filename,
                lineageKey: input.lineageKey,
                format: input.format,
                sourceKind: input.sourceKind,
                sourceBytes: bytes.length,
                state: "staged",
                actorId: actor.userId,
                summary: { targetModelVersion: target.model.version },
              })
              .returning();
            // Batches bound parameter counts; every raw observation survives normalization failures.
            for (let offset = 0; offset < parsed.rows.length; offset += 200)
              await tx
                .insert(importStagingRow)
                .values(
                  parsed.rows
                    .slice(offset, offset + 200)
                    .map((row) => ({
                      jobId: id,
                      sourceRowKey: row.sourceRowKey,
                      rowNumber: row.rowNumber,
                      sourcePayload: row.sourcePayload,
                      normalizedFields: row,
                    })),
                );
            await persistProblems(tx, id, parsed.issues);
            const result = await detail(tx, job);
            await record(tx, audit, id, "staged", {
              sourceChecksum: input.sha256,
              rowCount: result.rowCount,
              sourceKind: input.sourceKind,
            });
            return { status: 201, body: result };
          },
        );
        return response.body as ImportDetail;
      });
      retained = result.id === id;
      return result;
    } finally {
      // Transaction outcomes may be uncertain after a dropped connection. Fail closed on cleanup.
      if (!retained) {
        try {
          const [reference] = await database
            .select({ id: importJob.id })
            .from(importJob)
            .where(eq(importJob.objectKey, objectKey));
          if (!reference) await storage.remove(objectKey, objectVersionId);
        } catch {
          process.emitWarning(
            "An import attempt needs exact-version orphan reconciliation.",
            { code: "IMPORT_ORPHAN_RECONCILIATION_REQUIRED" },
          );
        }
      }
    }
  }
  async function validate(actor: ImportActor, id: string, write: ImportWrite) {
    return mappingTransaction(database, async (tx) => {
      const ctx = await authorize(tx, actor),
        { job, target } = await scopedJob(tx, ctx, id, true),
        audit = mutation(actor, ctx.companyId);
      return (
        await withIdempotency(
          tx,
          audit,
          "import.validate",
          write.idempotencyKey,
          canonicalJsonHash({ id, expectedVersion: write.expectedVersion }),
          async () => {
            if (job.version !== write.expectedVersion) throw stale();
            if (!["staged", "validated"].includes(job.state))
              throw new AppError(
                "IMPORT_STATE_CONFLICT",
                409,
                "This import cannot be validated in its current state.",
              );
            await persistProblems(
              tx,
              id,
              await validationProblems(
                tx,
                job,
                target,
                (await jobRows(tx, id)).map(rowValue),
              ),
            );
            const [updated] = await tx
              .update(importJob)
              .set({
                state: "validated",
                version: sql`${importJob.version}+1`,
                updatedAt: now(),
                summary: { targetModelVersion: target.model.version },
              })
              .where(eq(importJob.id, id))
              .returning();
            const result = await detail(tx, updated);
            await record(tx, audit, id, "validated", {
              version: updated.version,
              blockingIssueCount: result.blockingIssueCount,
            });
            return { status: 200, body: result };
          },
        )
      ).body as ImportDetail;
    });
  }
  async function review(
    actor: ImportActor,
    id: string,
    issueId: string,
    write: ImportWrite,
    input: ImportIssueReviewInput,
  ) {
    return mappingTransaction(database, async (tx) => {
      const ctx = await authorize(tx, actor),
        { job } = await scopedJob(tx, ctx, id, true),
        audit = mutation(actor, ctx.companyId);
      const [issue] = await tx
        .select()
        .from(importIssue)
        .where(and(eq(importIssue.id, issueId), eq(importIssue.jobId, id)))
        .for("update");
      if (!issue) missing();
      return (
        await withIdempotency(
          tx,
          audit,
          "import.issue.review",
          write.idempotencyKey,
          canonicalJsonHash({
            id,
            issueId,
            expectedVersion: write.expectedVersion,
            input,
          }),
          async () => {
            if (issue.version !== write.expectedVersion) throw stale();
            if (job.state === "applied")
              throw new AppError(
                "IMPORT_STATE_CONFLICT",
                409,
                "Applied source review history is immutable.",
              );
            if (
              issue.severity === "error" &&
              input.decision !== "source-correction-required"
            )
              throw new AppError(
                "SOURCE_CORRECTION_REQUIRED",
                409,
                "A review note cannot waive a blocking source error.",
              );
            await tx
              .insert(importIssueReview)
              .values({
                issueId,
                issueVersion: issue.version,
                decision: input.decision,
                evidence: input.evidence,
                actorId: actor.userId,
                reviewedAt: now(),
              });
            await tx
              .update(importIssue)
              .set({
                resolution: input,
                resolvedByUserId: actor.userId,
                resolvedAt: now(),
                version: sql`${importIssue.version}+1`,
                updatedAt: now(),
              })
              .where(eq(importIssue.id, issueId));
            const [updated] = await tx
              .update(importJob)
              .set({ version: sql`${importJob.version}+1`, updatedAt: now() })
              .where(eq(importJob.id, id))
              .returning();
            await record(tx, audit, id, "issue_reviewed", {
              issueId,
              issueVersion: issue.version,
              decision: input.decision,
            });
            return { status: 200, body: await detail(tx, updated) };
          },
        )
      ).body as ImportDetail;
    });
  }
  async function apply(actor: ImportActor, id: string, write: ImportWrite) {
    const source = await mappingTransaction(
      database,
      async (tx) => {
        const ctx = await authorize(tx, actor);
        return (await scopedJob(tx, ctx, id)).job;
      },
      false,
    );
    let bytes: Buffer;
    try {
      if (!source.objectVersionId) throw new Error("Missing pinned version");
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
      throw new AppError(
        "IMPORT_SOURCE_CONFLICT",
        409,
        "The stored source does not match its immutable hash and byte count.",
      );
    return mappingTransaction(database, async (tx) => {
      const ctx = await authorize(tx, actor),
        { job, target } = await scopedJob(tx, ctx, id, true),
        audit = mutation(actor, ctx.companyId);
      return (
        await withIdempotency(
          tx,
          audit,
          "import.apply",
          write.idempotencyKey,
          canonicalJsonHash({
            id,
            sourceChecksum: job.sourceChecksum,
            expectedVersion: write.expectedVersion,
          }),
          async () => {
            if (job.version !== write.expectedVersion) throw stale();
            const current = await detail(tx, job);
            if (!canApplyImport(current))
              throw new AppError(
                "IMPORT_NOT_APPLICABLE",
                409,
                "Validate and correct all blocking source issues before applying.",
              );
            if (
              (job.summary as { targetModelVersion: number })
                ?.targetModelVersion !== target.model.version
            )
              throw stale();
            if (
              (
                await validationProblems(
                  tx,
                  job,
                  target,
                  (await jobRows(tx, id)).map(rowValue),
                )
              ).length
            )
              throw new AppError(
                "IMPORT_VALIDATION_CHANGED",
                409,
                "The draft source changed. Validate again before applying.",
              );
            await tx
              .update(importJob)
              .set({ state: "applying" })
              .where(eq(importJob.id, id));
            await applyGraph(tx, job);
            const [updated] = await tx
              .update(importJob)
              .set({
                state: "applied",
                appliedAt: now(),
                version: sql`${importJob.version}+1`,
                updatedAt: now(),
              })
              .where(eq(importJob.id, id))
              .returning();
            await record(tx, audit, id, "applied", {
              sourceChecksum: job.sourceChecksum,
              version: updated.version,
            });
            return { status: 200, body: await detail(tx, updated) };
          },
        )
      ).body as ImportDetail;
    });
  }
  return { preflight, stage, read, validate, review, apply };
}
