import { Type, type Static } from "@sinclair/typebox";
import {
  AddressSchema,
  MoneySchema,
  QuantitySchema,
  RateSchema,
  ReleaseRefSchema,
} from "./common.js";

const nullableString = () => Type.Union([Type.String(), Type.Null()]);

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
  Type.Literal("internal"),
]);
export type CompanyType = Static<typeof CompanyTypeSchema>;

export const ProductLineSchema = Type.Object(
  {
    id: Type.String(),
    name: Type.String(),
    manufacturer: nullableString(),
    country: nullableString(),
    isDistributed: Type.Boolean(),
  },
  { $id: "ProductLine", additionalProperties: false },
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
    updatedAt: nullableString(),
  },
  { $id: "Model", additionalProperties: false },
);
export type Model = Static<typeof ModelSchema>;

export const VariantSchema = Type.Object(
  {
    id: Type.String(),
    modelId: Type.String(),
    label: Type.String(),
    serialFrom: nullableString(),
    serialTo: nullableString(),
    catalogRevision: nullableString(),
  },
  { $id: "Variant", additionalProperties: false },
);
export type Variant = Static<typeof VariantSchema>;

export const SystemSchema = Type.Object(
  {
    id: Type.String(),
    name: Type.String(),
    sortOrder: Type.Number(),
  },
  { $id: "System", additionalProperties: false },
);
export type System = Static<typeof SystemSchema>;

export const FigureSchema = Type.Object(
  {
    id: Type.String(),
    variantId: Type.String(),
    systemId: Type.String(),
    name: Type.String(),
    groupNo: nullableString(),
    drawingFileId: nullableString(),
    status: FigureStatusSchema,
  },
  { $id: "Figure", additionalProperties: false },
);
export type Figure = Static<typeof FigureSchema>;

export const ReleasedFigureSchema = Type.Object(
  {
    id: Type.String(),
    variantId: Type.String(),
    systemId: Type.String(),
    name: Type.String(),
    groupNo: nullableString(),
    drawingFileId: Type.String(),
    status: Type.Literal("published"),
  },
  { $id: "ReleasedFigure", additionalProperties: false },
);
export type ReleasedFigure = Static<typeof ReleasedFigureSchema>;

export const PartRequirementSchema = Type.Object(
  {
    partId: Type.String(),
    qty: QuantitySchema,
  },
  { $id: "PartRequirement", additionalProperties: false },
);
export type PartRequirement = Static<typeof PartRequirementSchema>;

const releasedPartFields = {
  id: Type.String(),
  releasePartId: Type.String(),
  partNumber: Type.String(),
  description: Type.String(),
  manufacturer: nullableString(),
  currency: CurrencySchema,
  supersededByPartId: nullableString(),
  requires: Type.Array(PartRequirementSchema),
  status: PartStatusSchema,
};

export const PricedPartSchema = Type.Object(
  { ...releasedPartFields, listPrice: MoneySchema },
  { $id: "PricedPart", additionalProperties: false },
);
export type PricedPart = Static<typeof PricedPartSchema>;

export const UnpricedPartSchema = Type.Object(releasedPartFields, {
  $id: "UnpricedPart",
  additionalProperties: false,
});
export type UnpricedPart = Static<typeof UnpricedPartSchema>;

export const PartSchema = Type.Object(
  { ...releasedPartFields, listPrice: Type.Optional(MoneySchema) },
  { $id: "Part", additionalProperties: false },
);
export type Part = Static<typeof PartSchema>;

export const DraftPartSchema = Type.Object(
  {
    id: Type.String(),
    partNumber: Type.String(),
    description: Type.String(),
    manufacturer: nullableString(),
    listPrice: Type.Union([MoneySchema, Type.Null()]),
    currency: CurrencySchema,
    supersededByPartId: nullableString(),
    requires: Type.Array(PartRequirementSchema),
    status: PartStatusSchema,
  },
  { $id: "DraftPart", additionalProperties: false },
);
export type DraftPart = Static<typeof DraftPartSchema>;

