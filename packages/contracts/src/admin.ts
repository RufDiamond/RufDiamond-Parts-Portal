import { Type, type Static } from "@sinclair/typebox";
import {
  CatalogStateSchema,
  DraftPartSchema,
  FigureSchema,
  ModelSchema,
  PartStatusSchema,
  ProductLineSchema,
  SystemSchema,
  VariantSchema,
} from "./catalog.js";
import { MoneySchema, ReleaseRefSchema } from "./common.js";
import { OrderStatusSchema } from "./orders.js";
import { ComponentRegionSchema, LabelRegionSchema } from "./diagram-mapping.js";

const nullableString = () => Type.Union([Type.String(), Type.Null()]);
const count = () => Type.Integer({ minimum: 0 });

const importUuid = () => Type.String({ pattern: "^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$" });
const importHash = () => Type.String({ pattern: "^[a-f0-9]{64}$" });
const reviewEvidence = Type.String({ minLength: 10, maxLength: 4000, pattern: "^\\S[\\s\\S]{8,}\\S$" });
export const AssemblyReferenceReviewInputSchema = Type.Object({
  decision: Type.Literal("assembly-reference-unspecified"), confirmed: Type.Literal(true),
  sourceBindingSha256: importHash(), stagingRowId: importUuid(), stagingRowVersion: Type.Integer({ minimum: 1 }),
  issueId: importUuid(), issueVersion: Type.Integer({ minimum: 1 }), evidence: reviewEvidence,
}, { additionalProperties: false });
export type AssemblyReferenceReviewInput = Static<typeof AssemblyReferenceReviewInputSchema>;
const depictionReviewFields = {
  confirmed: Type.Literal(true),
  sourceBindingSha256: importHash(), rowIds: Type.Array(importUuid(), { minItems: 1, maxItems: 1000, uniqueItems: true }), evidence: reviewEvidence,
};
export const DepictionReviewInputSchema = Type.Union([
  Type.Object({...depictionReviewFields,mode:Type.Union([Type.Literal("table-only"),Type.Literal("not-depicted")])},{additionalProperties:false}),
  Type.Object({...depictionReviewFields,mode:Type.Literal("assembly-reference-unspecified"),rowIds:Type.Array(importUuid(),{minItems:1,maxItems:1}),quantityDecisionId:importUuid()},{additionalProperties:false}),
]);
export type DepictionReviewInput = Static<typeof DepictionReviewInputSchema>;
export const SourceApprovalSchema = Type.Object({
  decisionId: importUuid(), reviewerId: importUuid(), reviewerName: Type.String({ minLength: 1 }), reviewedAt: Type.String(), evidence: reviewEvidence,
}, { additionalProperties: false });
export type SourceApproval = Static<typeof SourceApprovalSchema>;
export const ReviewSourceRowSchema = Type.Object({
  stagingRowId: importUuid(), stagingRowVersion: Type.Integer({ minimum: 1 }), sourceRowKey: Type.String(), identityKey: importHash(), contentHash: importHash(),
  sourceChecksum: importHash(), jobId: importUuid(), lineageKey: Type.String(), rowNumber: Type.Union([Type.Integer(), Type.Null()]),
  partNumber: Type.String(), description: Type.String(), reference: nullableString(), rawQuantity: Type.Union([Type.String(), Type.Number(), Type.Null()]), remarks: nullableString(),
  figurePartId: Type.Union([importUuid(), Type.Null()]), figurePartVersion: Type.Union([Type.Integer(), Type.Null()]),
}, { additionalProperties: false });
export type ReviewSourceRow = Static<typeof ReviewSourceRowSchema>;
export const SourceReviewDetailSchema = Type.Object({
  id: importUuid(), version: Type.Integer({ minimum: 1 }), target: Type.Union([Type.Literal("import"), Type.Literal("figure")]),
  sourceBindingSha256: importHash(), sourceConflict: Type.Boolean(), canReview: Type.Boolean(), canReviewAssembly: Type.Boolean(), rows: Type.Array(ReviewSourceRowSchema),
  issues: Type.Array(Type.Object({ id: importUuid(), version: Type.Integer({ minimum: 1 }), stagingRowId: Type.Union([importUuid(), Type.Null()]), code: Type.String(), field: nullableString(), message: Type.String() }, { additionalProperties: false })),
  approvals: Type.Array(Type.Object({ ...SourceApprovalSchema.properties, mode: Type.Union([Type.Literal("table-only"), Type.Literal("not-depicted"), Type.Literal("assembly-reference-unspecified")]), rowIds: Type.Array(importUuid()), current: Type.Boolean(),quantityDecisionId:Type.Optional(Type.Union([importUuid(),Type.Null()])) }, { additionalProperties: false })),
}, { additionalProperties: false });
export type SourceReviewDetail = Static<typeof SourceReviewDetailSchema>;
export const NormalizedImportFieldsSchema = Type.Object({
  partNumber: Type.String(), description: Type.String(), model: Type.String(), variant: Type.String(), system: Type.String(), groupNo: nullableString(), figureName: Type.String(),
  effectiveFrom: nullableString(), effectiveTo: nullableString(), qty: Type.Integer({ minimum: 1, maximum: 2147483647 }), pnc: nullableString(),
  listPrice: Type.Union([MoneySchema, Type.Null()]), currency: Type.Literal("CAD"), manufacturer: nullableString(), serviceable: Type.Boolean(), remarks: nullableString(),
}, { additionalProperties: false });
export type NormalizedImportFields = Static<typeof NormalizedImportFieldsSchema>;
export const NormalizedImportRowSchema = Type.Object({sourceRowKey:Type.String({minLength:1}),rowNumber:Type.Integer({minimum:1}),fields:NormalizedImportFieldsSchema},{additionalProperties:false});
export const StagedImportNormalizationSchema = Type.Union([
  Type.Object({normalizationState:Type.Literal("valid"),fields:NormalizedImportFieldsSchema},{additionalProperties:false}),
  Type.Object({normalizationState:Type.Literal("invalid"),fields:Type.Null()},{additionalProperties:false}),
]);
export const ImportUploadMetadataSchema = Type.Object({
  modelId: importUuid(), variantId: importUuid(), filename: Type.String({ minLength: 1, maxLength: 180, pattern: "^[^/\\\\\u0000-\u001f]+\\.(csv|xlsx)$" }),
  format: Type.Union([Type.Literal("csv"), Type.Literal("xlsx")]), sourceKind: Type.Union([Type.Literal("workbook"), Type.Literal("legacy-draft"), Type.Literal("synthetic")]),
  lineageKey: Type.String({ minLength: 1, maxLength: 120, pattern: "^[a-zA-Z0-9][a-zA-Z0-9._-]*$" }), sha256: importHash(),
}, { additionalProperties: false });
export type ImportUploadMetadata = Static<typeof ImportUploadMetadataSchema>;
export const ImportIssueReviewInputSchema = Type.Object({ decision: Type.Union([Type.Literal("acknowledged"), Type.Literal("source-correction-required")]), evidence: Type.String({ minLength: 10, maxLength: 4000 }) }, { additionalProperties: false });
export type ImportIssueReviewInput = Static<typeof ImportIssueReviewInputSchema>;
export const ImportIssueSchema = Type.Object({ id: importUuid(), version: Type.Integer({ minimum: 1 }), sourceRowKey: nullableString(), severity: Type.Union([Type.Literal("warning"),Type.Literal("error")]), code: Type.String(), field: nullableString(), message: Type.String(), reviewedBy: Type.Union([importUuid(),Type.Null()]), reviewedAt: nullableString() }, { additionalProperties: false });
export const ImportAliasSchema = Type.Object({ sourceRowKey: Type.String(), identityKey: importHash(), figureKey: importHash(), figureId: importUuid(), figurePartId: importUuid(), partNumber:Type.String(), calloutId: Type.Union([importUuid(),Type.Null()]), refNo: nullableString() }, { additionalProperties: false });
export type ImportAlias = Static<typeof ImportAliasSchema>;
export const ImportResultSchema = Type.Object({
  id: importUuid(), state: Type.Union((["uploaded","staged","validated","applying","applied","failed"] as const).map(value=>Type.Literal(value))), blockingIssueCount: count(),
}, { additionalProperties: false });
export type ImportResult = Static<typeof ImportResultSchema>;
export function canApplyImport(state: ImportResult): boolean { return state.state === "validated" && state.blockingIssueCount === 0; }
export const ImportDetailSchema = Type.Object({
  ...ImportResultSchema.properties, version: Type.Integer({minimum:1}), modelId: importUuid(), variantId: importUuid(), sourceChecksum: importHash(), sourceKind: ImportUploadMetadataSchema.properties.sourceKind, format: ImportUploadMetadataSchema.properties.format, lineageKey: Type.String(), rowCount: count(), validRowCount: count(), issues: Type.Array(ImportIssueSchema), aliases: Type.Array(ImportAliasSchema),
}, { additionalProperties: false });
export type ImportDetail = Static<typeof ImportDetailSchema>;
export const MappingDraftManifestSchema = Type.Object({
  schemaVersion:Type.Literal(1),status:Type.Literal("NOT_FOR_CUSTOMER_USE"),operatorId:importUuid(),jobId:importUuid(),modelId:importUuid(),variantId:importUuid(),figureId:importUuid(),legacyFigureId:Type.String({minLength:1,maxLength:200}),
  sourceChecksum:importHash(),legacySourceChecksum:importHash(),catalogueBindingSha256:importHash(),drawingSha256:importHash(),imageWidth:Type.Integer({minimum:1,maximum:16384}),imageHeight:Type.Integer({minimum:1,maximum:16384}),expectedMappingVersion:Type.Integer({minimum:1}),idempotencyKey:Type.String({minLength:1,maxLength:255}),
  proposals:Type.Array(Type.Object({sourceRowKey:Type.String({minLength:1,maxLength:200}),legacyCalloutId:Type.String({minLength:1,maxLength:200}),legacyFigurePartId:Type.String({minLength:1,maxLength:200}),refNo:Type.String({minLength:1,maxLength:100}),labelRegion:Type.Union([LabelRegionSchema,Type.Null()]),regions:Type.Array(ComponentRegionSchema,{maxItems:32}),legacyMaskPath:Type.Union([Type.String({maxLength:64000}),Type.Null()]),evidence:Type.String({minLength:1,maxLength:4000})},{additionalProperties:false}),{maxItems:1000}),
},{additionalProperties:false});
export type MappingDraftManifest = Static<typeof MappingDraftManifestSchema>;

