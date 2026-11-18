import { Type, type Static } from "@sinclair/typebox";
import { MoneySchema } from "./common.js";

// The same existing companies have access to the hosted FT3 catalogue and pricing.
export const ft3CatalogueCompanyIds = [
  "3a98c733-c616-4df3-bbaf-ea6e456f62eb",
  "8a0b574e-b4b4-428b-861a-2b1e51581a7b",
  "98a0777e-1a93-416f-a6ca-156add45b100",
] as const;

export const OrderingCataloguePartSchema = Type.Object({
  id: Type.String({ format: "uuid" }),
  sourceKey: Type.String(),
  partNumber: Type.String(),
  description: Type.String(),
  currency: Type.Union([Type.Literal("CAD"), Type.Literal("USD")]),
  revision: Type.String({ pattern: "^[a-f0-9]{64}$" }),
  listPrice: Type.Optional(MoneySchema),
}, { additionalProperties: false });
export type OrderingCataloguePart = Static<typeof OrderingCataloguePartSchema>;
export const OrderingCataloguePageSchema = Type.Object({ items: Type.Array(OrderingCataloguePartSchema) }, { additionalProperties: false });
export type OrderingCataloguePage = Static<typeof OrderingCataloguePageSchema>;
