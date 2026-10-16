import { Type, type Static } from "@sinclair/typebox";
import { NoteSchema, QuantitySchema } from "./common.js";

export const AvailabilitySchema = Type.Union([
  Type.Literal("yes"),
  Type.Literal("partial"),
  Type.Literal("no"),
]);
export type Availability = Static<typeof AvailabilitySchema>;

export const ProductLineLabelSchema = Type.Union([
  Type.Literal("Fat Truck"),
  Type.Literal("IronHorse"),
  Type.Literal("Agilis"),
]);

const RequestedSchema = Type.Object(
  {
    partNumber: Type.String({ minLength: 1, maxLength: 120 }),
    description: Type.String({ minLength: 1, maxLength: 500 }),
    qty: QuantitySchema,
  },
  { additionalProperties: false },
);

export const QuoteLineSchema = Type.Object(
  {
    id: Type.String({ format: "uuid" }),
    companyId: Type.String({ format: "uuid" }),
    productLine: ProductLineLabelSchema,
    quoteNo: Type.String({ minLength: 1, maxLength: 40 }),
    requestDate: Type.String({ pattern: "^\\d{4}-\\d{2}-\\d{2}$" }),
    customer: Type.String({ minLength: 1, maxLength: 200 }),
    user: Type.String({ minLength: 1, maxLength: 200 }),
    requested: Type.Union([RequestedSchema, Type.Null()]),
    catalogPartId: Type.Union([Type.String({ format: "uuid" }), Type.Null()]),
    responseDate: Type.Union([Type.String({ pattern: "^\\d{4}-\\d{2}-\\d{2}$" }), Type.Null()]),
    available: Type.Union([AvailabilitySchema, Type.Null()]),
    estAvailability: Type.Union([Type.String({ pattern: "^\\d{4}-\\d{2}-\\d{2}$" }), Type.Null()]),
    newPartNumber: Type.Union([Type.String({ maxLength: 120 }), Type.Null()]),
    newDescription: Type.Union([Type.String({ maxLength: 500 }), Type.Null()]),
    newQty: Type.Union([QuantitySchema, Type.Null()]),
    factoryPrice: Type.Union([Type.String({ pattern: "^\\d+(\\.\\d{1,4})?$" }), Type.Null()]),
    customerPrice: Type.Union([Type.String({ pattern: "^\\d+(\\.\\d{1,4})?$" }), Type.Null()]),
    comments: Type.String({ maxLength: 2000 }),
    notifyCustomer: Type.Boolean(),
    model: Type.String({ maxLength: 200 }),
    serialNumber: Type.String({ maxLength: 120 }),
    system: Type.String({ maxLength: 200 }),
    figure: Type.String({ maxLength: 80 }),
    assemblyName: Type.String({ maxLength: 200 }),
    version: Type.Integer({ minimum: 1 }),
  },
  { $id: "QuoteLine", additionalProperties: false },
);
export type QuoteLine = Static<typeof QuoteLineSchema>;

/** Customer-safe projection — never includes factoryPrice. */
export const CustomerQuoteLineDtoSchema = Type.Object(
  {
    id: Type.String({ format: "uuid" }),
    quoteNo: Type.String(),
    requestDate: Type.String(),
    customer: Type.String(),
    user: Type.String(),
    partNumber: Type.Union([Type.String(), Type.Null()]),
    description: Type.Union([Type.String(), Type.Null()]),
    qty: Type.Union([QuantitySchema, Type.Null()]),
    response: Type.Union([
      Type.Object(
        {
          available: Type.Union([AvailabilitySchema, Type.Null()]),
          estAvailability: Type.Union([Type.String(), Type.Null()]),
          newPartNumber: Type.Union([Type.String(), Type.Null()]),
          newDescription: Type.Union([Type.String(), Type.Null()]),
          newQty: Type.Union([QuantitySchema, Type.Null()]),
          unitPrice: Type.Union([Type.String(), Type.Null()]),
          totalPrice: Type.Union([Type.String(), Type.Null()]),
          comments: Type.String(),
        },
        { additionalProperties: false },
      ),
      Type.Null(),
    ]),
    priceValidUntil: Type.String(),
    expired: Type.Boolean(),
  },
  { $id: "CustomerQuoteLineDto", additionalProperties: false },
);

export const QuoteNoticeSchema = Type.Object(
  {
    id: Type.String({ format: "uuid" }),
    companyId: Type.String({ format: "uuid" }),
    customer: Type.String(),
    quoteNo: Type.String(),
    lineIds: Type.Array(Type.String({ format: "uuid" }), { minItems: 1 }),
    at: Type.String({ format: "date-time" }),
    seen: Type.Boolean(),
  },
  { $id: "QuoteNotice", additionalProperties: false },
);
export type QuoteNotice = Static<typeof QuoteNoticeSchema>;