export const DraftFigureMetadataSchema = Type.Object({
  id: Type.String({ pattern: "^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$" }),
  name: Type.String(), version: Type.Integer({ minimum: 1 }), hasDrawing: Type.Boolean(),
}, { additionalProperties: false });
export type DraftFigureMetadata = Static<typeof DraftFigureMetadataSchema>;
export const DraftFigurePageSchema = Type.Object({ items: Type.Array(DraftFigureMetadataSchema), nextCursor: Type.Union([Type.String(), Type.Null()]) }, { additionalProperties: false });
export type DraftFigurePage = Static<typeof DraftFigurePageSchema>;

export const CatalogStatsSchema = Type.Object(
  {
    modelsWithData: count(),
    modelsRegistered: count(),
    figures: count(),
    partRecords: count(),
    unmappedCallouts: count(),
  },
  { $id: "CatalogStats", additionalProperties: false },
);
export type CatalogStats = Static<typeof CatalogStatsSchema>;

export const CatalogModelRowSchema = Type.Object(
  {
    modelId: Type.String(),
    name: Type.String(),
    serialRange: nullableString(),
    figures: count(),
    parts: count(),
    state: CatalogStateSchema,
    updatedAt: nullableString(),
  },
  { $id: "CatalogModelRow", additionalProperties: false },
);
export type CatalogModelRow = Static<typeof CatalogModelRowSchema>;

