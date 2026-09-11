import { and, eq, gt, sql } from "drizzle-orm";
import type { Database } from "../../db/client.js";
import { figure, model, variant } from "../../db/schema/index.js";
import { loadAuthorization, requireCapability } from "../authorization/policy.js";
import { scopeSql } from "../authorization/scope-sql.js";
import { AppError } from "../../plugins/error-handler.js";
import { mappingTransaction } from "./repository.js";

export function discoverDraftFigures(database: Database, userId: string, query: { id?: string; cursor?: string; limit?: number }) {
  return mappingTransaction(database, async tx => {
    const scope = await loadAuthorization(tx, userId);
    requireCapability(scope, "publish.draft.view"); requireCapability(scope, "catalog.figure.view");
    if (!scope.canViewDraft) throw new AppError("FORBIDDEN", 403, "Draft catalogue access is required.");
    const limit = query.id ? 1 : query.limit ?? 50;
    const items = await tx.select({ id: figure.id, name: figure.name, version: figure.version, hasDrawing: sql<boolean>`${figure.drawingFileId} is not null` })
      .from(figure).innerJoin(variant, eq(variant.id, figure.variantId)).innerJoin(model, eq(model.id, variant.modelId))
      .where(and(scopeSql(model.productLineId, scope.brandIds), scopeSql(figure.variantId, scope.variantIds), query.id ? eq(figure.id, query.id) : undefined, query.cursor ? gt(figure.id, query.cursor) : undefined))
      .orderBy(figure.id).limit(limit + 1);
    if (query.id && !items.length) throw new AppError("FIGURE_NOT_FOUND", 404, "The requested figure was not found.");
    return { items: items.slice(0, limit), nextCursor: items.length > limit ? items[limit - 1].id : null };
  }, false);
}
