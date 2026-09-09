import { and, eq, exists, sql, type SQL } from "drizzle-orm";
import type { ReleaseRef } from "@rufdiamond/contracts";
import type { Transaction } from "../../db/client.js";
import * as s from "../../db/schema/index.js";
import { loadAuthorization, requireCapability } from "../authorization/policy.js";
import { scopeSql } from "../authorization/scope-sql.js";
import type { AuthorizationContext } from "../authorization/types.js";
import { unavailable, uuid } from "../publication/validation.js";

export type CatalogContext = { userId: string; requestId: string };
export type CatalogScope = { authority: AuthorizationContext; releases: ReleaseRef[]; refs: Map<string, ReleaseRef> };

/** Capture one permitted active pointer per model, with no catalogue graph or
 * geometry transfer. All later queries use these exact release IDs under the
 * caller's same read-only repeatable-read transaction. */
export async function captureScope(tx: Transaction, ctx: CatalogContext, capability = "catalog.figure.view"): Promise<CatalogScope> {
  const authority = await loadAuthorization(tx, ctx.userId);
  requireCapability(authority, "catalog.figure.view");
  requireCapability(authority, capability);
  const releases = await tx.select({ modelId: s.releaseModel.workingId, releaseId: s.publicationRelease.id, revision: s.publicationRelease.revision })
    .from(s.publicationRelease).innerJoin(s.releaseModel, eq(s.releaseModel.releaseId, s.publicationRelease.id))
    .where(and(eq(s.publicationRelease.status, "active"), scopeSql(s.releaseModel.productLineId, authority.brandIds), exists(
      tx.select({ id: s.releaseVariant.id }).from(s.releaseVariant).where(and(eq(s.releaseVariant.releaseId, s.releaseModel.releaseId), eq(s.releaseVariant.modelId, s.releaseModel.id), scopeSql(s.releaseVariant.workingId, authority.variantIds))),
    ))).orderBy(s.publicationRelease.id);
  return { authority, releases, refs: new Map(releases.map(r => [r.releaseId, r])) };
}

export function releaseFilter(column: SQL, scope: CatalogScope): SQL {
  return scope.releases.length ? sql`${column} in (${sql.join(scope.releases.map(r => sql`${r.releaseId}::uuid`), sql`, `)})` : sql`false`;
}

/** CTE restricted by both captured release identity and current fleet policy. */
export function permittedVariants(scope: CatalogScope): SQL {
  return sql`permitted_variants AS (
    SELECT release_id, id FROM release_variant
    WHERE ${releaseFilter(sql`release_id`, scope)} AND ${scopeSql(s.releaseVariant.workingId, scope.authority.variantIds)}
  )`;
}

export function requiredId(id: string | undefined): string {
  if (!id || !uuid.test(id)) unavailable();
  return id;
}

export async function scopedVariant(tx: Transaction, scope: CatalogScope, id: string | undefined) {
  const result = await tx.execute<{ release_id: string; id: string }>(sql`
    WITH ${permittedVariants(scope)}
    SELECT v.release_id, v.id FROM release_variant v
    JOIN permitted_variants pv ON pv.release_id=v.release_id AND pv.id=v.id
    WHERE v.working_id=${requiredId(id)}::uuid LIMIT 1
  `);
  const variant = result.rows[0]; if (!variant) unavailable();
  return variant;
}
