import "server-only";
import { Type, type TSchema } from "@sinclair/typebox";
import {
  MeResponseSchema, PageSchema, ProductLineSchema, ModelSchema, VariantSchema,
  SystemSchema, ReleasedFigureSchema, FigureDetailSchema, PartSchema,
  PartUsageRowSchema, PartUsageIndexEntrySchema, MappingEditorDocumentSchema,
  MappingRevisionSchema, MappingHistorySchema, MappingHistoricalDocumentSchema,
  DrawingDeliverySchema, DrawingUploadIntentSchema, DrawingAttachmentSchema,
  PublicationQueuePageSchema, PublishResultSchema,
  DraftFigurePageSchema, DraftFigureMetadataSchema,
} from "@rufdiamond/contracts";
import { CatalogApiError } from "./api-error";

// Exact identity route DTOs; the API's identity/schemas.ts owns the corresponding wire shape.
const signedIn = Type.Object({ csrfToken: Type.String({ minLength: 1 }) }, { additionalProperties: false });
const signedOut = Type.Object({ signedOut: Type.Literal(true) }, { additionalProperties: false });
const resetRequested = Type.Object({ accepted: Type.Literal(true) }, { additionalProperties: false });
const resetCompleted = Type.Object({ completed: Type.Literal(true) }, { additionalProperties: false });

/** Called only after path/method allowlisting; unexpected success statuses fail closed. */
export function apiResponseSchema(pathWithQuery: string, method: string, status: number): TSchema {
  const path = pathWithQuery.split("?")[0];
  const suffix = path.split("/").at(-1);
  let schema: TSchema | undefined;
  let expectedStatus = 200;
  if (path === "me") schema = MeResponseSchema;
  else if (path === "admin/figures") schema = DraftFigurePageSchema;
  else if (/^admin\/figures\/[^/]+$/.test(path)) schema = DraftFigureMetadataSchema;
  else if (path === "auth/sign-in") schema = signedIn;
  else if (path === "auth/sign-out") schema = signedOut;
  else if (path === "auth/password-reset/request") { schema = resetRequested; expectedStatus = 202; }
  else if (path === "auth/password-reset/complete") schema = resetCompleted;
  else if (path.startsWith("catalog/")) {
    if (/^catalog\/figures\//.test(path)) schema = FigureDetailSchema;
    else {
      const item = ({ "product-lines": ProductLineSchema, models: ModelSchema, variants: VariantSchema,
        systems: SystemSchema, figures: ReleasedFigureSchema, search: PartSchema, usages: PartUsageRowSchema,
        "usage-index": PartUsageIndexEntrySchema } as Record<string, TSchema>)[suffix!];
      if (item) schema = PageSchema(item);
    }
  } else if (path.startsWith("admin/publication/")) {
    schema = suffix === "queue" ? PublicationQueuePageSchema : PublishResultSchema;
    if (suffix === "releases") expectedStatus = 201;
  } else if (path.startsWith("admin/figures/")) {
    if (suffix === "drawing") schema = DrawingDeliverySchema;
    else if (suffix === "drawing-uploads") { schema = DrawingUploadIntentSchema; expectedStatus = 201; }
    else if (suffix === "finalize") schema = DrawingAttachmentSchema;
    else if (suffix === "diagram-mapping") schema = method === "GET" ? MappingEditorDocumentSchema : MappingRevisionSchema;
    else if (suffix === "approve") schema = MappingRevisionSchema;
    else if (suffix === "revisions") schema = MappingHistorySchema;
    else if (path.includes("/revisions/")) schema = MappingHistoricalDocumentSchema;
  }
  if (!schema || status !== expectedStatus) throw new CatalogApiError(502, "INVALID_UPSTREAM_RESPONSE");
  return schema;
}
