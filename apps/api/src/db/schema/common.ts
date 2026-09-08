import { check, integer, numeric, timestamp, uuid, type AnyPgColumn } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

export const id = () => uuid("id").primaryKey().defaultRandom();
export const time = (name: string) => timestamp(name, { withTimezone: true, mode: "date" });
// Keep numeric values as strings in TypeScript: monetary arithmetic must be decimal.
export const money = (name: string) => numeric(name, { precision: 14, scale: 2 });
export const rate = (name: string) => numeric(name, { precision: 7, scale: 6 });
export const mutable = () => ({
  createdAt: time("created_at").notNull().defaultNow(),
  updatedAt: time("updated_at").notNull().defaultNow(),
  version: integer("version").notNull().default(1),
});
export const versionCheck = (table: { version: AnyPgColumn }) => check("version_positive", sql`${table.version} > 0`);
export const currencyCheck = (column: AnyPgColumn) => check("currency_iso_code", sql`${column} ~ '^[A-Z]{3}$'`);
export const checksumCheck = (column: AnyPgColumn) => check("sha256_format", sql`${column} ~ '^[a-f0-9]{64}$'`);
