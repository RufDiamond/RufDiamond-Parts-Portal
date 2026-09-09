import type { DiagramMappingDocument } from "@rufdiamond/contracts";
import { sql } from "drizzle-orm";
import { check, foreignKey, integer, jsonb, pgTable, text, unique, uuid, type AnyPgColumn } from "drizzle-orm/pg-core";

import { drawingFile, figure } from "./catalog.js";
import { checksumCheck, id, time } from "./common.js";
import { appUser } from "./identity.js";

export const diagramMappingRevision = pgTable("diagram_mapping_revision", {
  id: id(),
  headId: uuid("head_id").notNull().references((): AnyPgColumn => diagramMapping.id),
  revision: integer("revision").notNull(),
  document: jsonb("document").$type<DiagramMappingDocument>().notNull(),
  drawingFileId: uuid("drawing_file_id").notNull().references(() => drawingFile.id),
  drawingSha256: text("drawing_sha256").notNull(),
  imageWidth: integer("image_width").notNull(),
  imageHeight: integer("image_height").notNull(),
  catalogueBindingSha256: text("catalogue_binding_sha256").notNull(),
  documentChecksum: text("document_checksum").notNull(),
  createdByUserId: uuid("created_by_user_id").notNull().references(() => appUser.id),
  createdAt: time("created_at").notNull().defaultNow(),
}, t => [
  unique("diagram_mapping_revision_number").on(t.headId, t.revision),
  unique("diagram_mapping_revision_head_identity").on(t.headId, t.id),
  unique("diagram_mapping_revision_checksum_identity").on(t.id, t.documentChecksum),
  check("diagram_mapping_revision_positive", sql`${t.revision} > 0`),
  check("diagram_mapping_revision_document_object", sql`jsonb_typeof(${t.document}) = 'object'`),
  check("diagram_mapping_revision_dimensions", sql`${t.imageWidth} > 0 AND ${t.imageHeight} > 0`),
  check("diagram_mapping_revision_drawing_checksum", sql`${t.drawingSha256} ~ '^[a-f0-9]{64}$'`),
  check("diagram_mapping_revision_catalogue_checksum", sql`${t.catalogueBindingSha256} ~ '^[a-f0-9]{64}$'`),
  check("diagram_mapping_revision_document_checksum", sql`${t.documentChecksum} ~ '^[a-f0-9]{64}$'`),
]);

export const diagramMapping = pgTable("diagram_mapping", {
  id: id(),
  figureId: uuid("figure_id").notNull().references(() => figure.id),
  version: integer("version").notNull().default(1),
  sourceReviewVersion: integer("source_review_version").notNull().default(1),
  currentRevisionId: uuid("current_revision_id"),
}, t => [
  unique("diagram_mapping_figure").on(t.figureId),
  foreignKey({
    name: "diagram_mapping_current_revision_same_head",
    columns: [t.id, t.currentRevisionId],
    foreignColumns: [diagramMappingRevision.headId, diagramMappingRevision.id],
  }),
  check("diagram_mapping_version_positive", sql`${t.version} > 0`),
  check("diagram_mapping_representable_state", sql`(${t.version} = 1 AND ${t.currentRevisionId} IS NULL) OR (${t.version} > 1 AND ${t.currentRevisionId} IS NOT NULL)`),
]);

export const diagramMappingApproval = pgTable("diagram_mapping_approval", {
  revisionId: uuid("revision_id").primaryKey(),
  documentChecksum: text("document_checksum").notNull(),
  reviewedByUserId: uuid("reviewed_by_user_id").notNull().references(() => appUser.id),
  reviewedAt: time("reviewed_at").notNull().defaultNow(),
}, t => [
  foreignKey({
    name: "diagram_mapping_approval_revision_checksum",
    columns: [t.revisionId, t.documentChecksum],
    foreignColumns: [diagramMappingRevision.id, diagramMappingRevision.documentChecksum],
  }),
  checksumCheck(t.documentChecksum),
]);
