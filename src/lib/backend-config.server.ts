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

type Environment = Record<string, string | undefined>;

function hosted(environment: Environment) {
  return environment.VERCEL === "1" || ["production", "preview"].includes(environment.VERCEL_ENV ?? "");
}

export function usesFixtureMode(environment: Environment) {
  if (hosted(environment)) return false;
  const deployment = environment.RUF_DEPLOYMENT_ENV;
  const mode = environment.RUF_REPOSITORY_MODE;
  if (deployment !== undefined && deployment !== "local") return false;
  if (mode === "fixture") return environment.NODE_ENV !== "production" || deployment === "local";
  return mode === undefined && environment.NODE_ENV !== "production";
}

export function loadFrontendBackendConfig(environment: Environment): BackendConfig | null {
  const deployment = environment.RUF_DEPLOYMENT_ENV ?? (hosted(environment) || environment.NODE_ENV === "production" ? "production" : "local");
  const mode = environment.RUF_REPOSITORY_MODE;
  if (!["local", "staging", "production"].includes(deployment) || mode !== undefined && mode !== "fixture" && mode !== "api") {
    throw new CatalogApiError(503, "INVALID_BACKEND_CONFIGURATION", "Invalid catalogue deployment settings.");
  }
  if (usesFixtureMode(environment)) return null;
  if (mode === "fixture") throw new CatalogApiError(503, "INVALID_BACKEND_CONFIGURATION", "Hosted deployments require API mode.");
  const config = validateBackendConfig({ upstream: environment.RUF_API_UPSTREAM_URL ?? "", webOrigin: environment.RUF_WEB_ORIGIN ?? "" });
  if ((hosted(environment) || deployment !== "local") && !config.webOrigin.startsWith("https://")) throw new CatalogApiError(503, "INVALID_BACKEND_CONFIGURATION");
  return config;
}
