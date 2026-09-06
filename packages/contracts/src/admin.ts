import { Type, type Static } from "@sinclair/typebox";
import {
  CatalogStateSchema,
  FigureSchema,
  ModelSchema,
  PartSchema,
  ProductLineSchema,
  SystemSchema,
  VariantSchema,
} from "./catalog.js";

export const CatalogStatsSchema = Type.Object(
  {
    modelsWithData: Type.Number(),
    modelsRegistered: Type.Number(),
    figures: Type.Number(),
    partRecords: Type.Number(),
    unmappedCallouts: Type.Number(),
  },
  { $id: "CatalogStats" },
);
export type CatalogStats = Static<typeof CatalogStatsSchema>;

export const CatalogModelRowSchema = Type.Object(
  {
    modelId: Type.String(),
    name: Type.String(),
    serialRange: Type.Union([Type.String(), Type.Null()]),
    figures: Type.Number(),
    parts: Type.Number(),
    state: CatalogStateSchema,
    updatedAt: Type.Union([Type.String(), Type.Null()]),
  },
  { $id: "CatalogModelRow" },
);
export type CatalogModelRow = Static<typeof CatalogModelRowSchema>;

export const CatalogLineGroupSchema = Type.Object(
  {
    productLine: ProductLineSchema,
    models: Type.Array(CatalogModelRowSchema),
  },
  { $id: "CatalogLineGroup" },
);
export type CatalogLineGroup = Static<typeof CatalogLineGroupSchema>;

export const CatalogSummarySchema = Type.Object(
  {
    stats: CatalogStatsSchema,
    groups: Type.Array(CatalogLineGroupSchema),
    lastPublish: Type.Union([
      Type.Object({ revision: Type.String(), date: Type.String() }),
      Type.Null(),
    ]),
  },
  { $id: "CatalogSummary" },
);
export type CatalogSummary = Static<typeof CatalogSummarySchema>;

export const ModelSystemRowSchema = Type.Object(
  {
    system: SystemSchema,
    figureCount: Type.Number(),
    partCount: Type.Number(),
    unmappedCallouts: Type.Number(),
  },
  { $id: "ModelSystemRow" },
);
export type ModelSystemRow = Static<typeof ModelSystemRowSchema>;

export const ModelDetailSchema = Type.Object(
  {
    model: ModelSchema,
    productLine: ProductLineSchema,
    variants: Type.Array(VariantSchema),
    figureCount: Type.Number(),
    partCount: Type.Number(),
    state: CatalogStateSchema,
    systems: Type.Array(ModelSystemRowSchema),
    figuresByVariant: Type.Record(Type.String(), Type.Number()),
  },
  { $id: "ModelDetail" },
);
export type ModelDetail = Static<typeof ModelDetailSchema>;

export const PartFiltersSchema = Type.Object(
  {
    query: Type.Optional(Type.String()),
    systemId: Type.Optional(Type.String()),
    status: Type.Optional(PartSchema.properties.status),
  },
  { $id: "PartFilters" },
);
export type PartFilters = Static<typeof PartFiltersSchema>;

export const PartRefSchema = Type.Object(
  {
    partId: Type.String(),
    partNumber: Type.String(),
    description: Type.String(),
    qty: Type.Optional(Type.Number()),
  },
  { $id: "PartRef" },
);
export type PartRef = Static<typeof PartRefSchema>;

export const AdminPartRowSchema = Type.Object(
  {
    part: PartSchema,
    systems: Type.Array(Type.String()),
    figures: Type.Array(Type.String()),
    totalQty: Type.Number(),
    remarks: Type.Array(Type.String()),
    supersededBy: Type.Union([PartRefSchema, Type.Null()]),
    supersedes: Type.Union([PartRefSchema, Type.Null()]),
    requires: Type.Array(PartRefSchema),
  },
  { $id: "AdminPartRow" },
);
export type AdminPartRow = Static<typeof AdminPartRowSchema>;

export const OrderStateSchema = Type.Union([
  Type.Literal("new"),
  Type.Literal("quoted"),
  Type.Literal("shipped"),
  Type.Literal("requires-dealer-approval"),
]);
export type OrderState = Static<typeof OrderStateSchema>;

export const AdminOrderSchema = Type.Object(
  {
    id: Type.String(),
    reference: Type.String(),
    customer: Type.String(),
    productLine: Type.String(),
    model: Type.String(),
    serialRange: Type.String(),
    lines: Type.Number(),
    valueCad: Type.Number(),
    discountTier: Type.String(),
    state: OrderStateSchema,
  },
  { $id: "AdminOrder" },
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
  { $id: "PublishChange" },
);
export type PublishChange = Static<typeof PublishChangeSchema>;

export const PublishRevisionSchema = Type.Object(
  {
    id: Type.String(),
    revision: Type.String(),
    summary: Type.String(),
    by: Type.String(),
    when: Type.String(),
  },
  { $id: "PublishRevision" },
);
export type PublishRevision = Static<typeof PublishRevisionSchema>;

export const PublishQueueSchema = Type.Object(
  {
    ready: Type.Array(PublishChangeSchema),
    blocked: Type.Array(PublishChangeSchema),
    history: Type.Array(PublishRevisionSchema),
    environment: Type.String(),
    liveRevision: Type.Union([Type.String(), Type.Null()]),
  },
  { $id: "PublishQueue" },
);
export type PublishQueue = Static<typeof PublishQueueSchema>;

export const ModelFigureSchema = Type.Object(
  {
    figure: FigureSchema,
    variant: VariantSchema,
    systemName: Type.String(),
    partCount: Type.Number(),
    calloutCount: Type.Number(),
  },
  { $id: "ModelFigure" },
);
export type ModelFigure = Static<typeof ModelFigureSchema>;
