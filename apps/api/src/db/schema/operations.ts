import { sql } from "drizzle-orm";
import { check, foreignKey, index, integer, jsonb, pgTable, primaryKey, text, unique, uuid } from "drizzle-orm/pg-core";
import { model, part, variant } from "./catalog.js";
import { appUser, company } from "./identity.js";
import { publicationRelease, releasePart, releaseVariant } from "./releases.js";
import { checksumCheck, currencyCheck, id, money, mutable, rate, time, versionCheck } from "./common.js";

export const order = pgTable("order", {
  id: id(), companyId: uuid("company_id").notNull().references(() => company.id), submittedByUserId: uuid("submitted_by_user_id").notNull().references(() => appUser.id),
  dealerCompanyId: uuid("dealer_company_id").references(() => company.id), variantId: uuid("variant_id").notNull().references(() => variant.id), releaseId: uuid("release_id").notNull().references(() => publicationRelease.id),
  reference: text("reference"), kind: text("kind", { enum: ["request_for_quote"] }).notNull().default("request_for_quote"),
  status: text("status", { enum: ["submitted", "quoted", "confirmed", "fulfilled", "cancelled"] }).notNull().default("submitted"),
  currency: text("currency").notNull(), listTotal: money("list_total").notNull(), discountRate: rate("discount_rate").notNull().default("0"), discountApplied: money("discount_applied").notNull(), netTotal: money("net_total").notNull(), submittedAt: time("submitted_at"), ...mutable(),
}, t => [
  index("order_company_submitted").on(t.companyId, t.submittedAt, t.id),
  unique("order_id_release").on(t.id, t.releaseId),
  foreignKey({ name: "order_variant_in_release", columns: [t.releaseId, t.variantId], foreignColumns: [releaseVariant.releaseId, releaseVariant.workingId] }),
  versionCheck(t), currencyCheck(t.currency),
  check("order_kind", sql`${t.kind} = 'request_for_quote'`),
  check("order_status", sql`${t.status} IN ('submitted','quoted','confirmed','fulfilled','cancelled')`),
  check("order_amounts", sql`${t.listTotal} >= 0 AND ${t.listTotal} < 'Infinity'::numeric AND ${t.discountApplied} BETWEEN 0 AND ${t.listTotal} AND ${t.discountRate} BETWEEN 0 AND 1 AND ${t.netTotal} = ${t.listTotal} - ${t.discountApplied}`),
]);

export const orderLine = pgTable("order_line", {
  id: id(), orderId: uuid("order_id").notNull().references(() => order.id), partId: uuid("part_id").notNull().references(() => part.id),
  releaseId: uuid("release_id").notNull(), releasePartId: uuid("release_part_id").notNull(), partNumberSnapshot: text("part_number_snapshot").notNull(), descriptionSnapshot: text("description_snapshot").notNull(),
  qty: integer("qty").notNull(), unitPriceSnapshot: money("unit_price_snapshot").notNull(), lineTotal: money("line_total").notNull(), ...mutable(),
}, t => [
  index("order_line_order").on(t.orderId), versionCheck(t),
  foreignKey({ name: "order_line_parent_release", columns: [t.orderId, t.releaseId], foreignColumns: [order.id, order.releaseId] }),
  foreignKey({ name: "order_line_released_part_trace", columns: [t.releaseId, t.releasePartId, t.partId], foreignColumns: [releasePart.releaseId, releasePart.id, releasePart.workingId] }),
  check("order_line_amounts", sql`${t.qty} > 0 AND ${t.unitPriceSnapshot} >= 0 AND ${t.unitPriceSnapshot} < 'Infinity'::numeric AND ${t.lineTotal} = round(${t.qty} * ${t.unitPriceSnapshot},2)`),
]);

export const importJob = pgTable("import_job", {
  id: id(), modelId: uuid("model_id").notNull().references(() => model.id), variantId: uuid("variant_id").notNull(), sourceChecksum: text("source_checksum").notNull(), objectKey: text("object_key").notNull().unique(), filename: text("filename"),
  state: text("state", { enum: ["uploaded", "staged", "validated", "applying", "applied", "failed"] }).notNull().default("uploaded"), summary: jsonb("summary"), actorId: uuid("actor_id").notNull().references(() => appUser.id), appliedAt: time("applied_at"), ...mutable(),
}, t => [unique("import_source_target").on(t.variantId, t.sourceChecksum), foreignKey({ columns: [t.variantId, t.modelId], foreignColumns: [variant.id, variant.modelId] }), versionCheck(t), checksumCheck(t.sourceChecksum), check("import_state", sql`${t.state} IN ('uploaded','staged','validated','applying','applied','failed')`)]);