export const CatalogLineGroupSchema = Type.Object(
  {
    productLine: ProductLineSchema,
    models: Type.Array(CatalogModelRowSchema),
  },
  { $id: "CatalogLineGroup", additionalProperties: false },
);
export type CatalogLineGroup = Static<typeof CatalogLineGroupSchema>;

export const CatalogSummarySchema = Type.Object(
  {
    stats: CatalogStatsSchema,
    groups: Type.Array(CatalogLineGroupSchema),
    lastPublish: Type.Union([
      Type.Object(
        { revision: Type.Integer({ minimum: 1 }), date: Type.String() },
        { additionalProperties: false },
      ),
      Type.Null(),
    ]),
  },
  { $id: "CatalogSummary", additionalProperties: false },
);
export type CatalogSummary = Static<typeof CatalogSummarySchema>;

export const ModelSystemRowSchema = Type.Object(
  {
    system: SystemSchema,
    figureCount: count(),
    partCount: count(),
    unmappedCallouts: count(),
  },
  { $id: "ModelSystemRow", additionalProperties: false },
);
export type ModelSystemRow = Static<typeof ModelSystemRowSchema>;

export const ModelDetailSchema = Type.Object(
  {
    model: ModelSchema,
    productLine: ProductLineSchema,
    variants: Type.Array(VariantSchema),
    figureCount: count(),
    partCount: count(),
    state: CatalogStateSchema,
    systems: Type.Array(ModelSystemRowSchema),
    figuresByVariant: Type.Record(Type.String(), count()),
  },
  { $id: "ModelDetail", additionalProperties: false },
);
export type ModelDetail = Static<typeof ModelDetailSchema>;

