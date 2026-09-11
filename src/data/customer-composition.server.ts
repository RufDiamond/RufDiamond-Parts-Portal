import "server-only";
import type { ReleaseRef } from "@rufdiamond/contracts";
import type { createApiRepository } from "./api-repository.server";
import { adaptFigureDetail } from "./customer-adapter";
import { CatalogApiError } from "@/lib/api-error";
import type { FigureDetail } from "@/types/catalog";

type ApiRepository = ReturnType<typeof createApiRepository>;

function customerRepository(api: ApiRepository, collect: (refs: ReleaseRef[]) => void): CustomerRepository {
  async function items<T>(promise: Promise<{ items: T; releases: ReleaseRef[] }>): Promise<T> {
    const result = await promise;
    collect(result.releases);
    return result.items;
  }
  return {
    getProductLines: () => items(api.getProductLines()),
    getModels: () => items(api.getModels()),
    getVariants: (id: string) => items(api.getVariants(id)),
    getSystems: (id: string) => items(api.getSystems(id)),
    getFigures: async (variant: string, system: string) => (await items(api.getFigures(variant, system))).map(figure => ({ ...figure, groupNo: figure.groupNo ?? "" })),
    getFigureDetail: async (id: string): Promise<FigureDetail | null> => {
      const detail = await api.getFigureDetail(id);
      collect([detail.release]);
      return adaptFigureDetail(detail);
    },
    getPartUsageIndex: async () => ({ ...await items(api.getPartUsageIndex()) }),
    searchParts: (query: string) => items(api.searchParts(query)),
    searchPartUsages: (query: string, mode: "any" | "part" | "description" = "any") => items(api.searchPartUsages(query, mode)),
  };
}
export type CustomerRepository = Pick<typeof import("./fixture-repository.server"), "getProductLines" | "getModels" | "getVariants" | "getSystems" | "getFigures" | "getFigureDetail" | "getPartUsageIndex" | "searchParts" | "searchPartUsages">;

/** Discard every dependent result on same-model drift; unrelated releases may differ. */
export async function composeApiRead<T>(api: ApiRepository, load: (repo: CustomerRepository) => Promise<T>): Promise<T> {
  for (let attempt = 0; attempt < 2; attempt++) {
    const refs = new Map<string, ReleaseRef>();
    const collect = (incoming: ReleaseRef[]) => {
      for (const ref of incoming) {
        const previous = refs.get(ref.modelId);
        if (previous && (previous.releaseId !== ref.releaseId || previous.revision !== ref.revision)) {
          throw new CatalogApiError(409, "RELEASE_CHANGED", "The catalogue changed while loading. Refresh to load the current release.");
        }
        refs.set(ref.modelId, ref);
      }
    };
    try { return await load(customerRepository(api, collect)); }
    catch (error) {
      if (attempt === 0 && error instanceof CatalogApiError && error.status === 409 && ["RELEASE_CHANGED", "CATALOG_CURSOR_STALE"].includes(error.code)) continue;
      throw error;
    }
  }
  throw new CatalogApiError(409, "RELEASE_CHANGED");
}