export const importStagingRow = pgTable("import_staging_row", {
  id: id(), jobId: uuid("job_id").notNull().references(() => importJob.id), sourceRowKey: text("source_row_key").notNull(), rowNumber: integer("row_number"), sourcePayload: jsonb("source_payload").notNull(), normalizedFields: jsonb("normalized_fields").notNull(), ...mutable(),
}, t => [unique("staging_source_identity").on(t.jobId, t.sourceRowKey), unique("staging_id_job").on(t.id, t.jobId), versionCheck(t), check("staging_row_number", sql`${t.rowNumber} > 0`)]);

export const importIssue = pgTable("import_issue", {
  id: id(), jobId: uuid("job_id").notNull().references(() => importJob.id), stagingRowId: uuid("staging_row_id"),
  severity: text("severity", { enum: ["warning", "error"] }).notNull(), code: text("code").notNull(), field: text("field"), message: text("message").notNull(), details: jsonb("details"), resolution: jsonb("resolution"), resolvedByUserId: uuid("resolved_by_user_id").references(() => appUser.id), resolvedAt: time("resolved_at"), ...mutable(),
}, t => [index("import_issue_job").on(t.jobId), versionCheck(t), foreignKey({ columns: [t.stagingRowId, t.jobId], foreignColumns: [importStagingRow.id, importStagingRow.jobId] }), check("import_issue_severity", sql`${t.severity} IN ('warning','error')`)]);

export const auditLog = pgTable("audit_log", {
  id: id(), actorId: uuid("actor_id").references(() => appUser.id), effectiveCompanyId: uuid("effective_company_id").references(() => company.id), capability: text("capability").notNull(),
  objectType: text("object_type").notNull(), objectId: uuid("object_id").notNull(), beforePatch: jsonb("before_patch"), afterPatch: jsonb("after_patch"), requestId: text("request_id").notNull(), correlationId: text("correlation_id"),
  occurredAt: time("occurred_at").notNull().defaultNow(), ipHash: text("ip_hash"), userAgent: text("user_agent"),
}, t => [index("audit_object_time").on(t.objectType, t.objectId, t.occurredAt), index("audit_company_time").on(t.effectiveCompanyId, t.occurredAt)]);

export const outboxEvent = pgTable("outbox_event", {
  id: id(), eventType: text("event_type").notNull(), aggregateType: text("aggregate_type").notNull(), aggregateId: uuid("aggregate_id").notNull(), payloadVersion: integer("payload_version").notNull().default(1), payload: jsonb("payload").notNull(),
  occurredAt: time("occurred_at").notNull().defaultNow(), availableAt: time("available_at").notNull().defaultNow(), completedAt: time("completed_at"), lockedAt: time("locked_at"), lockedBy: text("locked_by"), attempts: integer("attempts").notNull().default(0), lastError: text("last_error"), deduplicationKey: text("deduplication_key").unique(), ...mutable(),
}, t => [versionCheck(t), index("outbox_pending").on(t.availableAt, t.id).where(sql`${t.completedAt} IS NULL`), check("outbox_attempts", sql`${t.attempts} >= 0 AND ${t.payloadVersion} > 0`)]);

export const idempotencyRecord = pgTable("idempotency_record", {
  actorId: uuid("actor_id").notNull().references(() => appUser.id), operation: text("operation").notNull(), key: text("key").notNull(), requestHash: text("request_hash").notNull(),
  status: text("status", { enum: ["in_progress", "completed"] }).notNull().default("in_progress"), response: jsonb("response"), responseStatus: integer("response_status"), expiresAt: time("expires_at"), ...mutable(),
}, t => [primaryKey({ columns: [t.actorId, t.operation, t.key] }), versionCheck(t), checksumCheck(t.requestHash), check("idempotency_key_nonempty", sql`length(${t.operation}) > 0 AND length(${t.key}) BETWEEN 1 AND 255`), check("idempotency_state", sql`(${t.status} = 'in_progress' AND ${t.response} IS NULL AND ${t.responseStatus} IS NULL) OR (${t.status} = 'completed' AND ${t.response} IS NOT NULL AND ${t.responseStatus} IS NOT NULL AND ${t.responseStatus} BETWEEN 100 AND 599)`)]);
