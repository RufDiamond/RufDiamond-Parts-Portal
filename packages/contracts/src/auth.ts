import { Type, type Static } from "@sinclair/typebox";
import { PricedCompanySchema, UnpricedCompanySchema } from "./catalog.js";

const ScopedIdsSchema = Type.Union([
  Type.Literal("all"),
  Type.Array(Type.String()),
]);

const sessionScopeFields = {
  brandIds: ScopedIdsSchema,
  accountIds: ScopedIdsSchema,
  fleet: ScopedIdsSchema,
  environment: Type.Union([Type.Literal("published"), Type.Literal("draft")]),
  priceTier: Type.String(),
  scopeVersion: Type.String(),
};

/** Safe summaries only; never include password, token, or signed-URL data. */
export const SessionScopeSummarySchema = Type.Object(
  { ...sessionScopeFields, canViewPrices: Type.Boolean() },
  { $id: "SessionScopeSummary", additionalProperties: false },
);
export type SessionScopeSummary = Static<typeof SessionScopeSummarySchema>;

export const PricedSessionScopeSummarySchema = Type.Object(
  { ...sessionScopeFields, canViewPrices: Type.Literal(true) },
  { $id: "PricedSessionScopeSummary", additionalProperties: false },
);
export const UnpricedSessionScopeSummarySchema = Type.Object(
  { ...sessionScopeFields, canViewPrices: Type.Literal(false) },
  { $id: "UnpricedSessionScopeSummary", additionalProperties: false },
);

export const SessionUserSchema = Type.Object(
  {
    id: Type.String(),
    companyId: Type.String(),
    capabilities: Type.Array(Type.String()),
    scopes: SessionScopeSummarySchema,
  },
  { $id: "SessionUser", additionalProperties: false },
);
export type SessionUser = Static<typeof SessionUserSchema>;

const meFields = {
  id: Type.String(),
  companyId: Type.String(),
  displayName: Type.String(),
  capabilities: Type.Array(Type.String()),
  csrfToken: Type.String(),
};

export const PricedMeResponseSchema = Type.Object(
  {
    ...meFields,
    scopes: PricedSessionScopeSummarySchema,
    company: PricedCompanySchema,
  },
  { $id: "PricedMeResponse", additionalProperties: false },
);
export type PricedMeResponse = Static<typeof PricedMeResponseSchema>;

export const UnpricedMeResponseSchema = Type.Object(
  {
    ...meFields,
    scopes: UnpricedSessionScopeSummarySchema,
    company: UnpricedCompanySchema,
  },
  { $id: "UnpricedMeResponse", additionalProperties: false },
);
export type UnpricedMeResponse = Static<typeof UnpricedMeResponseSchema>;

export const MeResponseSchema = Type.Union(
  [PricedMeResponseSchema, UnpricedMeResponseSchema],
  { $id: "MeResponse" },
);
export type MeResponse = Static<typeof MeResponseSchema>;
