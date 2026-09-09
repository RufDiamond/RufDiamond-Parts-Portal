import { sql } from "drizzle-orm";
import { check, index, integer, pgTable, text, uuid } from "drizzle-orm/pg-core";
import { drawingFile, figure } from "./catalog.js";
import { appUser } from "./identity.js";
import { id, time } from "./common.js";

export const drawingUploadIntent = pgTable("drawing_upload_intent", {
  id: id(), actorUserId: uuid("actor_user_id").notNull().references(() => appUser.id),
  figureId: uuid("figure_id").notNull().references(() => figure.id),
  objectKey: text("object_key").notNull().unique(), filename: text("filename").notNull(),
  expectedSha256: text("expected_sha256").notNull(), expectedBytes: integer("expected_bytes").notNull(),
  expectedFigureVersion: integer("expected_figure_version").notNull(),
  expiresAt: time("expires_at").notNull(), createdAt: time("created_at").notNull().defaultNow(),
  state: text("state", { enum: ["pending", "finalized", "cleanup", "cleaned"] }).notNull().default("pending"),
  finalizedDrawingId: uuid("finalized_drawing_id").references(() => drawingFile.id),
  finalizedAt: time("finalized_at"),
}, t => [
  index("drawing_upload_cleanup").on(t.state, t.createdAt),
  check("drawing_upload_limits", sql`${t.expectedBytes} BETWEEN 1 AND 20971520 AND ${t.expectedFigureVersion} BETWEEN 1 AND 2147483646`),
  check("drawing_upload_hash", sql`${t.expectedSha256} ~ '^[a-f0-9]{64}$'`),
  check("drawing_upload_key", sql`${t.objectKey} ~ '^quarantine/[0-9a-f-]{36}/[0-9a-f-]{36}[.]png$'`),
  check("drawing_upload_expiry", sql`${t.expiresAt} > ${t.createdAt}`),
  check("drawing_upload_state", sql`(${t.state} = 'finalized' AND ${t.finalizedDrawingId} IS NOT NULL AND ${t.finalizedAt} IS NOT NULL) OR (${t.state} IN ('pending','cleanup','cleaned') AND ${t.finalizedDrawingId} IS NULL AND ${t.finalizedAt} IS NULL)`),
]);
