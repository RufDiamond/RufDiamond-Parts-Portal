import type { Database } from "../../db/client.js";
import { AppError } from "../../plugins/error-handler.js";
import { mappingTransaction } from "../diagram-mapping/repository.js";
import type { DrawingStorage } from "../drawings/storage.js";
import { drawingIdentity, readFigure } from "./figure-queries.js";
import { navigationPage, partPage } from "./list-queries.js";
import { pageState, type CatalogQuery } from "./pagination.js";
import { captureScope, type CatalogContext } from "./scope.js";

export type { CatalogQuery } from "./pagination.js";
const navigationKinds = new Set<CatalogQuery["kind"]>(["product-lines", "models", "variants", "systems", "figures"]);

export function createCatalogRepository(database: Database, storage: DrawingStorage) {
  async function readPublishedFigure(ctx: CatalogContext, figureId: string) {
    return mappingTransaction(database, async tx => readFigure(tx, await captureScope(tx, ctx), figureId), false);
  }

  async function list(ctx: CatalogContext, query: CatalogQuery) {
    return mappingTransaction(database, async tx => {
      const navigation = navigationKinds.has(query.kind);
      const capability = navigation ? query.kind === "figures" ? "catalog.figure.view" : "catalog.model.view" : "parts.record.view";
      const scope = await captureScope(tx, ctx, capability);
      const state = pageState(scope, query);
      return navigation ? navigationPage(tx, scope, query, state) : partPage(tx, scope, query, state);
    }, false);
  }

  async function drawing(ctx: CatalogContext, figureId: string, releaseId: string) {
    const select = () => mappingTransaction(database, async tx => drawingIdentity(tx, await captureScope(tx, ctx), figureId, releaseId), false);
    const source = await select();
    let url: string;
    try { url = await storage.createDownload(source.objectKey, source.objectVersionId, 300); }
    catch { throw new AppError("DRAWING_UNAVAILABLE", 503, "Drawing delivery is temporarily unavailable."); }
    // Repeat only authorization, active identity and drawing version after
    // external signing; never load part rows, callouts or geometry for delivery.
    await select();
    return url;
  }
  return { readPublishedFigure, list, drawing };
}