export const PartFiltersSchema = Type.Object(
  {
    query: Type.Optional(Type.String()),
    systemId: Type.Optional(Type.String()),
    status: Type.Optional(PartStatusSchema),
  },
  { $id: "PartFilters", additionalProperties: false },
);
export type PartFilters = Static<typeof PartFiltersSchema>;

export const PartRefSchema = Type.Object(
  {
    partId: Type.String(),
    partNumber: Type.String(),
    description: Type.String(),
    qty: Type.Optional(Type.Integer({ minimum: 1, maximum: 9999 })),
  },
  { $id: "PartRef", additionalProperties: false },
);
export type PartRef = Static<typeof PartRefSchema>;

export const AdminPartRowSchema = Type.Object(
  {
    part: DraftPartSchema,
    systems: Type.Array(Type.String()),
    figures: Type.Array(Type.String()),
    totalQty: count(),
    remarks: Type.Array(Type.String()),
    supersededBy: Type.Union([PartRefSchema, Type.Null()]),
    supersedes: Type.Union([PartRefSchema, Type.Null()]),
    requires: Type.Array(PartRefSchema),
  },
  { $id: "AdminPartRow", additionalProperties: false },
);
export type AdminPartRow = Static<typeof AdminPartRowSchema>;

export const AdminOrderSchema = Type.Object(
  {
    id: Type.String(),
    reference: Type.String(),
    customer: Type.String(),
    productLine: Type.String(),
    model: Type.String(),
    serialRange: Type.String(),
    lines: count(),
    valueCad: MoneySchema,
    discountTier: Type.String(),
    state: OrderStatusSchema,
  },
  { $id: "AdminOrder", additionalProperties: false },
);
export type AdminOrder = Static<typeof AdminOrderSchema>;

