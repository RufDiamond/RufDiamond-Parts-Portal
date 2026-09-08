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

const nullableString = () => Type.Union([Type.String(), Type.Null()]);
const count = () => Type.Integer({ minimum: 0 });

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
