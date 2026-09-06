import { sql } from "drizzle-orm";
import { boolean, check, index, pgTable, primaryKey, text, unique, uuid } from "drizzle-orm/pg-core";
import { productLine, variant } from "./catalog.js";
import { id, mutable, rate, time, versionCheck } from "./common.js";

export const priceTier = pgTable("price_tier", {
  id: id(), key: text("key").notNull().unique(), name: text("name").notNull(), discountRate: rate("discount_rate").notNull().default("0"), ...mutable(),
}, t => [versionCheck(t), check("tier_discount_range", sql`${t.discountRate} BETWEEN 0 AND 1`)]);

export const company = pgTable("company", {
  id: id(), name: text("name").notNull(), type: text("type", { enum: ["customer", "dealer", "internal"] }).notNull().default("customer"),
  status: text("status", { enum: ["active", "suspended", "inactive"] }).notNull().default("active"), discountRate: rate("discount_rate").notNull().default("0"),
  priceTierId: uuid("price_tier_id").references(() => priceTier.id), technicianPricingVisible: boolean("technician_pricing_visible").notNull().default(true), ...mutable(),
}, t => [versionCheck(t), check("company_type", sql`${t.type} IN ('customer','dealer','internal')`), check("company_status", sql`${t.status} IN ('active','suspended','inactive')`), check("company_discount_range", sql`${t.discountRate} BETWEEN 0 AND 1`)]);

export const companyProductLine = pgTable("company_product_line", {
  companyId: uuid("company_id").notNull().references(() => company.id), productLineId: uuid("product_line_id").notNull().references(() => productLine.id), ...mutable(),
}, t => [primaryKey({ columns: [t.companyId, t.productLineId] }), versionCheck(t)]);

export const companyMachine = pgTable("company_machine", {
  id: id(), companyId: uuid("company_id").notNull().references(() => company.id), variantId: uuid("variant_id").notNull().references(() => variant.id), unitReference: text("unit_reference").notNull(), ...mutable(),
}, t => [unique("company_machine_unit").on(t.companyId, t.unitReference), index("company_machine_variant").on(t.companyId, t.variantId), versionCheck(t)]);

export const role = pgTable("role", {
  id: id(), key: text("key").notNull().unique(), name: text("name").notNull(), ...mutable(),
}, t => [versionCheck(t)]);

export const capability = pgTable("capability", { key: text("key").primaryKey(), description: text("description").notNull() });

export const roleCapability = pgTable("role_capability", {
  roleId: uuid("role_id").notNull().references(() => role.id), capabilityKey: text("capability_key").notNull().references(() => capability.key), ...mutable(),
}, t => [primaryKey({ columns: [t.roleId, t.capabilityKey] }), versionCheck(t)]);

export const appUser = pgTable("app_user", {
  id: id(), companyId: uuid("company_id").notNull().references(() => company.id), name: text("name").notNull(), email: text("email").notNull().unique(), passwordHash: text("password_hash").notNull(),
  roleId: uuid("role_id").notNull().references(() => role.id), status: text("status", { enum: ["active", "suspended", "invited", "disabled"] }).notNull().default("active"), ...mutable(),
}, t => [index("app_user_company").on(t.companyId), versionCheck(t), check("user_email_canonical", sql`${t.email} = lower(btrim(${t.email})) AND position('@' IN ${t.email}) > 1`), check("user_status", sql`${t.status} IN ('active','suspended','invited','disabled')`)]);

// Named staff receive a capability grant, never an identity check in application code.
export const userCapability = pgTable("user_capability", {
  userId: uuid("user_id").notNull().references(() => appUser.id), capabilityKey: text("capability_key").notNull().references(() => capability.key), grantedByUserId: uuid("granted_by_user_id").references(() => appUser.id), ...mutable(),
}, t => [primaryKey({ columns: [t.userId, t.capabilityKey] }), versionCheck(t)]);

// Missing scope rows must deny. Subset rows narrow these modes; they grant no capability.
export const userScope = pgTable("user_scope", {
  userId: uuid("user_id").primaryKey().references(() => appUser.id),
  brandMode: text("brand_mode", { enum: ["company", "all", "subset"] }).notNull().default("company"),
  accountMode: text("account_mode", { enum: ["own", "all", "subset"] }).notNull().default("own"),
  fleetMode: text("fleet_mode", { enum: ["company", "all", "subset"] }).notNull().default("company"),
  environment: text("environment", { enum: ["published", "published_and_draft"] }).notNull().default("published"),
  priceTierId: uuid("price_tier_id").references(() => priceTier.id), ...mutable(),
}, t => [versionCheck(t), check("scope_brand_mode", sql`${t.brandMode} IN ('company','all','subset')`), check("scope_account_mode", sql`${t.accountMode} IN ('own','all','subset')`), check("scope_fleet_mode", sql`${t.fleetMode} IN ('company','all','subset')`), check("scope_environment", sql`${t.environment} IN ('published','published_and_draft')`)]);

export const userProductLineScope = pgTable("user_product_line_scope", {
  userId: uuid("user_id").notNull().references(() => userScope.userId), productLineId: uuid("product_line_id").notNull().references(() => productLine.id), ...mutable(),
}, t => [primaryKey({ columns: [t.userId, t.productLineId] }), versionCheck(t)]);

export const userAccountScope = pgTable("user_account_scope", {
  userId: uuid("user_id").notNull().references(() => userScope.userId), companyId: uuid("company_id").notNull().references(() => company.id), ...mutable(),
}, t => [primaryKey({ columns: [t.userId, t.companyId] }), versionCheck(t)]);

export const userFleetScope = pgTable("user_fleet_scope", {
  userId: uuid("user_id").notNull().references(() => userScope.userId), variantId: uuid("variant_id").notNull().references(() => variant.id), ...mutable(),
}, t => [primaryKey({ columns: [t.userId, t.variantId] }), versionCheck(t)]);

// An explicit dealer/customer pair is required in addition to orders.behalf.
export const dealerCustomerScope = pgTable("dealer_customer_scope", {
  dealerCompanyId: uuid("dealer_company_id").notNull().references(() => company.id), customerCompanyId: uuid("customer_company_id").notNull().references(() => company.id), ...mutable(),
}, t => [primaryKey({ columns: [t.dealerCompanyId, t.customerCompanyId] }), versionCheck(t), check("dealer_customer_distinct", sql`${t.dealerCompanyId} <> ${t.customerCompanyId}`)]);

export const session = pgTable("session", {
  id: id(), tokenHash: text("token_hash").notNull().unique(), userId: uuid("user_id").notNull().references(() => appUser.id),
  expiresAt: time("expires_at").notNull(), idleExpiresAt: time("idle_expires_at").notNull(), lastUsedAt: time("last_used_at").notNull().defaultNow(), revokedAt: time("revoked_at"),
  csrfTokenHash: text("csrf_token_hash").notNull(), ipHash: text("ip_hash"), userAgent: text("user_agent"), ...mutable(),
}, t => [index("session_user").on(t.userId), versionCheck(t), check("session_expiry", sql`${t.expiresAt} > ${t.createdAt} AND ${t.idleExpiresAt} <= ${t.expiresAt}`)]);

export const passwordResetToken = pgTable("password_reset_token", {
  id: id(), tokenHash: text("token_hash").notNull().unique(), userId: uuid("user_id").notNull().references(() => appUser.id), expiresAt: time("expires_at").notNull(), consumedAt: time("consumed_at"), ...mutable(),
}, t => [index("reset_user").on(t.userId), versionCheck(t), check("reset_expiry", sql`${t.expiresAt} > ${t.createdAt}`)]);
