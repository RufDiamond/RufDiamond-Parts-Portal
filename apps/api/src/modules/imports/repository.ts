import { and, desc, eq, inArray, ne, sql } from "drizzle-orm";
import type { ImportDetail, ImportUploadMetadata } from "@rufdiamond/contracts";
import type { Transaction } from "../../db/client.js";
import {
  callout,
  diagramMapping,
  figure,
  figurePart,
  importIssue,
  importJob,
  importQuantityReview,
  importSourceAlias,
  importStagingRow,
  model,
  modelSystem,
  part,
  partRequires,
  system,
  variant,
} from "../../db/schema/index.js";
import type { AuthorizationContext } from "../authorization/types.js";
import { AppError } from "../../plugins/error-handler.js";
import { canonicalJsonHash } from "../outbox/idempotency.js";
import type {
  ImportProblem,
  ImportRow,
  AppliedImportRow,
  NormalizedImportFields,
} from "./normalizer.js";
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export type StoredJob = typeof importJob.$inferSelect;
export function missing(): never {
  throw new AppError(
    "IMPORT_NOT_FOUND",
    404,
    "The requested import or target was not found.",
  );
}
export async function targetScope(
  tx: Transaction,
  ctx: AuthorizationContext,
  modelId: string,
  variantId: string,
  lock = false,
) {
  if (!uuid.test(modelId) || !uuid.test(variantId)) missing();
  const [target] = await tx
    .select({ model, variant })
    .from(variant)
    .innerJoin(model, eq(variant.modelId, model.id))
    .where(
      and(
        eq(model.id, modelId),
        eq(variant.id, variantId),
        ctx.brandIds === "all"
          ? undefined
          : inArray(model.productLineId, [...ctx.brandIds]),
        ctx.variantIds === "all"
          ? undefined
          : inArray(variant.id, [...ctx.variantIds]),
      ),
    );
  if (!target) missing();
  if (lock) {
    await tx
      .select({ id: model.id })
      .from(model)
      .where(eq(model.id, modelId))
      .for("update");
    await tx
      .select({ id: variant.id })
      .from(variant)
      .where(eq(variant.id, variantId))
      .for("share");
  }
  return target;
}
export async function scopedJob(
  tx: Transaction,
  ctx: AuthorizationContext,
  id: string,
  lock = false,
) {
  if (!uuid.test(id)) missing();
  const [job] = await tx
    .select({ job: importJob })
    .from(importJob)
    .innerJoin(model, eq(importJob.modelId, model.id))
    .where(
      and(
        eq(importJob.id, id),
        ctx.brandIds === "all"
          ? undefined
          : inArray(model.productLineId, [...ctx.brandIds]),
        ctx.variantIds === "all"
          ? undefined
          : inArray(importJob.variantId, [...ctx.variantIds]),
      ),
    );
  if (!job) missing();
  const target = await targetScope(
    tx,
    ctx,
    job.job.modelId,
    job.job.variantId,
    lock,
  );
  if (lock)
    await tx
      .select({ id: importJob.id })
      .from(importJob)
      .where(eq(importJob.id, id))
      .for("update");
  return { job: job.job, target };
}
export async function jobRows(tx: Transaction, jobId: string) {
  return tx
    .select()
    .from(importStagingRow)
    .where(eq(importStagingRow.jobId, jobId))
    .orderBy(importStagingRow.rowNumber);
}
export function rowValue(row: typeof importStagingRow.$inferSelect): ImportRow {
  return row.normalizedFields as ImportRow;
}
export async function detail(
  tx: Transaction,
  job: StoredJob,
): Promise<ImportDetail> {
  if (!job.sourceKind || !job.format || !job.lineageKey)
    throw new AppError(
      "LEGACY_IMPORT_UNAVAILABLE",
      409,
      "This historical job lacks the source lineage needed for this workflow.",
    );
  const rows = await jobRows(tx, job.id),
    issues = await tx
      .select()
      .from(importIssue)
      .where(eq(importIssue.jobId, job.id))
      .orderBy(importIssue.id),
    aliases = await tx
      .select()
      .from(importSourceAlias)
      .where(eq(importSourceAlias.jobId, job.id));
  const interpretations = await tx.select().from(importQuantityReview).where(eq(importQuantityReview.jobId,job.id));
  return {
    id: job.id,
    state: job.state,
    version: job.version,
    modelId: job.modelId,
    variantId: job.variantId,
    sourceChecksum: job.sourceChecksum,
    sourceKind: job.sourceKind,
    format: job.format,
    lineageKey: job.lineageKey,
    rowCount: rows.length,
    validRowCount: rows.filter(
      (row) => rowValue(row).normalizationState === "valid",
    ).length,
    blockingIssueCount: issues.filter((i) => i.severity === "error" && !interpretations.some(r=>r.issueId===i.id && r.issueVersion===i.version && r.stagingRowId===i.stagingRowId)).length,
    issues: issues.map((issue) => ({
      id: issue.id,
      version: issue.version,
      sourceRowKey:
        rows.find((r) => r.id === issue.stagingRowId)?.sourceRowKey ?? null,
      severity: issue.severity,
      code: issue.code,
      field: issue.field,
      message: issue.message,
      reviewedBy: issue.resolvedByUserId,
      reviewedAt: issue.resolvedAt?.toISOString() ?? null,
    })),
    aliases: aliases.map((alias) => {
      const row = rows.find((r) => r.id === alias.stagingRowId)!;
      return {
        sourceRowKey: row.sourceRowKey,
        identityKey: alias.identityKey,
        figureKey: alias.figureKey,
        figureId: alias.figureId,
        figurePartId: alias.figurePartId,
        partNumber: rowValue(row).fields?.partNumber ?? interpretations.find(r=>r.stagingRowId===row.id)!.interpretedFields.partNumber,
        calloutId: alias.calloutId,
        refNo: rowValue(row).fields?.pnc ?? interpretations.find(r=>r.stagingRowId===row.id)?.interpretedFields.pnc ?? null,
      };
    }),
  };
}
export async function latestLineage(tx: Transaction, job: StoredJob) {
  const [previous] = await tx
    .select()
    .from(importJob)
    .where(
      and(
        eq(importJob.variantId, job.variantId),
        eq(importJob.lineageKey, job.lineageKey!),
        eq(importJob.state, "applied"),
        ne(importJob.id, job.id),
      ),
    )
    .orderBy(desc(importJob.appliedAt), desc(importJob.createdAt))
    .limit(1);
  if (!previous) return [];
  return tx
    .select({ alias: importSourceAlias, row: importStagingRow })
    .from(importSourceAlias)
    .innerJoin(
      importStagingRow,
      eq(importSourceAlias.stagingRowId, importStagingRow.id),
    )
    .where(eq(importSourceAlias.jobId, previous.id));
}
const partValues = (
  fields: Pick<
    NormalizedImportFields,
    "description" | "manufacturer" | "listPrice" | "currency"
  >,
) => ({
  description: fields.description,
  manufacturer: fields.manufacturer,
  listPrice: fields.listPrice,
  currency: fields.currency,
});
export async function validationProblems(
  tx: Transaction,
  job: StoredJob,
  target: Awaited<ReturnType<typeof targetScope>>,
  rows: AppliedImportRow[],
): Promise<ImportProblem[]> {
  const problems: ImportProblem[] = [];
  const add = (
    row: AppliedImportRow,
    code: string,
    message: string,
    field: string | null = null,
  ) =>
    problems.push({
      sourceRowKey: row.sourceRowKey,
      severity: "error",
      code,
      message,
      field,
    });
  const parts = await tx
      .select()
      .from(part)
      .where(
        inArray(
          part.normalizedPartNumber,
          rows.flatMap((r) =>
            r.fields
              ? [r.fields.partNumber, ...r.hints.map((h) => h.partNumber)]
              : [],
          ),
        ),
      ),
    prior = await latestLineage(tx, job);
  const existingFigures = await tx
    .select()
    .from(figure)
    .where(eq(figure.variantId, job.variantId));
  const byPart = new Map<string, string>(),
    groups = new Map<string, Set<string>>();
  const requiredQuantities = new Map<string, Set<number>>();
  for (const row of rows) {
    if (!row.fields) continue;
    for (const hint of row.hints) {
      const key = canonicalJsonHash([row.fields.partNumber, hint.partNumber]);
      const quantities = requiredQuantities.get(key) ?? new Set<number>();
      quantities.add(hint.qty);
      requiredQuantities.set(key, quantities);
    }
  }
  for (const row of rows) {
    const f = row.fields;
    if (!f) continue;
    if (
      existingFigures.some(
        (existing) =>
          existing.name.trim().toLowerCase() === f.figureName.toLowerCase() &&
          existing.groupNo === f.groupNo &&
          existing.sourceKey !== `import:${job.lineageKey}:${row.figureKey}`,
      )
    )
      add(
        row,
        "FIGURE_LINEAGE_CONFLICT",
        "An existing figure has this source identity under another lineage. Reconcile aliases before importing.",
      );
    if (
      f.model.toLowerCase() !== target.model.name.toLowerCase() ||
      f.variant.toLowerCase() !== target.variant.label.toLowerCase()
    )
      add(
        row,
        "TARGET_LABEL_MISMATCH",
        "Source model or variant does not match the explicitly selected target.",
      );
    const value = canonicalJsonHash(partValues(f)),
      previous = byPart.get(f.partNumber);
    if (previous && previous !== value)
      add(
        row,
        "GLOBAL_PART_CONFLICT",
        "Source rows disagree on shared global part fields.",
      );
    byPart.set(f.partNumber, value);
    const existing = parts.find((p) => p.normalizedPartNumber === f.partNumber);
    if (
      existing &&
      canonicalJsonHash(
        partValues(
          existing as Pick<
            NormalizedImportFields,
            "description" | "manufacturer" | "listPrice" | "currency"
          >,
        ),
      ) !== value
    )
      add(
        row,
        "GLOBAL_PART_CONFLICT",
        "Existing global part fields differ; a separately authorized source correction is required.",
      );
    if (f.groupNo) {
      const names = groups.get(f.groupNo) ?? new Set<string>();
      names.add(row.figureKey);
      groups.set(f.groupNo, names);
    }
    for (const hint of row.hints) {
      if (requiredQuantities.get(canonicalJsonHash([f.partNumber, hint.partNumber]))!.size > 1)
        add(
          row,
          "GLOBAL_RELATIONSHIP_CONFLICT",
          "Source rows disagree on the quantity of a shared required-part relationship; source review is required.",
          "REMARKS",
        );
      const required =
        rows.find((r) => r.fields?.partNumber === hint.partNumber) ??
        parts.find((p) => p.normalizedPartNumber === hint.partNumber);
      if (!required || hint.partNumber === f.partNumber)
        add(
          row,
          "REQUIRED_PART_UNRESOLVED",
          "A required-part hint needs an exact valid target before import.",
          "REMARKS",
        );
      if (existing) {
        const requiredPart = parts.find(
          (p) => p.normalizedPartNumber === hint.partNumber,
        );
        const [edge] = requiredPart
          ? await tx
              .select()
              .from(partRequires)
              .where(
                and(
                  eq(partRequires.partId, existing.id),
                  eq(partRequires.requiredPartId, requiredPart.id),
                ),
              )
          : [];
        if (!edge || edge.qty !== hint.qty)
          add(
            row,
            "GLOBAL_RELATIONSHIP_CONFLICT",
            "A new or changed relationship on an existing global part needs separate review.",
            "REMARKS",
          );
      }
    }
  }
  for (const row of rows)
    if (row.fields?.groupNo && (groups.get(row.fields.groupNo)?.size ?? 0) > 1)
      add(
        row,
        "GROUP_LABEL_CONFLICT",
        "The source group number names multiple figures; preserve separate identities pending source review.",
        "GROUPNO",
      );
  for (const previous of prior)
    if (!rows.some((row) => row.identityKey === previous.alias.identityKey))
      problems.push({
        sourceRowKey: "",
        code: "MISSING_OR_CHANGED_SOURCE_KEY",
        field: null,
        severity: "error",
        message:
          "A prior source identity is missing or changed ambiguously. Existing draft rows and history are retained.",
      });
  return problems;
}
export async function persistProblems(
  tx: Transaction,
  jobId: string,
  problems: ImportProblem[],
) {
  const rows = await jobRows(tx, jobId),
    existing = await tx
      .select()
      .from(importIssue)
      .where(eq(importIssue.jobId, jobId));
  for (const problem of problems) {
    const stagingRowId =
      rows.find((r) => r.sourceRowKey === problem.sourceRowKey)?.id ?? null;
    if (
      existing.some(
        (i) =>
          i.code === problem.code &&
          i.stagingRowId === stagingRowId &&
          i.field === problem.field,
      )
    )
      continue;
    await tx
      .insert(importIssue)
      .values({
        jobId,
        stagingRowId,
        severity: problem.severity,
        code: problem.code,
        field: problem.field,
        message: problem.message,
      });
  }
}
export function sameSource(job: StoredJob, input: ImportUploadMetadata) {
  return (
    job.lineageKey === input.lineageKey &&
    job.sourceKind === input.sourceKind &&
    job.format === input.format &&
    job.filename === input.filename &&
    job.modelId === input.modelId
  );
}

