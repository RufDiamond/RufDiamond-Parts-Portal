import "server-only";
import { cookies } from "next/headers";
import { createApiRepository } from "@/data/api-repository.server";
import { CatalogApiError } from "./api-error";
import { loadFrontendBackendConfig } from "./backend-config.server";
import { createBackendTransport, proxyBackendRequest } from "./backend-transport.server";

/** Request-local only. Do not hold this repository in module/global state or a Next cache. */
export async function getBackendApiRepository() {
  const config = loadFrontendBackendConfig(process.env);
  if (!config) throw new CatalogApiError(503, "API_MODE_REQUIRED");
  const store = await cookies();
  const headers = new Headers();
  const session = ["__Host-ruf-session", "ruf-session-dev"].flatMap(name => store.getAll(name));
  headers.set("cookie", session.map(({ name, value }) => `${name}=${value}`).join("; "));
  const transport = createBackendTransport(config);
  return createApiRepository(path => transport(path, headers));
}

/** Fixture mode has no API data surface; it must never synthesize a successful response. */
export async function handleBackendApiRequest(request: Request): Promise<Response> {
  try {
    const config = loadFrontendBackendConfig(process.env);
    if (!config) return Response.json({ code: "API_MODE_REQUIRED" }, { status: 404, headers: { "cache-control": "private, no-store" } });
    return await proxyBackendRequest(request, config);
  } catch {
    return Response.json({ code: "INVALID_BACKEND_CONFIGURATION", detail: "The authenticated catalogue connection is not configured." }, { status: 503, headers: { "cache-control": "private, no-store" } });
  }
}
