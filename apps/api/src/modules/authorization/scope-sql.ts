import { inArray, sql, type AnyColumn, type SQL } from "drizzle-orm";

import type { ScopeIds } from "./types.js";

/** Build a parameterized query predicate. Empty scope is an explicit false. */
export function scopeSql<TColumn extends AnyColumn>(column: TColumn, scope: ScopeIds): SQL {
  if (scope === "all") return sql`true`;
  if (scope.length === 0) return sql`false`;
  return inArray(column, scope);
}
