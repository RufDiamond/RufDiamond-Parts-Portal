import { Type, type Static } from "@sinclair/typebox";
import { CurrencySchema } from "./catalog.js";
import {
  AddressSchema,
  MoneySchema,
  NoteSchema,
  QuantitySchema,
  RateSchema,
} from "./common.js";

export const OrderStatusSchema = Type.Union([
  Type.Literal("submitted"),
  Type.Literal("quoted"),
  Type.Literal("confirmed"),
  Type.Literal("fulfilled"),
  Type.Literal("cancelled"),
]);
export type OrderStatus = Static<typeof OrderStatusSchema>;

export const ShippingDetailsSchema = Type.Object(
  {
    address: AddressSchema,
    method: Type.Union([
      Type.Literal("standard"),
      Type.Literal("expedited"),
      Type.Null(),
    ]),
  },
  { $id: "ShippingDetails", additionalProperties: false },
);
export type ShippingDetails = Static<typeof ShippingDetailsSchema>;

export const RfqDetailsSchema = Type.Object(
  {
    generalComment: NoteSchema,
    shipping: Type.Union([ShippingDetailsSchema, Type.Null()]),
  },
  { $id: "RfqDetails", additionalProperties: false },
);
export type RfqDetails = Static<typeof RfqDetailsSchema>;

export const SubmitOrderLineSchema = Type.Object(
  {
    releasePartId: Type.String(),
    qty: QuantitySchema,
    comment: NoteSchema,
  },
  { $id: "SubmitOrderLine", additionalProperties: false },
);
export type SubmitOrderLine = Static<typeof SubmitOrderLineSchema>;

export const SubmitOrderInputSchema = Type.Object(
  {
    variantId: Type.String(),
    releaseId: Type.String(),
    customerReference: Type.String(),
    behalfOfCompanyId: Type.Optional(Type.String()),
    details: RfqDetailsSchema,
    lines: Type.Array(SubmitOrderLineSchema, { minItems: 1, maxItems: 250 }),
  },
  { $id: "SubmitOrderInput", additionalProperties: false },
);
export type SubmitOrderInput = Static<typeof SubmitOrderInputSchema>;

export const SubmitOrderResultSchema = Type.Object(
  {
    id: Type.String(),
    reference: Type.String(),
    status: Type.Literal("submitted"),
  },
  { $id: "SubmitOrderResult", additionalProperties: false },
);
export type SubmitOrderResult = Static<typeof SubmitOrderResultSchema>;

const orderLineFields = {
  partId: Type.String(),
  releasePartId: Type.String(),
  partNumberSnapshot: Type.String(),
  descriptionSnapshot: Type.String(),
  qty: QuantitySchema,
  comment: NoteSchema,
};

export const PricedOrderLineSchema = Type.Object(
  {
    ...orderLineFields,
    unitPriceSnapshot: MoneySchema,
    lineTotal: MoneySchema,
  },
  { $id: "PricedOrderLine", additionalProperties: false },
);
export type PricedOrderLine = Static<typeof PricedOrderLineSchema>;

export const UnpricedOrderLineSchema = Type.Object(orderLineFields, {
  $id: "UnpricedOrderLine",
  additionalProperties: false,
});
export type UnpricedOrderLine = Static<typeof UnpricedOrderLineSchema>;

export const OrderLineSchema = Type.Union(
  [PricedOrderLineSchema, UnpricedOrderLineSchema],
  { $id: "OrderLine" },
);
export type OrderLine = Static<typeof OrderLineSchema>;

const orderDetailFields = {
  id: Type.String(),
  companyId: Type.String(),
  submittedByUserId: Type.String(),
  variantId: Type.String(),
  releaseId: Type.String(),
  customerReference: Type.String(),
  status: OrderStatusSchema,
  currency: CurrencySchema,
  submittedAt: Type.String(),
  details: RfqDetailsSchema,
};

export const PricedOrderDetailSchema = Type.Object(
  {
    ...orderDetailFields,
    listTotal: MoneySchema,
    discountRate: RateSchema,
    discountApplied: MoneySchema,
    netTotal: MoneySchema,
    lines: Type.Array(PricedOrderLineSchema),
  },
  { $id: "PricedOrderDetail", additionalProperties: false },
);
export type PricedOrderDetail = Static<typeof PricedOrderDetailSchema>;

export const UnpricedOrderDetailSchema = Type.Object(
  {
    ...orderDetailFields,
    lines: Type.Array(UnpricedOrderLineSchema),
  },
  { $id: "UnpricedOrderDetail", additionalProperties: false },
);
export type UnpricedOrderDetail = Static<typeof UnpricedOrderDetailSchema>;

export const OrderDetailSchema = Type.Union(
  [PricedOrderDetailSchema, UnpricedOrderDetailSchema],
  { $id: "OrderDetail" },
);
export type OrderDetail = Static<typeof OrderDetailSchema>;
