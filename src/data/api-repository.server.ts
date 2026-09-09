import "server-only";
import {
  FigureDetailSchema, ModelSchema, PageSchema, PartSchema, PartUsageRowSchema,
  PartUsageIndexEntrySchema, ProductLineSchema, ReleasedFigureSchema, SystemSchema,
  VariantSchema, MeResponseSchema, type Page, type PartUsageSummary, type ReleaseRef,
} from "@rufdiamond/contracts";
import type { Static, TSchema } from "@sinclair/typebox";
import { CatalogApiError } from "@/lib/api-error";
import { readApiContract, type ApiRead } from "./api-response.server";
import { validateFigureIdentity } from "./api-figure.server";

function id(value: string): string {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)) throw new CatalogApiError(404, "CATALOGUE_UNAVAILABLE");
  return value;
}

/** Dormant server repository. No seed imports, global session/cache or implicit mode selection. */
export function createApiRepository(read: ApiRead) {
  async function aggregate<S extends TSchema>(path: string, item: S, identity: (entry: Static<S>) => string): Promise<Page<Static<S>>> {
    for (let attempt = 0; attempt < 2; attempt++) {
      const items: Static<S>[] = [];
      const refs = new Map<string, ReleaseRef>();
      const cursors = new Set<string>();
      const identities = new Set<string>();
      let cursor: string | null = null;
      try {
        for (let pageNumber = 0; pageNumber < 100; pageNumber++) {
          const pagePath: string = `${path}${path.includes("?") ? "&" : "?"}limit=100${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`;
          const page: Page<Static<S>> = await readApiContract(read, pagePath, PageSchema(item));
          if (page.items.length > 100 || page.items.length > 0 && page.releases.length === 0) throw new CatalogApiError(502, "INVALID_CATALOG_PAGINATION");
          for (const ref of page.releases) {
            const previous = refs.get(ref.modelId);
            if (previous && (previous.releaseId !== ref.releaseId || previous.revision !== ref.revision)) throw new CatalogApiError(502, "INVALID_CATALOG_PAGINATION");
            refs.set(ref.modelId, ref);
          }
          for (const entry of page.items) {
            const key = identity(entry);
            if (!key || identities.has(key)) throw new CatalogApiError(502, "INVALID_CATALOG_PAGINATION");
            identities.add(key);
            items.push(entry);
          }
          if (page.nextCursor === null) return { items, releases: [...refs.values()], nextCursor: null };
          if (!page.nextCursor || page.nextCursor.length > 4096 || cursors.has(page.nextCursor)) throw new CatalogApiError(502, "INVALID_CATALOG_PAGINATION");
          cursors.add(page.nextCursor);
          cursor = page.nextCursor;
        }
        throw new CatalogApiError(503, "CATALOG_AGGREGATE_LIMIT", "This catalogue exceeds the current page limit. Narrow the selection.");
      } catch (error) {
        if (attempt === 0 && error instanceof CatalogApiError && error.status === 409 && error.code === "CATALOG_CURSOR_STALE") continue;
        throw error;
      }
    }
    throw new CatalogApiError(409, "CATALOG_CURSOR_STALE");
  }
  async function getFigureDetail(figureId: string) {
    const requestedId = id(figureId);
    return validateFigureIdentity(await readApiContract(read, `catalog/figures/${requestedId}`, FigureDetailSchema), requestedId);
  }
  function searchQuery(query: string, mode: "any" | "part" | "description" = "any") {
    if (query.length > 200 || !["any", "part", "description"].includes(mode)) throw new CatalogApiError(400, "INVALID_SEARCH");
    return `q=${encodeURIComponent(query)}&mode=${mode}`;
  }
  return {
    getMe: () => readApiContract(read, "me", MeResponseSchema),
    getProductLines: () => aggregate("catalog/product-lines", ProductLineSchema, item => item.id),
    getModels: () => aggregate("catalog/models", ModelSchema, item => item.id),
    getVariants: async (modelId: string) => {
      const result = await aggregate(`catalog/models/${id(modelId)}/variants`, VariantSchema, item => item.id);
      if (result.items.some(item => item.modelId !== modelId) || result.releases.some(ref => ref.modelId !== modelId)) throw new CatalogApiError(502, "INVALID_CATALOG_IDENTITY");
      return result;
    },
    getSystems: (variantId: string) => aggregate(`catalog/variants/${id(variantId)}/systems`, SystemSchema, item => item.id),
    getFigures: async (variantId: string, systemId: string) => {
      const result = await aggregate(`catalog/variants/${id(variantId)}/systems/${id(systemId)}/figures`, ReleasedFigureSchema, item => item.id);
      if (result.items.some(item => item.variantId !== variantId || item.systemId !== systemId)) throw new CatalogApiError(502, "INVALID_CATALOG_IDENTITY");
      return result;
    },
    getFigureDetail,
    getFigure: getFigureDetail,
    searchParts: (query: string) => aggregate(`catalog/parts/search?${searchQuery(query)}`, PartSchema, part => part.releasePartId),
    searchPartUsages: (query: string, mode: "any" | "part" | "description" = "any") => aggregate(`catalog/parts/usages?${searchQuery(query, mode)}`, PartUsageRowSchema, row => JSON.stringify([row.part.releasePartId, row.figureId])),
    getPartUsages: (partId: string) => aggregate(`catalog/parts/${id(partId)}/usages`, PartUsageRowSchema, row => JSON.stringify([row.part.releasePartId, row.figureId])),
    async getPartUsageIndex(): Promise<{ items: Record<string, PartUsageSummary>; releases: ReleaseRef[] }> {
      const result = await aggregate("catalog/parts/usage-index", PartUsageIndexEntrySchema, entry => entry.partId);
      const items: Record<string, PartUsageSummary> = Object.create(null);
      for (const entry of result.items) {
        if (Object.hasOwn(items, entry.partId)) throw new CatalogApiError(502, "INVALID_CATALOG_PAGINATION");
        items[entry.partId] = entry.summary;
      }
      return { items, releases: result.releases };
    },
    async getDrawingFile(drawingFileId: string): Promise<never> {
      void drawingFileId; // Preserve the public seam without guessing a figure from a drawing ID.
      throw new CatalogApiError(503, "DRAWING_LOOKUP_UNAVAILABLE", "Open the figure to load its authorized release-pinned drawing.");
    },
  };
}
