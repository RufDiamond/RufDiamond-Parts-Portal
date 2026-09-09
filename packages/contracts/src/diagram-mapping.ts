import { Type, type Static } from "@sinclair/typebox";

const Sha256Schema = Type.String({ pattern: "^[0-9a-f]{64}$" });

const MutableImagePointSchema = Type.Tuple(
  [Type.Number(), Type.Number()],
  { $id: "ImagePoint" },
);
export const ImagePointSchema = Type.Unsafe<readonly [number, number]>(
  MutableImagePointSchema,
);
export type ImagePoint = Static<typeof ImagePointSchema>;

const RingSchema = Type.Array(ImagePointSchema, {
  minItems: 3,
  maxItems: 512,
});

export const ComponentRegionSchema = Type.Object(
  {
    id: Type.String(),
    outer: RingSchema,
    holes: Type.Array(RingSchema, { maxItems: 16 }),
  },
  { $id: "ComponentRegion", additionalProperties: false },
);
export type ComponentRegion = Static<typeof ComponentRegionSchema>;

export const LabelRegionSchema = Type.Object(
  {
    x: Type.Number(),
    y: Type.Number(),
    width: Type.Number(),
    height: Type.Number(),
  },
  { $id: "LabelRegion", additionalProperties: false },
);
export type LabelRegion = Static<typeof LabelRegionSchema>;

export const OccurrenceMappingSchema = Type.Object(
  {
    calloutId: Type.String(),
    figurePartId: Type.Union([Type.String(), Type.Null()]),
    refNo: Type.String(),
    labelRegion: Type.Union([LabelRegionSchema, Type.Null()]),
    regions: Type.Array(ComponentRegionSchema, { maxItems: 32 }),
    evidence: Type.String(),
  },
  { $id: "OccurrenceMapping", additionalProperties: false },
);
export type OccurrenceMapping = Static<typeof OccurrenceMappingSchema>;

export const DiagramMappingDocumentSchema = Type.Object(
  {
    schemaVersion: Type.Literal(1),
    figureId: Type.String(),
    drawingFileId: Type.String(),
    drawingSha256: Sha256Schema,
    imageWidth: Type.Integer({ minimum: 1 }),
    imageHeight: Type.Integer({ minimum: 1 }),
    catalogueBindingSha256: Sha256Schema,
    occurrences: Type.Array(OccurrenceMappingSchema, { maxItems: 1000 }),
  },
  { $id: "DiagramMappingDocument", additionalProperties: false },
);
export type DiagramMappingDocument = Static<typeof DiagramMappingDocumentSchema>;

export const MappingIssueSchema = Type.Object(
  {
    path: Type.String(),
    code: Type.String(),
    message: Type.String(),
  },
  { $id: "MappingIssue", additionalProperties: false },
);
export type MappingIssue = Static<typeof MappingIssueSchema>;

const MappingApprovalSchema = Type.Object(
  {
    reviewerId: Type.String(),
    reviewedAt: Type.String(),
  },
  { additionalProperties: false },
);

export const MappingRevisionSchema = Type.Object(
  {
    revisionId: Type.String(),
    version: Type.Integer({ minimum: 1 }),
    checksum: Sha256Schema,
    document: DiagramMappingDocumentSchema,
    approval: Type.Union([MappingApprovalSchema, Type.Null()]),
  },
  { $id: "MappingRevision", additionalProperties: false },
);
export type MappingRevision = Static<typeof MappingRevisionSchema>;

export const MappingSaveInputSchema = Type.Object(
  { document: DiagramMappingDocumentSchema },
  { $id: "MappingSaveInput", additionalProperties: false },
);
export type MappingSaveInput = Static<typeof MappingSaveInputSchema>;

export const MappingApproveInputSchema = Type.Object(
  {
    revisionId: Type.String(),
    checksum: Sha256Schema,
  },
  { $id: "MappingApproveInput", additionalProperties: false },
);
export type MappingApproveInput = Static<typeof MappingApproveInputSchema>;

export const MappingWriteContextSchema = Type.Object(
  {
    figureId: Type.String(),
    expectedVersion: Type.Integer({ minimum: 1 }),
    idempotencyKey: Type.String(),
  },
  { $id: "MappingWriteContext", additionalProperties: false },
);
export type MappingWriteContext = Static<typeof MappingWriteContextSchema>;

export const MappingEditorDocumentSchema = Type.Union(
  [
    Type.Object(
      {
        version: Type.Literal(1),
        revision: Type.Null(),
        document: DiagramMappingDocumentSchema,
      },
      { additionalProperties: false },
    ),
    Type.Object(
      {
        version: Type.Integer({ minimum: 2 }),
        revision: MappingRevisionSchema,
        document: DiagramMappingDocumentSchema,
      },
      { additionalProperties: false },
    ),
  ],
  { $id: "MappingEditorDocument" },
);
export type MappingEditorDocument = Static<typeof MappingEditorDocumentSchema>;
