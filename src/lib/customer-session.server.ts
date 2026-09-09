import "server-only";
import { redirect } from "next/navigation";
import { isApiMode } from "@/data/repository";
import { getBackendApiRepository } from "./backend-api.server";
import { CatalogApiError } from "./api-error";

export async function requireCustomerSession() {
  if (!isApiMode()) return null;
  try {
    const me = await (await getBackendApiRepository()).getMe();
    if (me.company.id !== me.companyId || !me.capabilities.some(capability => ["catalog.model.view", "catalog.figure.view", "parts.record.view"].includes(capability))) throw new CatalogApiError(403, "CATALOGUE_ACCESS_DENIED");
    return me;
  } catch (error) {
    if (error instanceof CatalogApiError && error.status === 401) redirect("/signin");
    throw error;
  }
}
