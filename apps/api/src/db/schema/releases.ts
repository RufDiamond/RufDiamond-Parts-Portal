import { sql } from "drizzle-orm";
import { bigint, boolean, check, date, foreignKey, integer, numeric, pgTable, primaryKey, text, unique, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { model } from "./catalog.js";
import { appUser } from "./identity.js";
import { checksumCheck, currencyCheck, id, money, time } from "./common.js";

export const publicationRelease = pgTable("publication_release", {
  id: id(), modelId: uuid("model_id").notNull().references(() => model.id), revision: integer("revision").notNull(),
  status: text("status", { enum: ["building", "active", "inactive"] }).notNull().default("building"), summary: text("summary"),
  createdByUserId: uuid("created_by_user_id").references(() => appUser.id), createdAt: time("created_at").notNull().defaultNow(), publishedAt: time("published_at"), activatedAt: time("activated_at"), sourceChecksum: text("source_checksum").notNull(),
}, t => [unique("release_model_revision").on(t.modelId, t.revision), uniqueIndex("release_one_active_per_model").on(t.modelId).where(sql`${t.status} = 'active'`), checksumCheck(t.sourceChecksum), check("release_revision_positive", sql`${t.revision} > 0`), check("release_state", sql`(${t.status} = 'building' AND ${t.publishedAt} IS NULL) OR (${t.status} IN ('active','inactive') AND ${t.publishedAt} IS NOT NULL)`)]);

const snapshot = () => ({ releaseId: uuid("release_id").notNull().references(() => publicationRelease.id), id: uuid("id").notNull().defaultRandom(), workingId: uuid("working_id").notNull() });

export const releaseDrawing = pgTable("release_drawing", {
  ...snapshot(), objectKey: text("object_key").notNull(), filename: text("filename").notNull(), mediaType: text("media_type").notNull(), bytes: bigint("bytes", { mode: "bigint" }).notNull(),
  sha256: text("sha256").notNull(), width: integer("width"), height: integer("height"), pages: integer("pages"), fileVersion: integer("file_version").notNull().default(1), objectVersionId: text("object_version_id"),
  previewObjectKey: text("preview_object_key"), previewObjectVersionId: text("preview_object_version_id"), previewSha256: text("preview_sha256"),
  previewBytes: bigint("preview_bytes", { mode: "bigint" }), previewWidth: integer("preview_width"), previewHeight: integer("preview_height"),
}, t => [
  primaryKey({ columns: [t.releaseId, t.id] }), unique("release_drawing_source").on(t.releaseId, t.workingId), checksumCheck(t.sha256),
  check("release_drawing_dimensions", sql`${t.bytes} > 0 AND ${t.fileVersion} > 0 AND (${t.width} IS NULL OR ${t.width} > 0) AND (${t.height} IS NULL OR ${t.height} > 0) AND (${t.pages} IS NULL OR ${t.pages} > 0)`),
  check("release_drawing_object_versions", sql`(${t.objectVersionId} IS NULL OR length(btrim(${t.objectVersionId})) > 0) AND (${t.previewObjectVersionId} IS NULL OR length(btrim(${t.previewObjectVersionId})) > 0)`),
  check("release_drawing_preview_metadata", sql`(${t.previewSha256} IS NULL OR ${t.previewSha256} ~ '^[a-f0-9]{64}$') AND (${t.previewBytes} IS NULL OR ${t.previewBytes} > 0) AND (${t.previewWidth} IS NULL OR ${t.previewWidth} > 0) AND (${t.previewHeight} IS NULL OR ${t.previewHeight} > 0)`),
]);

export const releaseModel = pgTable("release_model", {
  ...snapshot(), productLineId: uuid("product_line_id").notNull(), productLineName: text("product_line_name").notNull(), manufacturer: text("manufacturer"), country: text("country"), isDistributed: boolean("is_distributed").notNull().default(false),
  name: text("name").notNull(), status: text("status", { enum: ["active", "legacy", "discontinued"] }).notNull(), sortOrder: integer("sort_order").notNull().default(0), photoDrawingId: uuid("photo_drawing_id"),
}, t => [primaryKey({ columns: [t.releaseId, t.id] }), unique("release_single_model").on(t.releaseId), foreignKey({ columns: [t.releaseId, t.photoDrawingId], foreignColumns: [releaseDrawing.releaseId, releaseDrawing.id] }), check("release_model_lifecycle", sql`${t.status} IN ('active','legacy','discontinued')`)]);

export const releaseVariant = pgTable("release_variant", {
  ...snapshot(), modelId: uuid("model_id").notNull(), label: text("label").notNull(), serialFrom: text("serial_from"), serialTo: text("serial_to"), catalogRevision: text("catalog_revision"),
}, t => [primaryKey({ columns: [t.releaseId, t.id] }), unique("release_variant_source").on(t.releaseId, t.workingId), foreignKey({ columns: [t.releaseId, t.modelId], foreignColumns: [releaseModel.releaseId, releaseModel.id] })]);

export const releaseSystem = pgTable("release_system", {
  ...snapshot(), modelId: uuid("model_id").notNull(), name: text("name").notNull(), sortOrder: integer("sort_order").notNull().default(0),
}, t => [primaryKey({ columns: [t.releaseId, t.id] }), unique("release_system_source").on(t.releaseId, t.workingId), foreignKey({ columns: [t.releaseId, t.modelId], foreignColumns: [releaseModel.releaseId, releaseModel.id] })]);

export const releaseFigure = pgTable("release_figure", {
  ...snapshot(), variantId: uuid("variant_id").notNull(), systemId: uuid("system_id").notNull(), drawingId: uuid("drawing_id").notNull(), name: text("name").notNull(), groupNo: text("group_no"), sourceKey: text("source_key").notNull(), sortOrder: integer("sort_order").notNull().default(0),
}, t => [primaryKey({ columns: [t.releaseId, t.id] }), unique("release_figure_source").on(t.releaseId, t.workingId), foreignKey({ columns: [t.releaseId, t.variantId], foreignColumns: [releaseVariant.releaseId, releaseVariant.id] }), foreignKey({ columns: [t.releaseId, t.systemId], foreignColumns: [releaseSystem.releaseId, releaseSystem.id] }), foreignKey({ columns: [t.releaseId, t.drawingId], foreignColumns: [releaseDrawing.releaseId, releaseDrawing.id] })]);

export const releasePart = pgTable("release_part", {
  ...snapshot(), partNumber: text("part_number").notNull(), description: text("description").notNull(), manufacturer: text("manufacturer"), listPrice: money("list_price"), currency: text("currency").notNull(), supersededByPartId: uuid("superseded_by_part_id"), status: text("status", { enum: ["active", "superseded", "obsolete", "special-order"] }).notNull().default("active"),
}, t => [primaryKey({ columns: [t.releaseId, t.id] }), unique("release_part_source").on(t.releaseId, t.workingId), unique("release_part_id_trace").on(t.releaseId, t.id, t.workingId), currencyCheck(t.currency), check("release_part_price", sql`${t.listPrice} >= 0 AND ${t.listPrice} < 'Infinity'::numeric`), check("release_part_status", sql`${t.status} IN ('active','superseded','obsolete','special-order')`), check("release_part_no_self", sql`${t.supersededByPartId} <> ${t.id}`), foreignKey({ columns: [t.releaseId, t.supersededByPartId], foreignColumns: [t.releaseId, t.id] })]);

export const releasePartRequires = pgTable("release_part_requires", {
  releaseId: uuid("release_id").notNull().references(() => publicationRelease.id), partId: uuid("part_id").notNull(), requiredPartId: uuid("required_part_id").notNull(), qty: integer("qty").notNull(),
}, t => [primaryKey({ columns: [t.releaseId, t.partId, t.requiredPartId] }), foreignKey({ columns: [t.releaseId, t.partId], foreignColumns: [releasePart.releaseId, releasePart.id] }), foreignKey({ columns: [t.releaseId, t.requiredPartId], foreignColumns: [releasePart.releaseId, releasePart.id] }), check("release_requires_no_self", sql`${t.partId} <> ${t.requiredPartId}`), check("release_requires_qty", sql`${t.qty} > 0`)]);

export const releaseFigurePart = pgTable("release_figure_part", {
  ...snapshot(), figureId: uuid("figure_id").notNull(), partId: uuid("part_id").notNull(), sourceRowKey: text("source_row_key").notNull(), qty: integer("qty").notNull(), remarks: text("remarks"), serviceable: boolean("serviceable").notNull().default(true), effectiveFrom: date("effective_from"), effectiveTo: date("effective_to"),
}, t => [primaryKey({ columns: [t.releaseId, t.id] }), unique("release_figure_part_source").on(t.releaseId, t.workingId), unique("release_figure_part_figure").on(t.releaseId, t.id, t.figureId), unique("release_figure_part_row").on(t.releaseId, t.figureId, t.sourceRowKey), foreignKey({ columns: [t.releaseId, t.figureId], foreignColumns: [releaseFigure.releaseId, releaseFigure.id] }), foreignKey({ columns: [t.releaseId, t.partId], foreignColumns: [releasePart.releaseId, releasePart.id] }), check("release_figure_part_qty", sql`${t.qty} > 0`), check("release_figure_part_dates", sql`${t.effectiveTo} >= ${t.effectiveFrom}`)]);

export const releaseCallout = pgTable("release_callout", {
  ...snapshot(), figureId: uuid("figure_id").notNull(), figurePartId: uuid("figure_part_id").notNull(), sourceKey: text("source_key").notNull(), number: text("number").notNull(), x: numeric("x", { precision: 7, scale: 4 }).notNull(), y: numeric("y", { precision: 7, scale: 4 }).notNull(), maskPath: text("mask_path"),
}, t => [primaryKey({ columns: [t.releaseId, t.id] }), unique("release_callout_source").on(t.releaseId, t.workingId), unique("release_callout_row").on(t.releaseId, t.figureId, t.sourceKey), foreignKey({ columns: [t.releaseId, t.figureId], foreignColumns: [releaseFigure.releaseId, releaseFigure.id] }), foreignKey({ name: "release_callout_same_figure", columns: [t.releaseId, t.figurePartId, t.figureId], foreignColumns: [releaseFigurePart.releaseId, releaseFigurePart.id, releaseFigurePart.figureId] }), check("release_callout_coordinates", sql`${t.x} BETWEEN 0 AND 100 AND ${t.y} BETWEEN 0 AND 100`)]);
