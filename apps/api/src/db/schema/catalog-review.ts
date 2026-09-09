import { sql } from "drizzle-orm";
import {
  check,
  foreignKey,
  integer,
  jsonb,
  pgTable,
  text,
  unique,
  uuid,
} from "drizzle-orm/pg-core";
import { id, time } from "./common.js";
import { appUser } from "./identity.js";
import { importIssue, importJob, importStagingRow } from "./operations.js";
import type { ReviewedAssemblyFields } from "../../modules/imports/normalizer.js";
import { figure } from "./catalog.js";
import {
  publicationRelease,
  releaseFigure,
  releaseFigurePart,
} from "./releases.js";

export type DepictionProvenance = {
  decisionId: string;
  mode: "table-only" | "not-depicted" | "assembly-reference-unspecified";
  rowIds: string[];
  sourceBindingSha256: string;
  source: Record<string, unknown>;
  reviewerId: string;
  reviewerName: string;
  reviewedAt: string;
  evidence: string;
  quantityDecisionId: string | null;
};

export const importQuantityReview = pgTable(
  "import_quantity_review",
  {
    id: id(),
    jobId: uuid("job_id")
      .notNull()
      .references(() => importJob.id),
    stagingRowId: uuid("staging_row_id").notNull(),
    stagingRowVersion: integer("staging_row_version").notNull(),
    issueId: uuid("issue_id")
      .notNull()
      .references(() => importIssue.id),
    issueVersion: integer("issue_version").notNull(),
    sourceBindingSha256: text("source_binding_sha256").notNull(),
    source: jsonb("source").notNull(),
    interpretedFields: jsonb("interpreted_fields")
      .$type<ReviewedAssemblyFields>()
      .notNull(),
    actorId: uuid("actor_id")
      .notNull()
      .references(() => appUser.id),
    reviewerName: text("reviewer_name").notNull(),
    reviewedAt: time("reviewed_at").notNull(),
    evidence: text("evidence").notNull(),
  },
  (t) => [
    unique("quantity_review_issue_version").on(t.issueId, t.issueVersion),
    foreignKey({
      columns: [t.stagingRowId, t.jobId],
      foreignColumns: [importStagingRow.id, importStagingRow.jobId],
    }),
    check(
      "quantity_review_valid",
      sql`${t.stagingRowVersion}>0 AND ${t.issueVersion}>0 AND ${t.sourceBindingSha256} ~ '^[a-f0-9]{64}$' AND length(btrim(${t.reviewerName}))>0 AND length(btrim(${t.evidence})) BETWEEN 10 AND 4000 AND ${t.interpretedFields}->>'quantitySemantics'='unspecified-installed' AND ${t.interpretedFields}->'qty'='null'::jsonb`,
    ),
  ],
);

export const catalogDepictionReview = pgTable(
  "catalog_depiction_review",
  {
    id: id(),
    figureId: uuid("figure_id")
      .notNull()
      .references(() => figure.id),
    reviewVersion: integer("review_version").notNull(),
    sourceBindingSha256: text("source_binding_sha256").notNull(),
    source: jsonb("source").$type<Record<string, unknown>>().notNull(),
    mode: text("mode", {
      enum: ["table-only", "not-depicted", "assembly-reference-unspecified"],
    }).notNull(),
    rowIds: jsonb("row_ids").$type<string[]>().notNull(),
    quantityDecisionId: uuid("quantity_decision_id").references(
      () => importQuantityReview.id,
    ),
    actorId: uuid("actor_id")
      .notNull()
      .references(() => appUser.id),
    reviewerName: text("reviewer_name").notNull(),
    reviewedAt: time("reviewed_at").notNull(),
    evidence: text("evidence").notNull(),
  },
  (t) => [
    unique("depiction_review_version").on(t.figureId, t.reviewVersion),
    check(
      "depiction_review_valid",
      sql`${t.reviewVersion}>0 AND ${t.sourceBindingSha256} ~ '^[a-f0-9]{64}$' AND ${t.mode} IN ('table-only','not-depicted','assembly-reference-unspecified') AND jsonb_typeof(${t.rowIds})='array' AND jsonb_array_length(${t.rowIds})>0 AND length(btrim(${t.reviewerName}))>0 AND length(btrim(${t.evidence})) BETWEEN 10 AND 4000 AND ((${t.mode}='assembly-reference-unspecified')=(${t.quantityDecisionId} IS NOT NULL))`,
    ),
  ],
);
export const releaseDepictionReview = pgTable(
  "release_depiction_review",
  {
    releaseId: uuid("release_id")
      .notNull()
      .references(() => publicationRelease.id),
    id: id(),
    figureId: uuid("figure_id").notNull(),
    rowIds: jsonb("row_ids").$type<string[]>().notNull(),
    provenance: jsonb("provenance").$type<DepictionProvenance>().notNull(),
    checksum: text("checksum").notNull(),
  },
  (t) => [
    unique("release_depiction_identity").on(t.releaseId, t.id),
    foreignKey({
      columns: [t.releaseId, t.figureId],
      foreignColumns: [releaseFigure.releaseId, releaseFigure.id],
    }),
    check("release_depiction_checksum", sql`${t.checksum} ~ '^[a-f0-9]{64}$'`),
  ],
);
export const releaseSourceReference = pgTable(
  "release_source_reference",
  {
    releaseId: uuid("release_id")
      .notNull()
      .references(() => publicationRelease.id),
    id: id(),
    figureId: uuid("figure_id").notNull(),
    figurePartId: uuid("figure_part_id").notNull(),
    decisionId: uuid("decision_id").notNull(),
    number: text("number").notNull(),
    sourceCalloutId: uuid("source_callout_id"),
  },
  (t) => [
    foreignKey({
      columns: [t.releaseId, t.figurePartId, t.figureId],
      foreignColumns: [
        releaseFigurePart.releaseId,
        releaseFigurePart.id,
        releaseFigurePart.figureId,
      ],
    }),
    foreignKey({
      columns: [t.releaseId, t.decisionId],
      foreignColumns: [
        releaseDepictionReview.releaseId,
        releaseDepictionReview.id,
      ],
    }),
  ],
);
