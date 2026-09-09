import { Type, type Static } from "@sinclair/typebox";

const uuid = Type.String({ pattern: "^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$" });
const timestamp = Type.String({ pattern: "^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}[.][0-9]{3}Z$" });
const positive = Type.Integer({ minimum: 1, maximum: 2147483647 });
export const DrawingUploadInputSchema = Type.Object({
  filename: Type.String({ minLength: 5, maxLength: 255, pattern: "^[^/\\\\\\u0000-\\u001f]+\\.[pP][nN][gG]$" }),
  bytes: Type.Integer({ minimum: 1, maximum: Number.MAX_SAFE_INTEGER }),
  sha256: Type.String({ pattern: "^[a-f0-9]{64}$" }),
}, { additionalProperties: false });
export const DrawingUploadIntentSchema = Type.Object({
  uploadId: uuid, figureId: uuid, figureVersion: positive,
  url: Type.String({ minLength: 1 }),
  headers: Type.Object({ "Content-Type": Type.Literal("image/png") }, { additionalProperties: false }),
  expiresAt: timestamp,
}, { additionalProperties: false });
export const DrawingAttachmentSchema = Type.Object({
  figureId: uuid, figureVersion: positive, drawingFileId: uuid, fileVersion: positive,
  sha256: Type.String({ pattern: "^[a-f0-9]{64}$" }), width: positive, height: positive,
  bytes: positive, filename: Type.String({ minLength: 1, maxLength: 255 }),
}, { additionalProperties: false });
export const DrawingDeliverySchema = Type.Object({
  ...DrawingAttachmentSchema.properties,
  url: Type.String({ minLength: 1 }), expiresAt: timestamp,
}, { additionalProperties: false });
export type DrawingUploadInput = Static<typeof DrawingUploadInputSchema>;
export type DrawingUploadIntent = Static<typeof DrawingUploadIntentSchema>;
export type DrawingAttachment = Static<typeof DrawingAttachmentSchema>;
export type DrawingDelivery = Static<typeof DrawingDeliverySchema>;