export const FigurePartSchema = Type.Object(
  {
    id: Type.String(),
    figureId: Type.String(),
    partId: Type.String(),
    qty: QuantitySchema,
    remarks: nullableString(),
    serviceable: Type.Boolean(),
  },
  { $id: "FigurePart", additionalProperties: false },
);
export type FigurePart = Static<typeof FigurePartSchema>;

const CoordinateSchema = Type.Number({ minimum: 0, maximum: 100 });
export const CalloutNumberSchema = Type.String({ minLength: 1, maxLength: 32 });
export type CalloutNumber = Static<typeof CalloutNumberSchema>;

const calloutIdentityFields = {
  id: Type.String(),
  figureId: Type.String(),
  figurePartId: Type.Union([Type.String(), Type.Null()]),
  number: CalloutNumberSchema,
  maskPath: nullableString(),
};

export const PairedCoordinatesSchema = Type.Union([
  Type.Object(
    { x: CoordinateSchema, y: CoordinateSchema },
    { additionalProperties: false },
  ),
  Type.Object(
    { x: Type.Null(), y: Type.Null() },
    { additionalProperties: false },
  ),
]);
export type PairedCoordinates = Static<typeof PairedCoordinatesSchema>;

export const CalloutSchema = Type.Union(
  [
    Type.Object(
      { ...calloutIdentityFields, x: CoordinateSchema, y: CoordinateSchema },
      { additionalProperties: false },
    ),
    Type.Object(
      { ...calloutIdentityFields, x: Type.Null(), y: Type.Null() },
      { additionalProperties: false },
    ),
  ],
  { $id: "Callout" },
);
export type Callout = Static<typeof CalloutSchema>;

export const ReleasedCalloutSchema = Type.Object(
  {
    ...calloutIdentityFields,
    figurePartId: Type.String(),
    x: CoordinateSchema,
    y: CoordinateSchema,
  },
  { $id: "ReleasedCallout", additionalProperties: false },
);
export type ReleasedCallout = Static<typeof ReleasedCalloutSchema>;

const companyFields = {
  id: Type.String(),
  name: Type.String(),
  type: CompanyTypeSchema,
  defaultShippingAddress: Type.Union([AddressSchema, Type.Null()]),
};

export const PricedCompanySchema = Type.Object(
  { ...companyFields, discountRate: RateSchema },
  { $id: "PricedCompany", additionalProperties: false },
);
export type PricedCompany = Static<typeof PricedCompanySchema>;

export const UnpricedCompanySchema = Type.Object(companyFields, {
  $id: "UnpricedCompany",
  additionalProperties: false,
});
export type UnpricedCompany = Static<typeof UnpricedCompanySchema>;

export const CompanySchema = Type.Object(
  { ...companyFields, discountRate: Type.Optional(RateSchema) },
  { $id: "Company", additionalProperties: false },
);
export type Company = Static<typeof CompanySchema>;

const figurePartRowFields = {
  figurePart: FigurePartSchema,
  calloutNumbers: Type.Array(CalloutNumberSchema),
};

export const PricedFigurePartRowSchema = Type.Object(
  {
    ...figurePartRowFields,
    part: PricedPartSchema,
  },
  { $id: "PricedFigurePartRow", additionalProperties: false },
);
export type PricedFigurePartRow = Static<typeof PricedFigurePartRowSchema>;

export const UnpricedFigurePartRowSchema = Type.Object(
  {
    ...figurePartRowFields,
    part: UnpricedPartSchema,
  },
  { $id: "UnpricedFigurePartRow", additionalProperties: false },
);
export type UnpricedFigurePartRow = Static<typeof UnpricedFigurePartRowSchema>;

export const FigurePartRowSchema = Type.Union(
  [PricedFigurePartRowSchema, UnpricedFigurePartRowSchema],
  { $id: "FigurePartRow" },
);
export type FigurePartRow = Static<typeof FigurePartRowSchema>;

