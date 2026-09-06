import { Type, type Static } from "@sinclair/typebox";
import { OrderLineSchema } from "./catalog.js";

export interface SubmitOrderInput {
  variantId: string;
  customerReference: string;
  behalfOfCompanyId?: string;
  lines: Array<{ releasePartId: string; qty: number }>;
}

export const SubmitOrderInputSchema = Type.Object(
  {
    variantId: Type.String(),
    customerReference: Type.String(),
    behalfOfCompanyId: Type.Optional(Type.String()),
    lines: Type.Array(
      Type.Object({ releasePartId: Type.String(), qty: Type.Number() }),
      { minItems: 1 },
    ),
  },
  { $id: "SubmitOrderInput" },
);

export const OrderDetailSchema = Type.Object(
  {
    id: Type.String(),
    companyId: Type.String(),
    submittedByUserId: Type.String(),
    variantId: Type.String(),
    customerReference: Type.String(),
    status: Type.String(),
    currency: Type.String(),
    listTotal: Type.Number(),
    discountTotal: Type.Number(),
    netTotal: Type.Number(),
    submittedAt: Type.String(),
    lines: Type.Array(OrderLineSchema),
  },
  { $id: "OrderDetail" },
);
export type OrderDetail = Static<typeof OrderDetailSchema>;
