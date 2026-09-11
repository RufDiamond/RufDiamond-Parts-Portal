import type * as s from "../../db/schema/index.js";
import { canonicalJsonHash } from "../outbox/idempotency.js";
import { AppError } from "../../plugins/error-handler.js";

type Row = typeof s.releaseFigurePart.$inferSelect;
type Figure = typeof s.releaseFigure.$inferSelect;
type Review = typeof s.releaseDepictionReview.$inferSelect;
type Ref = typeof s.releaseSourceReference.$inferSelect;
const invalid = (): never => {
  throw new AppError(
    "RELEASE_INCOMPLETE",
    422,
    "The sealed snapshot source reviews are incomplete or inconsistent.",
  );
};
const sameSet = (a: string[], b: string[]) =>
  a.length === b.length &&
  new Set(a).size === a.length &&
  a.every((x) => b.includes(x));
/** Pure same-release validation. Never consults current users, working rows or imports. */
export function validateSnapshotReviews(
  figures: Figure[],
  rows: Row[],
  reviews: Review[],
  refs: Ref[],
) {
  const excluded = new Set<string>(),
    tableOnly = new Set<string>(),
    assembly = new Set<string>();
  for (const review of reviews) {
    const p = review.provenance,
      figure = figures.find((f) => f.id === review.figureId) ?? invalid(),
      figureRows = rows.filter((r) => r.figureId === review.figureId);
    if (
      !figure ||
      !p ||
      !p.source ||
      !p.reviewerName?.trim() ||
      !p.reviewerId ||
      !p.reviewedAt ||
      !Number.isFinite(Date.parse(p.reviewedAt)) ||
      !p.evidence ||
      p.evidence.trim().length < 10 ||
      !Array.isArray(p.rowIds) ||
      !Array.isArray(review.rowIds) ||
      !review.rowIds.length ||
      canonicalJsonHash({ provenance: p, rowIds: review.rowIds }) !==
        review.checksum ||
      canonicalJsonHash(p.source) !== p.sourceBindingSha256
    )
      invalid();
    const selected = review.rowIds.map(
      (id) => figureRows.find((r) => r.id === id) ?? invalid(),
    );
    if (
      !sameSet(
        selected.map((r) => r.workingId),
        p.rowIds,
      )
    )
      invalid();
    const sourceRows = p.source.rows as Array<{
        id: string;
        qty: number | null;
        quantitySemantics: string;
      }>,
      sourceFigure = p.source.figure as { id: string },
      sourceAliases = p.source.aliases as Array<{
        figurePartId: string;
        reference: string | null;
        identityKey: string;
        sourceChecksum: string;
        jobId: string;
        stagingRowId: string;
        objectKey: string;
        objectVersionId: string;
        contentHash: string;
        raw: Record<string, unknown>;
      }>,
      observations = p.source.observations as Array<{
        id: string;
        figurePartId: string;
        number: string;
      }>;
    if (
      !Array.isArray(sourceRows) ||
      !Array.isArray(sourceAliases) ||
      !Array.isArray(observations) ||
      sourceFigure?.id !== figure.workingId ||
      !sameSet(
        sourceRows.map((r) => r.id),
        figureRows.map((r) => r.workingId),
      ) ||
      !sameSet(
        sourceAliases.map((a) => a.figurePartId),
        figureRows.map((r) => r.workingId),
      )
    )
      invalid();
    for (const r of figureRows) {
      const source = sourceRows.find((v) => v.id === r.workingId)!;
      if (
        source.qty !== r.qty ||
        source.quantitySemantics !== r.quantitySemantics
      )
        invalid();
    }
    for (const a of sourceAliases)
      if (
        !a.jobId ||
        !a.stagingRowId ||
        !a.objectKey ||
        !a.objectVersionId ||
        !a.raw ||
        !/^[a-f0-9]{64}$/.test(a.sourceChecksum) ||
        !/^[a-f0-9]{64}$/.test(a.contentHash)
      )
        invalid();
    if (p.mode === "table-only") {
      if (
        figure.depictionMode !== "table-only" ||
        figure.drawingId !== null ||
        observations.some(
          (o) => !figureRows.some((r) => r.workingId === o.figurePartId),
        ) ||
        !sameSet(
          review.rowIds,
          figureRows.map((r) => r.id),
        )
      )
        invalid();
      tableOnly.add(figure.id);
    } else if (p.mode === "assembly-reference-unspecified") {
      if (
        !p.quantityDecisionId ||
        selected.length !== 1 ||
        selected.some(
          (r) =>
            r.qty !== null || r.quantitySemantics !== "unspecified-installed",
        )
      )
        invalid();
      selected.forEach((r) => assembly.add(r.id));
    } else if (p.mode !== "not-depicted") invalid();
    selected.forEach((r) => excluded.add(r.id));
  }
  for (const row of rows) {
    if (
      row.quantitySemantics === "unspecified-installed" &&
      !assembly.has(row.id)
    )
      invalid();
    if (excluded.has(row.id)) {
      const matching = refs.filter((ref) => ref.figurePartId === row.id);
      if (!matching.length) invalid();
      for (const ref of matching) {
        const review = reviews.find(
          (r) =>
            r.id === ref.decisionId &&
            r.figureId === row.figureId &&
            r.rowIds.includes(row.id),
        );
        if (!review) invalid();
        const p = review!.provenance,
          observations = p.source.observations as Array<{
            id: string;
            figurePartId: string;
            number: string;
          }>;
        const sourceRefs = observations.filter(
          (o) => o.figurePartId === row.workingId,
        );
        if (sourceRefs.length) {
          if (
            new Set(matching.map((m) => m.sourceCalloutId)).size !==
              matching.length ||
            !sourceRefs.some(
              (o) => o.id === ref.sourceCalloutId && o.number === ref.number,
            ) ||
            sourceRefs.length !== matching.length
          )
            invalid();
        } else {
          const aliases = p.source.aliases as Array<{
            figurePartId: string;
            reference: string | null;
          }>;
          const a = aliases.find((a) => a.figurePartId === row.workingId);
          if (
            !a ||
            ref.sourceCalloutId !== null ||
            ref.number !== (a.reference ?? "") ||
            matching.length !== 1
          )
            invalid();
        }
      }
    }
  }
  if (
    refs.some(
      (ref) =>
        !excluded.has(ref.figurePartId) ||
        !rows.some(
          (r) => r.id === ref.figurePartId && r.figureId === ref.figureId,
        ),
    )
  )
    invalid();
  if (
    figures.some(
      (f) => f.depictionMode === "table-only" && !tableOnly.has(f.id),
    )
  )
    invalid();
  return { excluded, tableOnly };
}