export const PublishChangeSchema = Type.Object(
  {
    id: Type.String(),
    change: Type.String(),
    affects: Type.String(),
    by: Type.Optional(Type.String()),
    when: Type.Optional(Type.String()),
    reason: Type.Optional(Type.String()),
  },
  { $id: "PublishChange", additionalProperties: false },
);
export type PublishChange = Static<typeof PublishChangeSchema>;

export const PublishRevisionSchema = Type.Object(
  {
    id: Type.String(),
    revision: Type.Integer({ minimum: 1 }),
    summary: Type.String(),
    by: Type.String(),
    when: Type.String(),
  },
  { $id: "PublishRevision", additionalProperties: false },
);
export type PublishRevision = Static<typeof PublishRevisionSchema>;

export const PublishQueueSchema = Type.Object(
  {
    ready: Type.Array(PublishChangeSchema),
    blocked: Type.Array(PublishChangeSchema),
    history: Type.Array(PublishRevisionSchema),
    environment: Type.String(),
    liveRevision: Type.Union([Type.Integer({ minimum: 1 }), Type.Null()]),
  },
  { $id: "PublishQueue", additionalProperties: false },
);
export type PublishQueue = Static<typeof PublishQueueSchema>;

export const ModelFigureSchema = Type.Object(
  {
    figure: FigureSchema,
    variant: VariantSchema,
    systemName: Type.String(),
    partCount: count(),
    calloutCount: count(),
  },
  { $id: "ModelFigure", additionalProperties: false },
);
export type ModelFigure = Static<typeof ModelFigureSchema>;

export const CalloutPatchSchema = Type.Object(
  {
    version: Type.Integer({ minimum: 1 }),
    figurePartId: Type.Optional(nullableString()),
    x: Type.Optional(Type.Union([Type.Number({ minimum: 0, maximum: 100 }), Type.Null()])),
    y: Type.Optional(Type.Union([Type.Number({ minimum: 0, maximum: 100 }), Type.Null()])),
    maskPath: Type.Optional(nullableString()),
  },
  { $id: "CalloutPatch", additionalProperties: false },
);
export type CalloutPatch = Static<typeof CalloutPatchSchema>;

export const PublishInputSchema = Type.Object(
  {
    modelId: Type.String(),
    expectedWorkingVersion: Type.Integer({ minimum: 1 }),
    expectedPublicationVersion: Type.Integer({ minimum: 1 }),
    summary: Type.String(),
  },
  { $id: "PublishInput", additionalProperties: false },
);
export type PublishInput = Static<typeof PublishInputSchema>;

export const PublishResultSchema = Type.Composite(
  [
    ReleaseRefSchema,
    Type.Object(
      { checksum: Type.String() },
      { additionalProperties: false },
    ),
  ],
  { $id: "PublishResult", additionalProperties: false },
);
export type PublishResult = Static<typeof PublishResultSchema>;

export const ActivateReleaseInputSchema = Type.Object({
  expectedPublicationVersion: Type.Integer({ minimum: 1 }),
  expectedActiveReleaseId: Type.Union([Type.String(), Type.Null()]),
}, { additionalProperties: false });
export type ActivateReleaseInput = Static<typeof ActivateReleaseInputSchema>;

export const PublicationModelStateSchema = Type.Object({
  modelId: Type.String(), name: Type.String(), workingVersion: Type.Integer({ minimum: 1 }),
  publicationVersion: Type.Integer({ minimum: 1 }), activeReleaseId: Type.Union([Type.String(), Type.Null()]),
  blockers: Type.Array(Type.Object({ code: Type.String(), message: Type.String(), path: Type.Optional(Type.String()) }, { additionalProperties: false })),
}, { additionalProperties: false });
export const PublicationQueuePageSchema = Type.Object({ items: Type.Array(PublicationModelStateSchema), nextCursor: Type.Union([Type.String(), Type.Null()]) }, { additionalProperties: false });
