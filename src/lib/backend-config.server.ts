import "server-only";
import type { BackendConfig } from "./backend-transport.server";
import { CatalogApiError } from "./api-error";

function origin(value: string | undefined): string {
  try {
    if (!value) throw new Error();
    const url = new URL(value);
    if (value !== url.origin || url.username || url.password || url.hostname.includes("*") ||
      (url.protocol !== "https:" && !(url.protocol === "http:" && ["127.0.0.1", "localhost", "[::1]"].includes(url.hostname)))) throw new Error();
    return value;
  } catch { throw new CatalogApiError(503, "INVALID_BACKEND_CONFIGURATION", "The authenticated catalogue connection is not configured."); }
}

export function validateBackendConfig(config: BackendConfig): BackendConfig {
  return { upstream: origin(config.upstream), webOrigin: origin(config.webOrigin) };
}

export function loadFrontendBackendConfig(environment: Record<string, string | undefined>): BackendConfig | null {
  const mode = environment.RUF_REPOSITORY_MODE ?? "fixture";
  const deployment = environment.RUF_DEPLOYMENT_ENV ?? "local";
  if (!["fixture", "api"].includes(mode) || !["local", "staging", "production"].includes(deployment) || deployment !== "local" && mode !== "api") {
    throw new CatalogApiError(503, "INVALID_BACKEND_CONFIGURATION", "Connected staging and production require API mode.");
  }
  if (mode === "fixture") return null;
  const config = validateBackendConfig({ upstream: environment.RUF_API_UPSTREAM_URL ?? "", webOrigin: environment.RUF_WEB_ORIGIN ?? "" });
  if (deployment !== "local" && !config.webOrigin.startsWith("https://")) throw new CatalogApiError(503, "INVALID_BACKEND_CONFIGURATION");
  return config;
}
