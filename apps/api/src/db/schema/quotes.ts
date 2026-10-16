import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgSequence,
  pgTable,
  text,
  uuid,
} from "drizzle-orm/pg-core";
import { part } from "./catalog.js";
import { appUser, company } from "./identity.js";
import { currencyCheck, id, money, mutable, rate, time, versionCheck } from "./common.js";

export type QuoteRequested = { partNumber: string; description: string; qty: number };

export type CommerceAddress = {
  firstName: string;
  lastName: string;
  company: string;
  address: string;
  city: string;
  province: string;
  country: string;
  postalCode: string;
  email: string;
  phone: string;
};

export const quoteReferenceSeq = pgSequence("quote_reference_seq");
export const commerceOrderReferenceSeq = pgSequence("commerce_order_reference_seq");

export const quoteLine = pgTable("quote_line", {
  id: id(),
  companyId: uuid("company_id").notNull().references(() => company.id),
  submittedByUserId: uuid("submitted_by_user_id").notNull().references(() => appUser.id),
  quoteNo: text("quote_no").notNull(),
  requestDate: date("request_date").notNull(),
  productLine: text("product_line", { enum: ["Fat Truck", "IronHorse", "Agilis"] }).notNull(),
  customerName: text("customer_name").notNull(),
  userName: text("user_name").notNull(),
  requested: jsonb("requested").$type<QuoteRequested | null>(),
  catalogPartId: uuid("catalog_part_id").references(() => part.id),
  responseDate: date("response_date"),
  available: text("available", { enum: ["yes", "partial", "no"] }),
  estAvailability: date("est_availability"),
  newPartNumber: text("new_part_number"),
  newDescription: text("new_description"),
  newQty: integer("new_qty"),
  factoryPrice: numeric("factory_price", { precision: 14, scale: 4 }),
  customerPrice: numeric("customer_price", { precision: 14, scale: 4 }),
  comments: text("comments").notNull().default(""),
  notifyCustomer: boolean("notify_customer").notNull().default(false),
  model: text("model").notNull().default("—"),
  serialNumber: text("serial_number").notNull().default("—"),
  system: text("system").notNull().default("—"),
  figure: text("figure").notNull().default("—"),
  assemblyName: text("assembly_name").notNull().default("—"),
  ...mutable(),
}, (t) => [
  index("quote_line_company_quote").on(t.companyId, t.quoteNo, t.requestDate, t.id),
  index("quote_line_admin_recent").on(t.requestDate, t.id),
  versionCheck(t),
  check("quote_line_product_line", sql`${t.productLine} IN ('Fat Truck','IronHorse','Agilis')`),
  check("quote_line_available", sql`${t.available} IS NULL OR ${t.available} IN ('yes','partial','no')`),
  check("quote_line_qty", sql`${t.newQty} IS NULL OR ${t.newQty} > 0`),
]);

export const quoteNotice = pgTable("quote_notice", {
  id: id(),
  companyId: uuid("company_id").notNull().references(() => company.id),
  customerName: text("customer_name").notNull(),
  quoteNo: text("quote_no").notNull(),
  lineIds: uuid("line_ids").array().notNull(),
  at: time("at").notNull().defaultNow(),
  seen: boolean("seen").notNull().default(false),
  ...mutable(),
}, (t) => [
  index("quote_notice_company").on(t.companyId, t.seen, t.at),
  versionCheck(t),
]);

export const commerceOrder = pgTable("commerce_order", {
  id: id(),
  companyId: uuid("company_id").notNull().references(() => company.id),
  submittedByUserId: uuid("submitted_by_user_id").notNull().references(() => appUser.id),
  reference: text("reference").notNull().unique(),
  customerPo: text("customer_po").notNull(),
  vin: text("vin").notNull(),
  orderType: text("order_type", { enum: ["regular", "urgent", "schedule"] }).notNull(),
  scheduleDate: date("schedule_date"),
  shippingMethod: text("shipping_method", { enum: ["purolator-ground", "purolator-express", "manitoulin"] }),
  shippingAddress: jsonb("shipping_address").$type<CommerceAddress>().notNull(),
  billingAddress: jsonb("billing_address").$type<CommerceAddress>().notNull(),
  instructions: text("instructions").notNull().default(""),
  currency: text("currency").notNull(),
  listTotal: money("list_total").notNull(),
  discountRate: rate("discount_rate").notNull().default("0"),
  discountApplied: money("discount_applied").notNull(),
  netTotal: money("net_total").notNull(),
  status: text("status", { enum: ["submitted", "confirmed", "fulfilled", "cancelled"] }).notNull().default("submitted"),
  submittedAt: time("submitted_at").notNull().defaultNow(),
  ...mutable(),
}, (t) => [
  index("commerce_order_company").on(t.companyId, t.submittedAt, t.id),
  versionCheck(t),
  currencyCheck(t.currency),
  check("commerce_order_type", sql`${t.orderType} IN ('regular','urgent','schedule')`),
  check("commerce_order_status", sql`${t.status} IN ('submitted','confirmed','fulfilled','cancelled')`),
]);

export const commerceOrderLine = pgTable("commerce_order_line", {
  id: id(),
  orderId: uuid("order_id").notNull().references(() => commerceOrder.id, { onDelete: "cascade" }),
  partNumber: text("part_number").notNull(),
  description: text("description").notNull(),
  qty: integer("qty").notNull(),
  unitPrice: numeric("unit_price", { precision: 14, scale: 4 }).notNull(),
  lineTotal: money("line_total").notNull(),
  catalogPartId: uuid("catalog_part_id").references(() => part.id),
  quoteNo: text("quote_no"),
  priceSource: text("price_source", { enum: ["quote", "catalogue"] }),
  quoteLineId: uuid("quote_line_id").references(() => quoteLine.id),
  releaseId: uuid("release_id"),
  releasePartId: uuid("release_part_id"),
  listPriceSnapshot: numeric("list_price_snapshot", { precision: 14, scale: 4 }),
  discountRateSnapshot: numeric("discount_rate_snapshot", { precision: 14, scale: 6 }),
  ...mutable(),
}, (t) => [
  index("commerce_order_line_order").on(t.orderId),
  index("commerce_order_line_quote").on(t.quoteLineId),
  versionCheck(t),
  check("commerce_order_line_qty", sql`${t.qty} > 0`),
  check("commerce_order_line_source", sql`${t.priceSource} IS NULL OR ${t.priceSource} IN ('quote','catalogue')`),
]);
