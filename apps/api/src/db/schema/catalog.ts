import { sql } from "drizzle-orm";
import { bigint, boolean, check, date, foreignKey, index, integer, jsonb, numeric, pgTable, primaryKey, text, unique, uuid, type AnyPgColumn } from "drizzle-orm/pg-core";
import { checksumCheck, currencyCheck, id, money, mutable, time, versionCheck } from "./common.js";
import { appUser } from "./identity.js";

export const productLine = pgTable("product_line", {
  id: id(), name: text("name").notNull(), normalizedName: text("normalized_name").notNull().unique(),
  manufacturer: text("manufacturer"), country: text("country"), isDistributed: boolean("is_distributed").notNull().default(false), ...mutable(),
}, t => [versionCheck(t), check("product_line_normalized", sql`${t.normalizedName} = lower(btrim(${t.name})) AND ${t.normalizedName} <> ''`)]);

export const drawingFile = pgTable("drawing_file", {
  id: id(), objectKey: text("object_key").notNull().unique(), filename: text("filename").notNull(), mediaType: text("media_type").notNull(),
  bytes: bigint("bytes", { mode: "bigint" }).notNull(), sha256: text("sha256").notNull(), width: integer("width"), height: integer("height"), pages: integer("pages"),
  fileVersion: integer("file_version").notNull().default(1), validationStatus: text("validation_status", { enum: ["pending", "valid", "rejected"] }).notNull().default("pending"),
  validationReport: jsonb("validation_report"), previewObjectKey: text("preview_object_key").unique(),
  uploadedByUserId: uuid("uploaded_by_user_id").references((): AnyPgColumn => appUser.id), createdAt: time("created_at").notNull().defaultNow(),
}, t => [checksumCheck(t.sha256), check("drawing_dimensions", sql`${t.bytes} > 0 AND ${t.fileVersion} > 0 AND (${t.width} IS NULL OR ${t.width} > 0) AND (${t.height} IS NULL OR ${t.height} > 0) AND (${t.pages} IS NULL OR ${t.pages} > 0)`), check("drawing_validation", sql`${t.validationStatus} IN ('pending','valid','rejected')`)]);

export const model = pgTable("model", {
  id: id(), productLineId: uuid("product_line_id").notNull().references(() => productLine.id), name: text("name").notNull(),
  photoFileId: uuid("photo_file_id").references(() => drawingFile.id), sortOrder: integer("sort_order").notNull().default(0),
  status: text("status", { enum: ["active", "legacy", "discontinued"] }).notNull().default("active"), ...mutable(),
}, t => [unique("model_line_name").on(t.productLineId, t.name), versionCheck(t), check("model_lifecycle", sql`${t.status} IN ('active','legacy','discontinued')`)]);

export const variant = pgTable("variant", {
  id: id(), modelId: uuid("model_id").notNull().references(() => model.id), label: text("label").notNull(), serialFrom: text("serial_from"), serialTo: text("serial_to"), catalogRevision: text("catalog_revision"), ...mutable(),
}, t => [unique("variant_model_label").on(t.modelId, t.label), unique("variant_id_model").on(t.id, t.modelId), versionCheck(t)]);

export const system = pgTable("system", {
  id: id(), name: text("name").notNull(), normalizedName: text("normalized_name").notNull().unique(), sortOrder: integer("sort_order").notNull().default(0), ...mutable(),
}, t => [versionCheck(t), check("system_normalized", sql`${t.normalizedName} = lower(btrim(${t.name})) AND ${t.normalizedName} <> ''`)]);

export const modelSystem = pgTable("model_system", {
  modelId: uuid("model_id").notNull().references(() => model.id), systemId: uuid("system_id").notNull().references(() => system.id), enabled: boolean("enabled").notNull().default(true), ...mutable(),
}, t => [primaryKey({ columns: [t.modelId, t.systemId] }), versionCheck(t)]);

