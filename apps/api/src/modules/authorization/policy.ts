import { createHash } from "node:crypto";

import { sql } from "drizzle-orm";

import type { Database, Transaction } from "../../db/client.js";
import { AppError } from "../../plugins/error-handler.js";
import type { AuthorizationResolver } from "../identity/service.js";
import { isCapabilityKey } from "./capabilities.js";
import type { AuthorizationContext, ScopedTarget, ScopeIds, UserManagementTarget } from "./types.js";

interface AuthorizationRow {
  user_id: string;
  company_id: string;
  user_status: string;
  company_status: string;
  company_type: "customer" | "dealer" | "internal";
  role_id: string;
  role_key: string;
  brand_mode: "company" | "all" | "subset" | null;
  account_mode: "own" | "all" | "subset" | null;
  fleet_mode: "company" | "all" | "subset" | null;
  environment: "published" | "published_and_draft" | null;
  user_price_tier_id: string | null;
  user_tier_key: string | null;
  user_tier_discount: string | null;
  company_price_tier_id: string | null;
  company_tier_key: string | null;
  company_tier_discount: string | null;
  company_discount: string;
  technician_pricing_visible: boolean;
  user_version: number;
  company_version: number;
  role_version: number;
  scope_version: number | null;
  user_tier_version: number | null;
  company_tier_version: number | null;
}

interface VersionedIdRow { id: string; version: number }
interface VersionedCapabilityRow { source: "role" | "user"; key: string; version: number }
interface DealerAccountRow extends VersionedIdRow {
  status: string;
  company_version: number;
  price_tier_id: string | null;
  discount_rate: string;
  technician_pricing_visible: boolean;
}

function forbidden(): never {
  throw new AppError("FORBIDDEN", 403, "This action is not permitted.");
}

function sortedUnique(values: readonly string[]): string[] {
  return [...new Set(values)].sort();
}

function intersection(left: readonly string[], right: readonly string[]): string[] {
  const allowed = new Set(right);
  return sortedUnique(left.filter(value => allowed.has(value)));
}

function contains(scope: ScopeIds, id: string): boolean {
  return scope === "all" || scope.includes(id);
}

function externalScope(mode: "company" | "all" | "subset", companyIds: readonly string[], subsetIds: readonly string[]): string[] {
  return mode === "subset" ? intersection(subsetIds, companyIds) : sortedUnique(companyIds);
}

function accountScope(
  companyType: AuthorizationRow["company_type"],
  mode: "own" | "all" | "subset",
  ownCompanyId: string,
  dealerAccounts: readonly string[],
  userAccounts: readonly string[],
): ScopeIds {
  if (companyType === "internal" && mode === "all") return "all";
  const companyAccounts = companyType === "internal"
    ? userAccounts
    : sortedUnique([ownCompanyId, ...dealerAccounts]);
  if (mode === "own") return [ownCompanyId];
  return mode === "subset" ? intersection(userAccounts, companyAccounts) : companyAccounts;
}

function resourceScope(
  companyType: AuthorizationRow["company_type"],
  mode: "company" | "all" | "subset",
  companyIds: readonly string[],
  subsetIds: readonly string[],
): ScopeIds {
  if (companyType === "internal" && mode === "all") return "all";
  if (companyType === "internal" && mode === "subset") return sortedUnique(subsetIds);
  return externalScope(mode, companyIds, subsetIds);
}

