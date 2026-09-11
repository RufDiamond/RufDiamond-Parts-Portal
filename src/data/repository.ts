import "server-only";
import { loadFrontendBackendConfig } from "@/lib/backend-config.server";
import { getBackendApiRepository } from "@/lib/backend-api.server";
import { CatalogApiError } from "@/lib/api-error";
import type { PartFilters } from "@/types/admin";
import { adaptFigureDetail } from "./customer-adapter";
import { composeApiRead, type CustomerRepository } from "./customer-composition.server";
import { scopeKey } from "@/state/customer-session";

export type PartSearchMode = "part" | "description" | "any";
export const isApiMode = () => loadFrontendBackendConfig(process.env) !== null;
const fixture = () => import("./fixture-repository.server");

export async function composeCustomerRead<T>(load: (repo: CustomerRepository) => Promise<T>): Promise<T> {
  if (!isApiMode()) return load(await fixture());
  const api = await getBackendApiRepository();
  const before = await api.getMe();
  const result = await composeApiRead(api, load);
  if (scopeKey(before) !== scopeKey(await api.getMe())) throw new CatalogApiError(409, "SCOPE_CHANGED");
  return result;
}

export async function getProductLines() { return isApiMode() ? (await (await getBackendApiRepository()).getProductLines()).items : (await fixture()).getProductLines(); }
export async function getModels() { return isApiMode() ? (await (await getBackendApiRepository()).getModels()).items : (await fixture()).getModels(); }
export async function getVariants(modelId: string) { return isApiMode() ? (await (await getBackendApiRepository()).getVariants(modelId)).items : (await fixture()).getVariants(modelId); }
export async function getSystems(variantId: string) { return isApiMode() ? (await (await getBackendApiRepository()).getSystems(variantId)).items : (await fixture()).getSystems(variantId); }
export async function getFigures(variantId: string, systemId: string) { return isApiMode() ? (await (await getBackendApiRepository()).getFigures(variantId, systemId)).items.map(f => ({ ...f, groupNo: f.groupNo ?? "" })) : (await fixture()).getFigures(variantId, systemId); }
export async function getFigureDetail(figureId: string) { return isApiMode() ? adaptFigureDetail(await (await getBackendApiRepository()).getFigureDetail(figureId)) : (await fixture()).getFigureDetail(figureId); }
export async function getDrawingFile(id: string) { return isApiMode() ? (await getBackendApiRepository()).getDrawingFile(id) : (await fixture()).getDrawingFile(id); }
export async function searchParts(query: string) {
  if (!isApiMode()) return (await fixture()).searchParts(query);
  const result = await (await getBackendApiRepository()).searchParts(query);
  return result.items.map(part => ({ ...part, contributingReleases: result.releases }));
}
export async function searchPartUsages(query: string, mode: PartSearchMode = "any") {
  if (!isApiMode()) return (await fixture()).searchPartUsages(query, mode);
  const result = await (await getBackendApiRepository()).searchPartUsages(query, mode);
  return result.items.map(row => ({ ...row, part: { ...row.part, contributingReleases: result.releases } }));
}
export async function getPartUsageIndex() { return isApiMode() ? { ...(await (await getBackendApiRepository()).getPartUsageIndex()).items } : (await fixture()).getPartUsageIndex(); }

async function adminFixture() {
  if (isApiMode()) {
    await (await getBackendApiRepository()).getMe();
    throw new CatalogApiError(503, "ADMIN_VIEW_UNAVAILABLE");
  }
  return fixture();
}
export async function getCatalogSummary() { return (await adminFixture()).getCatalogSummary(); }
export async function getModelDetail(id: string) { return (await adminFixture()).getModelDetail(id); }
export async function getFiguresForModel(id: string) { return (await adminFixture()).getFiguresForModel(id); }
export async function getAllParts(filters: PartFilters = {}) { return (await adminFixture()).getAllParts(filters); }
export async function getOrders() { return (await adminFixture()).getOrders(); }
export async function getPublishQueue() { return (await adminFixture()).getPublishQueue(); }
