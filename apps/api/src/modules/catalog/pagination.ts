import { sql, type SQL } from "drizzle-orm";
import type { Page } from "@rufdiamond/contracts";
import type { Transaction } from "../../db/client.js";
import { AppError } from "../../plugins/error-handler.js";
import { canonicalJsonHash } from "../outbox/idempotency.js";
import type { CatalogScope } from "./scope.js";

export type CatalogQuery = {
  kind: "product-lines" | "models" | "variants" | "systems" | "figures" | "search" | "usages" | "part-usages" | "usage-index";
  id?: string; systemId?: string; q?: string; mode?: "any" | "part" | "description"; cursor?: string; limit?: number;
};
type Candidate<T> = { key: string; release_id: string; item: T };

export function pageState(scope: CatalogScope, query: CatalogQuery) {
  const signature = canonicalJsonHash({ releases: scope.releases, scope: scope.authority.scopeVersion, mode: query.mode ?? "any" });
  const queryHash = canonicalJsonHash({ kind: query.kind, id: query.id ?? null, systemId: query.systemId ?? null, q: query.q ?? null });
  const limit = query.limit ?? 50;
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) throw new AppError("INVALID_PAGE_SIZE", 400, "Supply a page size from 1 to 100.");
  let after = "";
  if (query.cursor) {
    try {
      const cursor = JSON.parse(Buffer.from(query.cursor, "base64url").toString());
      if (cursor.signature !== signature || typeof cursor.key !== "string" || cursor.query !== queryHash) throw new Error();
      after = cursor.key;
    } catch { throw new AppError("CATALOG_CURSOR_STALE", 409, "Catalogue or scope changed. Restart pagination."); }
  }
  return { after, limit, signature, queryHash };
}

/** Candidate projection and pagination run in PostgreSQL. At most limit+1
 * catalogue rows cross the database boundary; the extra row is only lookahead. */
export async function candidatePage<T>(tx: Transaction, scope: CatalogScope, state: ReturnType<typeof pageState>, ctes: SQL, candidates: SQL): Promise<Page<T>> {
  const result = await tx.execute<Candidate<T>>(sql`
    WITH RECURSIVE ${ctes}, candidates AS (${candidates})
    SELECT key, release_id, item FROM candidates
    WHERE key COLLATE "C" > ${state.after} COLLATE "C"
    ORDER BY key COLLATE "C" LIMIT ${state.limit + 1}
  `);
  const selected = result.rows.slice(0, state.limit);
  const cursor = result.rows.length > state.limit ? Buffer.from(JSON.stringify({ signature: state.signature, query: state.queryHash, key: selected.at(-1)!.key })).toString("base64url") : null;
  return { items: selected.map(r => r.item), nextCursor: cursor, releases: [...new Set(selected.map(r => r.release_id))].map(id => scope.refs.get(id)!) };
}