export const figure = pgTable("figure", {
  id: id(), variantId: uuid("variant_id").notNull().references(() => variant.id), systemId: uuid("system_id").notNull().references(() => system.id),
  name: text("name").notNull(), groupNo: text("group_no"), drawingFileId: uuid("drawing_file_id").references(() => drawingFile.id), sortOrder: integer("sort_order").notNull().default(0), sourceKey: text("source_key").notNull(), ...mutable(),
}, t => [unique("figure_source_identity").on(t.variantId, t.sourceKey), index("figure_variant_system").on(t.variantId, t.systemId), versionCheck(t)]);

export const part = pgTable("part", {
  id: id(), partNumber: text("part_number").notNull(), normalizedPartNumber: text("normalized_part_number").notNull().unique(), description: text("description").notNull(), manufacturer: text("manufacturer"),
  listPrice: money("list_price"), currency: text("currency").notNull().default("CAD"), supersededByPartId: uuid("superseded_by_part_id").references((): AnyPgColumn => part.id),
  status: text("status", { enum: ["active", "superseded", "obsolete", "special-order"] }).notNull().default("active"), ...mutable(),
}, t => [versionCheck(t), currencyCheck(t.currency), check("part_price_nonnegative", sql`${t.listPrice} >= 0 AND ${t.listPrice} < 'Infinity'::numeric`), check("part_status", sql`${t.status} IN ('active','superseded','obsolete','special-order')`), check("part_no_self_supersession", sql`${t.supersededByPartId} <> ${t.id}`), check("part_number_normalized", sql`${t.normalizedPartNumber} = upper(btrim(${t.partNumber})) AND ${t.normalizedPartNumber} <> ''`)]);

export const partRequires = pgTable("part_requires", {
  partId: uuid("part_id").notNull().references(() => part.id), requiredPartId: uuid("required_part_id").notNull().references(() => part.id), qty: integer("qty").notNull(),
  reviewState: text("review_state", { enum: ["pending", "approved", "rejected"] }).notNull().default("pending"), provenance: jsonb("provenance"), reviewedByUserId: uuid("reviewed_by_user_id").references((): AnyPgColumn => appUser.id), reviewedAt: time("reviewed_at"), ...mutable(),
}, t => [primaryKey({ columns: [t.partId, t.requiredPartId] }), versionCheck(t), check("requires_no_self", sql`${t.partId} <> ${t.requiredPartId}`), check("requires_qty_positive", sql`${t.qty} > 0`), check("requires_review_state", sql`${t.reviewState} IN ('pending','approved','rejected')`)]);

export const figurePart = pgTable("figure_part", {
  id: id(), figureId: uuid("figure_id").notNull().references(() => figure.id), partId: uuid("part_id").notNull().references(() => part.id), sourceRowKey: text("source_row_key").notNull(),
  qty: integer("qty").notNull(), remarks: text("remarks"), serviceable: boolean("serviceable").notNull().default(true), effectiveFrom: date("effective_from"), effectiveTo: date("effective_to"), ...mutable(),
}, t => [unique("figure_part_id_figure").on(t.id, t.figureId), unique("figure_part_source_identity").on(t.figureId, t.sourceRowKey), index("figure_part_part").on(t.partId), versionCheck(t), check("figure_part_qty_positive", sql`${t.qty} > 0`), check("figure_part_dates", sql`${t.effectiveTo} >= ${t.effectiveFrom}`)]);

export const callout = pgTable("callout", {
  id: id(), figureId: uuid("figure_id").notNull().references(() => figure.id), figurePartId: uuid("figure_part_id"), sourceKey: text("source_key").notNull(), number: text("number").notNull(), x: numeric("x", { precision: 7, scale: 4 }), y: numeric("y", { precision: 7, scale: 4 }), ...mutable(),
}, t => [unique("callout_source_identity").on(t.figureId, t.sourceKey), foreignKey({ name: "callout_same_figure", columns: [t.figurePartId, t.figureId], foreignColumns: [figurePart.id, figurePart.figureId] }), index("callout_figure_part").on(t.figurePartId), versionCheck(t), check("callout_coordinates", sql`(${t.x} IS NULL AND ${t.y} IS NULL) OR (${t.x} IS NOT NULL AND ${t.y} IS NOT NULL AND ${t.x} BETWEEN 0 AND 100 AND ${t.y} BETWEEN 0 AND 100)`)]);