function hashVersion(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

export function requireCapability(ctx: AuthorizationContext, key: string): void {
  if (key === "publish.block.override" || !isCapabilityKey(key) || !ctx.capabilities.has(key)) forbidden();
}

export function requireBehalfOf(ctx: AuthorizationContext, target: ScopedTarget): void {
  requireCapability(ctx, "orders.behalf");
  if (target.companyId === ctx.companyId
    || !contains(ctx.accountIds, target.companyId)
    || !contains(ctx.brandIds, target.brandId)
    || !contains(ctx.variantIds, target.variantId)) forbidden();
}

export function requireUserManagement(ctx: AuthorizationContext, target: UserManagementTarget): void {
  if (!contains(ctx.accountIds, target.companyId)) forbidden();
  if (target.changesRole && target.userId === ctx.userId) forbidden();
  if (target.companyId === ctx.companyId && ctx.capabilities.has("users.own.manage")) return;
  requireCapability(ctx, "users.all.manage");
}

async function authorizationRows(tx: Transaction, userId: string) {
  const baseResult = await tx.execute(sql`
    SELECT u.id AS user_id, u.company_id, u.status AS user_status, u.role_id,
      u.version AS user_version, c.status AS company_status, c.type AS company_type,
      c.price_tier_id AS company_price_tier_id, c.discount_rate AS company_discount,
      c.technician_pricing_visible, c.version AS company_version,
      r.key AS role_key, r.version AS role_version,
      us.brand_mode, us.account_mode, us.fleet_mode, us.environment,
      us.price_tier_id AS user_price_tier_id, us.version AS scope_version,
      upt.key AS user_tier_key, upt.discount_rate AS user_tier_discount,
      upt.version AS user_tier_version,
      cpt.key AS company_tier_key, cpt.discount_rate AS company_tier_discount,
      cpt.version AS company_tier_version
    FROM app_user u
    JOIN company c ON c.id = u.company_id
    JOIN role r ON r.id = u.role_id
    LEFT JOIN user_scope us ON us.user_id = u.id
    LEFT JOIN price_tier upt ON upt.id = us.price_tier_id
    LEFT JOIN price_tier cpt ON cpt.id = c.price_tier_id
    WHERE u.id = ${userId}
  `);
  const base = baseResult.rows[0] as unknown as AuthorizationRow | undefined;

  const capabilities = (await tx.execute(sql`
    SELECT 'role'::text AS source, rc.capability_key AS key, rc.version
    FROM role_capability rc
    JOIN app_user u ON u.role_id = rc.role_id
    WHERE u.id = ${userId}
    UNION ALL
    SELECT 'user'::text AS source, uc.capability_key AS key, uc.version
    FROM user_capability uc
    WHERE uc.user_id = ${userId}
    ORDER BY source, key
  `)).rows as unknown as VersionedCapabilityRow[];
  const companyBrands = (await tx.execute(sql`
    SELECT product_line_id AS id, version FROM company_product_line
    WHERE company_id = ${base?.company_id ?? "00000000-0000-0000-0000-000000000000"}
    ORDER BY product_line_id
  `)).rows as unknown as VersionedIdRow[];
  const companyVariants = (await tx.execute(sql`
    SELECT variant_id AS id, version FROM company_machine
    WHERE company_id = ${base?.company_id ?? "00000000-0000-0000-0000-000000000000"}
    ORDER BY variant_id, id
  `)).rows as unknown as VersionedIdRow[];
  const userBrands = (await tx.execute(sql`
    SELECT product_line_id AS id, version FROM user_product_line_scope
    WHERE user_id = ${userId} ORDER BY product_line_id
  `)).rows as unknown as VersionedIdRow[];
  const userAccounts = (await tx.execute(sql`
    SELECT uas.company_id AS id, uas.version
    FROM user_account_scope uas
    JOIN company c ON c.id = uas.company_id AND c.status = 'active'
    WHERE uas.user_id = ${userId} ORDER BY uas.company_id
  `)).rows as unknown as VersionedIdRow[];
  const userVariants = (await tx.execute(sql`
    SELECT variant_id AS id, version FROM user_fleet_scope
    WHERE user_id = ${userId} ORDER BY variant_id
  `)).rows as unknown as VersionedIdRow[];
  const dealerAccounts = (await tx.execute(sql`
    SELECT dcs.customer_company_id AS id, dcs.version, c.status,
      c.version AS company_version, c.price_tier_id, c.discount_rate,
      c.technician_pricing_visible
    FROM dealer_customer_scope dcs
    JOIN company c ON c.id = dcs.customer_company_id
    WHERE dcs.dealer_company_id = ${base?.company_id ?? "00000000-0000-0000-0000-000000000000"}
    ORDER BY dcs.customer_company_id
  `)).rows as unknown as DealerAccountRow[];
  return { base, capabilities, companyBrands, companyVariants, userBrands, userAccounts, userVariants, dealerAccounts };
}

export async function loadAuthorization(tx: Transaction, userId: string): Promise<AuthorizationContext> {
  const rows = await authorizationRows(tx, userId);
  const { base } = rows;
  if (!base || base.user_status !== "active" || base.company_status !== "active"
    || !base.brand_mode || !base.account_mode || !base.fleet_mode || !base.environment) forbidden();

  const capabilities = new Set(rows.capabilities.map(row => row.key)
    .filter(key => key !== "publish.block.override" && isCapabilityKey(key)));
  const activeDealerAccounts = base.company_type === "dealer"
    ? rows.dealerAccounts.filter(row => row.status === "active").map(row => row.id)
    : [];
  const brandIds = resourceScope(base.company_type, base.brand_mode, rows.companyBrands.map(row => row.id), rows.userBrands.map(row => row.id));
  const variantIds = resourceScope(base.company_type, base.fleet_mode, rows.companyVariants.map(row => row.id), rows.userVariants.map(row => row.id));
  const accountIds = accountScope(base.company_type, base.account_mode, base.company_id, activeDealerAccounts, rows.userAccounts.map(row => row.id));
  const technicianSemantics = capabilities.has("orders.list.build") && !capabilities.has("orders.submit");
  const canViewPrices = capabilities.has("pricing.cost.view")
    && (!technicianSemantics || base.technician_pricing_visible);
  const priceTierId = base.user_price_tier_id ?? base.company_price_tier_id;
  const discountRate = base.user_price_tier_id
    ? base.user_tier_discount
    : base.company_price_tier_id
      ? base.company_tier_discount
      : base.company_discount;
  if (discountRate === null) forbidden();

  return {
    userId: base.user_id,
    companyId: base.company_id,
    capabilities,
    brandIds,
    accountIds,
    variantIds,
    canViewDraft: base.environment === "published_and_draft" && capabilities.has("publish.draft.view"),
    canViewPrices,
    scopeVersion: hashVersion(rows),
    priceTierId,
    discountRate,
  };
}

export async function loadBehalfOfAuthorization(
  tx: Transaction,
  actor: AuthorizationContext,
  target: ScopedTarget,
): Promise<AuthorizationContext> {
  requireBehalfOf(actor, target);
  const result = await tx.execute(sql`
    SELECT c.id, c.price_tier_id, c.discount_rate AS company_discount,
      c.version AS company_version, pt.discount_rate AS tier_discount,
      pt.version AS tier_version, cpl.version AS brand_version,
      cm.version AS fleet_version
    FROM company c
    JOIN company_product_line cpl
      ON cpl.company_id = c.id AND cpl.product_line_id = ${target.brandId}
    JOIN company_machine cm
      ON cm.company_id = c.id AND cm.variant_id = ${target.variantId}
    LEFT JOIN price_tier pt ON pt.id = c.price_tier_id
    WHERE c.id = ${target.companyId} AND c.status = 'active'
  `);
  const row = result.rows[0] as {
    id: string;
    price_tier_id: string | null;
    company_discount: string;
    tier_discount: string | null;
    company_version: number;
    tier_version: number | null;
    brand_version: number;
    fleet_version: number;
  } | undefined;
  if (!row) forbidden();
  const discountRate = row.price_tier_id ? row.tier_discount : row.company_discount;
  if (discountRate === null) forbidden();
  return {
    ...actor,
    companyId: target.companyId,
    brandIds: [target.brandId],
    accountIds: [target.companyId],
    variantIds: [target.variantId],
    scopeVersion: hashVersion({ actor: actor.scopeVersion, target, policy: row }),
    priceTierId: row.price_tier_id,
    discountRate,
  };
}

async function safeTierKey(tx: Transaction, priceTierId: string | null): Promise<string> {
  if (!priceTierId) return "company";
  const result = await tx.execute(sql`SELECT key FROM price_tier WHERE id = ${priceTierId}`);
  return (result.rows[0] as { key: string } | undefined)?.key ?? "";
}

export function createDatabaseAuthorizationResolver(database: Database): AuthorizationResolver {
  return input => database.transaction(async tx => {
    const context = await loadAuthorization(tx, input.userId);
    if (context.companyId !== input.companyId) forbidden();
    return {
      capabilities: [...context.capabilities].sort(),
      scopes: {
        brandIds: context.brandIds === "all" ? "all" : [...context.brandIds],
        accountIds: context.accountIds === "all" ? "all" : [...context.accountIds],
        fleet: context.variantIds === "all" ? "all" : [...context.variantIds],
        environment: context.canViewDraft ? "draft" as const : "published" as const,
        priceTier: context.canViewPrices ? await safeTierKey(tx, context.priceTierId) : "",
        scopeVersion: context.scopeVersion,
        canViewPrices: context.canViewPrices,
      },
      effectiveDiscountRate: context.canViewPrices ? context.discountRate : undefined,
    };
  }, { isolationLevel: "repeatable read", accessMode: "read only" });
}