export const SubmitQuoteLineInputSchema = Type.Object(
  {
    partId: Type.Union([Type.String({ format: "uuid" }), Type.Null()]),
    partNumber: Type.String({ minLength: 1, maxLength: 120 }),
    description: Type.String({ minLength: 1, maxLength: 500 }),
    qty: QuantitySchema,
    model: Type.Optional(Type.String({ maxLength: 200 })),
    serialNumber: Type.Optional(Type.String({ maxLength: 120 })),
    system: Type.Optional(Type.String({ maxLength: 200 })),
    figure: Type.Optional(Type.String({ maxLength: 80 })),
    assemblyName: Type.Optional(Type.String({ maxLength: 200 })),
  },
  { additionalProperties: false },
);

export const SubmitQuoteInputSchema = Type.Object(
  {
    productLine: ProductLineLabelSchema,
    shipping: Type.Union([
      Type.Object(
        {
          address: Type.String({ maxLength: 2000 }),
          method: Type.Union([Type.Literal("standard"), Type.Literal("expedited")]),
        },
        { additionalProperties: false },
      ),
      Type.Null(),
    ]),
    generalComment: NoteSchema,
    lines: Type.Array(SubmitQuoteLineInputSchema, { minItems: 1, maxItems: 250 }),
  },
  { $id: "SubmitQuoteInput", additionalProperties: false },
);
export type SubmitQuoteInput = Static<typeof SubmitQuoteInputSchema>;

export const SubmitQuoteResultSchema = Type.Object(
  {
    quoteNo: Type.String(),
    lineIds: Type.Array(Type.String({ format: "uuid" }), { minItems: 1 }),
  },
  { $id: "SubmitQuoteResult", additionalProperties: false },
);
export type SubmitQuoteResult = Static<typeof SubmitQuoteResultSchema>;

export const PatchQuoteLineInputSchema = Type.Object(
  {
    version: Type.Integer({ minimum: 1 }),
    available: Type.Optional(Type.Union([AvailabilitySchema, Type.Null()])),
    estAvailability: Type.Optional(Type.Union([Type.String({ pattern: "^\\d{4}-\\d{2}-\\d{2}$" }), Type.Null()])),
    newPartNumber: Type.Optional(Type.Union([Type.String({ maxLength: 120 }), Type.Null()])),
    newDescription: Type.Optional(Type.Union([Type.String({ maxLength: 500 }), Type.Null()])),
    newQty: Type.Optional(Type.Union([QuantitySchema, Type.Null()])),
    factoryPrice: Type.Optional(Type.Union([Type.String({ pattern: "^\\d+(\\.\\d{1,4})?$" }), Type.Null()])),
    customerPrice: Type.Optional(Type.Union([Type.String({ pattern: "^\\d+(\\.\\d{1,4})?$" }), Type.Null()])),
    comments: Type.Optional(Type.String({ maxLength: 2000 })),
    responseDate: Type.Optional(Type.Union([Type.String({ pattern: "^\\d{4}-\\d{2}-\\d{2}$" }), Type.Null()])),
  },
  { $id: "PatchQuoteLineInput", additionalProperties: false },
);

export const NotifyQuoteInputSchema = Type.Object(
  {
    lineIds: Type.Array(Type.String({ format: "uuid" }), { minItems: 1, maxItems: 250 }),
  },
  { $id: "NotifyQuoteInput", additionalProperties: false },
);

export const AddFactoryQuoteLineInputSchema = Type.Object(
  {
    quoteNo: Type.String({ minLength: 1, maxLength: 40 }),
    companyId: Type.String({ format: "uuid" }),
    productLine: ProductLineLabelSchema,
    newPartNumber: Type.String({ minLength: 1, maxLength: 120 }),
    newDescription: Type.String({ minLength: 1, maxLength: 500 }),
    newQty: QuantitySchema,
    factoryPrice: Type.Optional(Type.Union([Type.String({ pattern: "^\\d+(\\.\\d{1,4})?$" }), Type.Null()])),
    customerPrice: Type.Optional(Type.Union([Type.String({ pattern: "^\\d+(\\.\\d{1,4})?$" }), Type.Null()])),
    available: Type.Optional(AvailabilitySchema),
    comments: Type.Optional(Type.String({ maxLength: 2000 })),
  },
  { $id: "AddFactoryQuoteLineInput", additionalProperties: false },
);