/** Called only under target-model serializable lock after all source issues are checked. */
export async function applyGraph(tx: Transaction, job: StoredJob, effectiveRows?: AppliedImportRow[]) {
  const staged = await jobRows(tx, job.id),
    prior = await latestLineage(tx, job);
  let changed = false;
  const figures = new Map<string, typeof figure.$inferSelect>(),
    parts = new Map<string, typeof part.$inferSelect>(),
    newParts = new Set<string>();
  for (const stored of staged) {
    const row = effectiveRows?.find(r=>r.sourceRowKey===stored.sourceRowKey) ?? rowValue(stored),
      f = row.fields;
    if (!f)
      throw new AppError(
        "INVALID_IMPORT_ROW",
        409,
        "A source row has no valid normalized fields.",
      );
    let p = parts.get(f.partNumber);
    if (!p) {
      [p] = await tx
        .select()
        .from(part)
        .where(eq(part.normalizedPartNumber, f.partNumber));
      if (!p) {
        [p] = await tx
          .insert(part)
          .values({
            partNumber: f.partNumber,
            normalizedPartNumber: f.partNumber,
            ...partValues(f),
          })
          .returning();
        newParts.add(p.id);
        changed = true;
      }
      parts.set(f.partNumber, p);
    }
    let fig = figures.get(row.figureKey);
    if (!fig) {
      const sourceKey = `import:${job.lineageKey}:${row.figureKey}`;
      [fig] = await tx
        .select()
        .from(figure)
        .where(
          and(
            eq(figure.variantId, job.variantId),
            eq(figure.sourceKey, sourceKey),
          ),
        );
      if (!fig) {
        let [s] = await tx
          .select()
          .from(system)
          .where(eq(system.normalizedName, f.system.toLowerCase()));
        if (!s)
          [s] = await tx
            .insert(system)
            .values({ name: f.system, normalizedName: f.system.toLowerCase() })
            .onConflictDoNothing()
            .returning();
        if (!s)
          [s] = await tx
            .select()
            .from(system)
            .where(eq(system.normalizedName, f.system.toLowerCase()));
        await tx
          .insert(modelSystem)
          .values({ modelId: job.modelId, systemId: s.id })
          .onConflictDoNothing();
        [fig] = await tx
          .insert(figure)
          .values({
            variantId: job.variantId,
            systemId: s.id,
            name: f.figureName,
            groupNo: f.groupNo,
            sourceKey,
          })
          .returning();
        await tx.insert(diagramMapping).values({ figureId: fig.id });
        changed = true;
      }
      figures.set(row.figureKey, fig);
    }
    const previous = prior.find((p) => p.alias.identityKey === row.identityKey);
    let rowId: string,
      calloutId: string | null = null;
    if (previous) {
      rowId = previous.alias.figurePartId;
      calloutId = previous.alias.calloutId;
      if (rowValue(previous.row).contentHash !== row.contentHash) {
        await tx
          .update(figurePart)
          .set({
            qty: f.qty,
            quantitySemantics: "quantitySemantics" in f ? f.quantitySemantics : "known",
            remarks: f.remarks,
            serviceable: f.serviceable,
            effectiveFrom: f.effectiveFrom,
            effectiveTo: f.effectiveTo,
            version: sql`${figurePart.version}+1`,
            updatedAt: new Date(),
          })
          .where(
            and(eq(figurePart.id, rowId), eq(figurePart.figureId, fig.id)),
          );
        changed = true;
      }
    } else {
      const [fp] = await tx
        .insert(figurePart)
        .values({
          figureId: fig.id,
          partId: p.id,
          sourceRowKey: row.identityKey,
          qty: f.qty,
          quantitySemantics: "quantitySemantics" in f ? f.quantitySemantics : "known",
          remarks: f.remarks,
          serviceable: f.serviceable,
          effectiveFrom: f.effectiveFrom,
          effectiveTo: f.effectiveTo,
        })
        .returning({ id: figurePart.id });
      rowId = fp.id;
      if (f.pnc && f.pnc !== "-") {
        const [c] = await tx
          .insert(callout)
          .values({
            figureId: fig.id,
            figurePartId: rowId,
            sourceKey: row.identityKey,
            number: f.pnc,
            x: null,
            y: null,
          })
          .returning({ id: callout.id });
        calloutId = c.id;
      }
      changed = true;
    }
    await tx
      .insert(importSourceAlias)
      .values({
        jobId: job.id,
        stagingRowId: stored.id,
        identityKey: row.identityKey,
        figureKey: row.figureKey,
        figureId: fig.id,
        figurePartId: rowId,
        calloutId,
      });
  }
  for (const stored of staged) {
    const row = effectiveRows?.find(r=>r.sourceRowKey===stored.sourceRowKey) ?? rowValue(stored),
      p = parts.get(row.fields!.partNumber)!;
    if (!newParts.has(p.id)) continue;
    for (const hint of row.hints) {
      let required = parts.get(hint.partNumber);
      if (!required)
        [required] = await tx
          .select()
          .from(part)
          .where(eq(part.normalizedPartNumber, hint.partNumber));
      if (!required)
        throw new AppError(
          "REQUIRED_PART_UNRESOLVED",
          409,
          "A required source part is unresolved.",
        );
      await tx
        .insert(partRequires)
        .values({
          partId: p.id,
          requiredPartId: required.id,
          qty: hint.qty,
          reviewState: "pending",
          provenance: {
            jobId: job.id,
            sourceChecksum: job.sourceChecksum,
            sourceRowKey: row.sourceRowKey,
            literal: hint.literal,
          },
        })
        .onConflictDoNothing();
    }
  }
  if (changed)
    await tx
      .update(model)
      .set({ version: sql`${model.version}+1`, updatedAt: new Date() })
      .where(eq(model.id, job.modelId));
}