export const DraftFigurePartRowSchema = Type.Object(
  {
    figurePart: FigurePartSchema,
    part: DraftPartSchema,
    calloutNumbers: Type.Array(CalloutNumberSchema),
  },
  { $id: "DraftFigurePartRow", additionalProperties: false },
);
export type DraftFigurePartRow = Static<typeof DraftFigurePartRowSchema>;

export const DrawingAssetSchema = Type.Object(
  {
    id: Type.String(),
    contentUrl: Type.String(),
    filename: Type.String(),
    format: Type.Union([Type.Literal("png"), Type.Literal("jpg")]),
    width: Type.Integer({ minimum: 1 }),
    height: Type.Integer({ minimum: 1 }),
    version: Type.Integer({ minimum: 1 }),
  },
  { $id: "DrawingAsset", additionalProperties: false },
);
export type DrawingAsset = Static<typeof DrawingAssetSchema>;

const figureDetailFields = {
  release: ReleaseRefSchema,
  figure: ReleasedFigureSchema,
  drawing: DrawingAssetSchema,
  system: SystemSchema,
  variant: VariantSchema,
  callouts: Type.Array(ReleasedCalloutSchema),
};

export const PricedFigureDetailSchema = Type.Object(
  {
    ...figureDetailFields,
    rows: Type.Array(PricedFigurePartRowSchema),
  },
  { $id: "PricedFigureDetail", additionalProperties: false },
);
export type PricedFigureDetail = Static<typeof PricedFigureDetailSchema>;

export const UnpricedFigureDetailSchema = Type.Object(
  {
    ...figureDetailFields,
    rows: Type.Array(UnpricedFigurePartRowSchema),
  },
  { $id: "UnpricedFigureDetail", additionalProperties: false },
);
export type UnpricedFigureDetail = Static<typeof UnpricedFigureDetailSchema>;

export const FigureDetailSchema = Type.Union(
  [PricedFigureDetailSchema, UnpricedFigureDetailSchema],
  { $id: "FigureDetail" },
);
export type FigureDetail = Static<typeof FigureDetailSchema>;

export const DraftFigureDetailSchema = Type.Object(
  {
    figure: FigureSchema,
    drawing: Type.Union([DrawingAssetSchema, Type.Null()]),
    system: SystemSchema,
    variant: VariantSchema,
    rows: Type.Array(DraftFigurePartRowSchema),
    callouts: Type.Array(CalloutSchema),
  },
  { $id: "DraftFigureDetail", additionalProperties: false },
);
export type DraftFigureDetail = Static<typeof DraftFigureDetailSchema>;

const partUsageFields = {
  figureId: nullableString(),
  groupNo: nullableString(),
  assemblyName: nullableString(),
  systemName: nullableString(),
  modelName: nullableString(),
  serial: nullableString(),
};

export const PricedPartUsageRowSchema = Type.Object(
  {
    ...partUsageFields,
    part: PricedPartSchema,
  },
  { $id: "PricedPartUsageRow", additionalProperties: false },
);
export type PricedPartUsageRow = Static<typeof PricedPartUsageRowSchema>;

export const UnpricedPartUsageRowSchema = Type.Object(
  {
    ...partUsageFields,
    part: UnpricedPartSchema,
  },
  { $id: "UnpricedPartUsageRow", additionalProperties: false },
);
export type UnpricedPartUsageRow = Static<typeof UnpricedPartUsageRowSchema>;

export const PartUsageRowSchema = Type.Union(
  [PricedPartUsageRowSchema, UnpricedPartUsageRowSchema],
  { $id: "PartUsageRow" },
);
export type PartUsageRow = Static<typeof PartUsageRowSchema>;

export const PartUsageSummarySchema = Type.Object(
  {
    productLineName: nullableString(),
    modelName: nullableString(),
    serial: nullableString(),
    systemName: nullableString(),
    groupNo: nullableString(),
    assemblyName: nullableString(),
    figureId: nullableString(),
  },
  { $id: "PartUsageSummary", additionalProperties: false },
);
export type PartUsageSummary = Static<typeof PartUsageSummarySchema>;