export const QuoteLinePageSchema = Type.Object(
  {
    items: Type.Array(QuoteLineSchema),
    nextCursor: Type.Union([Type.String(), Type.Null()]),
  },
  { $id: "QuoteLinePage", additionalProperties: false },
);
export type QuoteLinePage = Static<typeof QuoteLinePageSchema>;

export const CustomerQuotePageSchema = Type.Object(
  {
    items: Type.Array(CustomerQuoteLineDtoSchema),
    notices: Type.Array(QuoteNoticeSchema),
    nextCursor: Type.Union([Type.String(), Type.Null()]),
  },
  { $id: "CustomerQuotePage", additionalProperties: false },
);
export type CustomerQuotePage = Static<typeof CustomerQuotePageSchema>;
export type PatchQuoteLineInput = Static<typeof PatchQuoteLineInputSchema>;
export type NotifyQuoteInput = Static<typeof NotifyQuoteInputSchema>;
export type AddFactoryQuoteLineInput = Static<typeof AddFactoryQuoteLineInputSchema>;

export const CommerceOrderLineInputSchema = Type.Object(
  {
    partNumber: Type.String({ minLength: 1, maxLength: 120 }),
    description: Type.String({ minLength: 1, maxLength: 500 }),
    qty: QuantitySchema,
    unitPrice: Type.String({ pattern: "^\\d+(\\.\\d{1,4})?$" }),
    catalogPartId: Type.Union([Type.String({ format: "uuid" }), Type.Null()]),
    quoteNo: Type.Union([Type.String({ maxLength: 40 }), Type.Null()]),
  },
  { additionalProperties: false },
);

export const AddressDtoSchema = Type.Object(
  {
    firstName: Type.String({ maxLength: 120 }),
    lastName: Type.String({ maxLength: 120 }),
    company: Type.String({ maxLength: 200 }),
    address: Type.String({ maxLength: 400 }),
    city: Type.String({ maxLength: 120 }),
    province: Type.String({ maxLength: 120 }),
    country: Type.String({ maxLength: 120 }),
    postalCode: Type.String({ maxLength: 32 }),
    email: Type.String({ maxLength: 200 }),
    phone: Type.String({ maxLength: 60 }),
  },
  { additionalProperties: false },
);

export const SubmitCommerceOrderInputSchema = Type.Object(
  {
    orderType: Type.Union([Type.Literal("regular"), Type.Literal("urgent"), Type.Literal("schedule")]),
    scheduleDate: Type.Union([Type.String({ pattern: "^\\d{4}-\\d{2}-\\d{2}$" }), Type.Null()]),
    poNumber: Type.String({ minLength: 1, maxLength: 80 }),
    vin: Type.String({ minLength: 1, maxLength: 80 }),
    shippingMethod: Type.Union([
      Type.Literal("purolator-ground"),
      Type.Literal("purolator-express"),
      Type.Literal("manitoulin"),
      Type.Null(),
    ]),
    shipping: AddressDtoSchema,
    billing: AddressDtoSchema,
    instructions: Type.String({ maxLength: 4000 }),
    currency: Type.String({ minLength: 3, maxLength: 3 }),
    lines: Type.Array(CommerceOrderLineInputSchema, { minItems: 1, maxItems: 250 }),
  },
  { $id: "SubmitCommerceOrderInput", additionalProperties: false },
);
export type SubmitCommerceOrderInput = Static<typeof SubmitCommerceOrderInputSchema>;

export const SubmitCommerceOrderResultSchema = Type.Object(
  {
    id: Type.String({ format: "uuid" }),
    reference: Type.String(),
    status: Type.Literal("submitted"),
  },
  { $id: "SubmitCommerceOrderResult", additionalProperties: false },
);

export const PatchCompanyDiscountInputSchema = Type.Object(
  {
    version: Type.Integer({ minimum: 1 }),
    discountRate: Type.String({ pattern: "^(0(\\.\\d{1,4})?|1(\\.0{1,4})?)$" }),
  },
  { $id: "PatchCompanyDiscountInput", additionalProperties: false },
);

export const CompanyDiscountResultSchema = Type.Object(
  {
    id: Type.String({ format: "uuid" }),
    name: Type.String(),
    discountRate: Type.String(),
    version: Type.Integer({ minimum: 1 }),
  },
  { $id: "CompanyDiscountResult", additionalProperties: false },
);
export type PatchCompanyDiscountInput = Static<typeof PatchCompanyDiscountInputSchema>;
export type CompanyDiscountResult = Static<typeof CompanyDiscountResultSchema>;
export type SubmitCommerceOrderResult = Static<typeof SubmitCommerceOrderResultSchema>;
