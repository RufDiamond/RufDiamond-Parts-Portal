import { Type, type Static } from "@sinclair/typebox";

export const CurrencySchema = Type.Union([
  Type.Literal("CAD"),
  Type.Literal("USD"),
]);
export type Currency = Static<typeof CurrencySchema>;

export const ModelStatusSchema = Type.Union([
  Type.Literal("active"),
  Type.Literal("legacy"),
  Type.Literal("discontinued"),
]);
export type ModelStatus = Static<typeof ModelStatusSchema>;

export const FigureStatusSchema = Type.Union([
  Type.Literal("published"),
  Type.Literal("draft"),
  Type.Literal("superseded"),
]);
export type FigureStatus = Static<typeof FigureStatusSchema>;

export const PartStatusSchema = Type.Union([
  Type.Literal("active"),
  Type.Literal("superseded"),
  Type.Literal("obsolete"),
  Type.Literal("special-order"),
]);
export type PartStatus = Static<typeof PartStatusSchema>;

export const CompanyTypeSchema = Type.Union([
  Type.Literal("customer"),
  Type.Literal("dealer"),
]);
export type CompanyType = Static<typeof CompanyTypeSchema>;

export const ProductLineSchema = Type.Object(
  {
    id: Type.String(),
    name: Type.String(),
    manufacturer: Type.String(),
    country: Type.String(),
    isDistributed: Type.Boolean(),
  },
  { $id: "ProductLine" },
);
export type ProductLine = Static<typeof ProductLineSchema>;

export const CatalogStateSchema = Type.Union([
  Type.Literal("live"),
  Type.Literal("draft"),
  Type.Literal("awaiting-import"),
  Type.Literal("not-registered"),
]);
export type CatalogState = Static<typeof CatalogStateSchema>;

export const ModelSchema = Type.Object(
  {
    id: Type.String(),
    productLineId: Type.String(),
    name: Type.String(),
    status: ModelStatusSchema,
    catalogState: CatalogStateSchema,
    updatedAt: Type.Union([Type.String(), Type.Null()]),
  },
  { $id: "Model" },
);
export type Model = Static<typeof ModelSchema>;

export const VariantSchema = Type.Object(
  {
    id: Type.String(),
    modelId: Type.String(),
    label: Type.String(),
    serialFrom: Type.Union([Type.String(), Type.Null()]),
    serialTo: Type.Union([Type.String(), Type.Null()]),
    catalogRevision: Type.String(),
  },
  { $id: "Variant" },
);
export type Variant = Static<typeof VariantSchema>;

export const SystemSchema = Type.Object(
  {
    id: Type.String(),
    name: Type.String(),
    sortOrder: Type.Number(),
  },
  { $id: "System" },
);
export type System = Static<typeof SystemSchema>;

export const FigureSchema = Type.Object(
  {
    id: Type.String(),
    variantId: Type.String(),
    systemId: Type.String(),
    name: Type.String(),
    groupNo: Type.String(),
    drawingFileId: Type.Union([Type.String(), Type.Null()]),
    status: FigureStatusSchema,
  },
  { $id: "Figure" },
);
export type Figure = Static<typeof FigureSchema>;

export const PartRequirementSchema = Type.Object({
  partId: Type.String(),
  qty: Type.Number(),
});
export type PartRequirement = Static<typeof PartRequirementSchema>;

export const PartSchema = Type.Object(
  {
    id: Type.String(),
    partNumber: Type.String(),
    description: Type.String(),
    manufacturer: Type.Union([Type.String(), Type.Null()]),
    listPrice: Type.Number(),
    currency: CurrencySchema,
    supersededByPartId: Type.Union([Type.String(), Type.Null()]),
    requires: Type.Array(PartRequirementSchema),
    status: PartStatusSchema,
  },
  { $id: "Part" },
);
export type Part = Static<typeof PartSchema>;

export const FigurePartSchema = Type.Object(
  {
    id: Type.String(),
    figureId: Type.String(),
    partId: Type.String(),
    qty: Type.Number(),
    remarks: Type.Union([Type.String(), Type.Null()]),
    serviceable: Type.Boolean(),
  },
  { $id: "FigurePart" },
);
export type FigurePart = Static<typeof FigurePartSchema>;

const CoordinateSchema = Type.Number({ minimum: 0, maximum: 100 });

/** Coordinates that can be stored together on a callout. */
export const PairedCoordinatesSchema = Type.Union([
  Type.Object(
    { x: CoordinateSchema, y: CoordinateSchema },
    { additionalProperties: true },
  ),
  Type.Object(
    { x: Type.Null(), y: Type.Null() },
    { additionalProperties: true },
  ),
]);
export type PairedCoordinates = Static<typeof PairedCoordinatesSchema>;

const CalloutFieldsSchema = Type.Object({
  id: Type.String(),
  figureId: Type.String(),
  figurePartId: Type.Union([Type.String(), Type.Null()]),
  number: Type.Integer(),
  x: Type.Union([Type.Number({ minimum: 0, maximum: 100 }), Type.Null()]),
  y: Type.Union([Type.Number({ minimum: 0, maximum: 100 }), Type.Null()]),
});

export const CalloutSchema = Type.Intersect(
  [CalloutFieldsSchema, PairedCoordinatesSchema],
  { $id: "Callout" },
);
export type Callout = Static<typeof CalloutSchema>;

export const CompanySchema = Type.Object(
  {
    id: Type.String(),
    name: Type.String(),
    type: CompanyTypeSchema,
    discountRate: Type.Number(),
  },
  { $id: "Company" },
);
export type Company = Static<typeof CompanySchema>;

export const OrderLineSchema = Type.Object(
  {
    partId: Type.String(),
    partNumberSnapshot: Type.String(),
    descriptionSnapshot: Type.String(),
    qty: Type.Number(),
    unitPriceSnapshot: Type.Number(),
    lineTotal: Type.Number(),
  },
  { $id: "OrderLine" },
);
export type OrderLine = Static<typeof OrderLineSchema>;

export const FigurePartRowSchema = Type.Object(
  {
    figurePart: FigurePartSchema,
    part: PartSchema,
    calloutNumbers: Type.Array(Type.Number()),
  },
  { $id: "FigurePartRow" },
);
export type FigurePartRow = Static<typeof FigurePartRowSchema>;

export const FigureDetailSchema = Type.Object(
  {
    figure: FigureSchema,
    system: SystemSchema,
    variant: VariantSchema,
    rows: Type.Array(FigurePartRowSchema),
    callouts: Type.Array(CalloutSchema),
  },
  { $id: "FigureDetail" },
);
export type FigureDetail = Static<typeof FigureDetailSchema>;
