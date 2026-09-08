import { Type, type Static } from "@sinclair/typebox";

const ScopedIdsSchema = Type.Union([
  Type.Literal("all"),
  Type.Array(Type.String()),
]);

/** Safe summaries only; never include password, token, or signed-URL data. */
export const SessionScopeSummarySchema = Type.Object(
  {
    brandIds: ScopedIdsSchema,
    accountIds: ScopedIdsSchema,
    fleet: ScopedIdsSchema,
    environment: Type.Union([Type.Literal("published"), Type.Literal("draft")]),
    priceTier: Type.String(),
    canViewPrices: Type.Boolean(),
  },
  { $id: "SessionScopeSummary", additionalProperties: false },
);
export type SessionScopeSummary = Static<typeof SessionScopeSummarySchema>;

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
