import "server-only";
import { allowedApiRoute } from "./api-routes";
import { CatalogApiError } from "./api-error";
import { validateBackendConfig } from "./backend-config.server";
import { apiResponseSchema } from "./api-response-schemas.server";
import { Value } from "@sinclair/typebox/value";
import { ProblemDetailsSchema } from "@rufdiamond/contracts";
import { readBoundedBytes } from "./api-body.server";
export type BackendConfig = { upstream: string; webOrigin: string };

export function sessionCookies(headers: Headers): string {
  return (headers.get("cookie") ?? "").split(";").map(value => value.trim()).filter(value => /^(?:__Host-ruf-session|ruf-session-dev)=[^;\r\n]*$/.test(value)).join("; ");
}

function validateWriteHeaders(headers: Headers, config: BackendConfig, publicWrite?: boolean) {
  if (headers.get("origin") !== config.webOrigin) throw new CatalogApiError(403, "ORIGIN_DENIED");
  const referer = headers.get("referer");
  if (referer) {
    let origin: string;
    try { origin = new URL(referer).origin; } catch { throw new CatalogApiError(403, "ORIGIN_DENIED"); }
    if (origin !== config.webOrigin) throw new CatalogApiError(403, "ORIGIN_DENIED");
  }
  if (!publicWrite && !headers.get("x-csrf-token")?.trim()) throw new CatalogApiError(403, "CSRF_REQUIRED");
  if (!/^application\/json(?:\s*;\s*charset=utf-8)?$/i.test(headers.get("content-type") ?? "")) throw new CatalogApiError(415, "JSON_REQUIRED");
}

export function createBackendTransport(config: BackendConfig, fetcher: typeof fetch = fetch) {
  const trusted = validateBackendConfig(config);
  return async (path: string, incoming: Headers, options: { method?: string; body?: Uint8Array; signal?: AbortSignal } = {}) => {
    const method = options.method ?? "GET";
    const rule = allowedApiRoute(path, method);
    if (method !== "GET") {
      validateWriteHeaders(incoming, trusted, rule.publicWrite);
      if ((options.body?.byteLength ?? 0) > (rule.bytes ?? 4096)) throw new CatalogApiError(413, "API_BODY_TOO_LARGE");
      try { JSON.parse(new TextDecoder().decode(options.body)); } catch { throw new CatalogApiError(400, "INVALID_JSON"); }
    } else if (options.body) throw new CatalogApiError(400, "GET_BODY_DENIED");
    const headers = new Headers({ accept: rule.drawing || rule.image ? "image/png" : "application/json, application/problem+json" });
    const cookie = sessionCookies(incoming);
    if (cookie) headers.set("cookie", cookie);
    for (const name of ["origin", "referer", "x-csrf-token", "if-match", "idempotency-key", "content-type"]) {
      const value = incoming.get(name);
      if (value) headers.set(name, value);
    }
    let response: Response;
    try {
      response = await fetcher(`${trusted.upstream}/api/v1/${path}`, { method, headers, ...(options.body ? { body: options.body as BodyInit } : {}), cache: "no-store", redirect: "manual", signal: options.signal ? AbortSignal.any([options.signal, AbortSignal.timeout(60000)]) : AbortSignal.timeout(60000) });
    } catch { throw new CatalogApiError(502, "UPSTREAM_UNAVAILABLE"); }
    return response;
  };
}

export async function proxyBackendRequest(request: Request, config: BackendConfig, fetcher: typeof fetch = fetch) {
  try {
    validateBackendConfig(config);
    const url = new URL(request.url);
    if (!url.pathname.startsWith("/api/v1/")) throw new CatalogApiError(404, "API_ROUTE_UNAVAILABLE");
    const path = url.pathname.slice(8) + url.search;
    const rule = allowedApiRoute(path, request.method);
    if (request.method !== "GET") {
      validateWriteHeaders(request.headers, config, rule.publicWrite);
    }
    const bytes = request.method === "GET" ? undefined : await readBoundedBytes(request.body, rule.bytes ?? 4096, AbortSignal.any([request.signal, AbortSignal.timeout(60_000)]));
    if (bytes) try { JSON.parse(new TextDecoder().decode(bytes)); } catch { throw new CatalogApiError(400, "INVALID_JSON"); }
    const response = await createBackendTransport(config, fetcher)(path, request.headers, { method: request.method, body: bytes, signal: request.signal });
    const headers = new Headers({ "cache-control": "private, no-store", vary: "Cookie", "x-content-type-options": "nosniff" });
    if (response.status >= 300 && response.status < 400) {
      // Only immutable customer drawing delivery may redirect, and only to TLS storage.
      const location = response.headers.get("location");
      const destination = location ? new URL(location) : null;
      if (response.status !== 302 || !rule.drawing || !destination || destination.protocol !== "https:" || destination.username || destination.password) throw new CatalogApiError(502, "UPSTREAM_REDIRECT_DENIED");
      headers.set("location", destination.href);
      return new Response(null, { status: response.status, headers });
    }
    for (const value of response.headers.getSetCookie()) {
      if (/^(?:__Host-ruf-session|ruf-session-dev)=/.test(value)) headers.append("set-cookie", value);
    }
    const type = response.headers.get("content-type") ?? "";
    if ((rule.image || rule.drawing) && response.status === 200 && /^image\/png(?:;|$)/i.test(type)) {
      let bytes: Uint8Array;
      try { bytes = await readBoundedBytes(response.body, 20 * 1024 * 1024, AbortSignal.any([request.signal, AbortSignal.timeout(60_000)])); }
      catch { throw new CatalogApiError(502, "API_RESPONSE_UNAVAILABLE"); }
      if (![137,80,78,71,13,10,26,10].every((value, index) => bytes[index] === value)) throw new CatalogApiError(502, "INVALID_UPSTREAM_RESPONSE");
      headers.set("content-type", "image/png");
      return new Response(bytes as BodyInit, { headers });
    }
    if (!/^application\/(?:json|problem\+json)(?:;|$)/i.test(type)) throw new CatalogApiError(502, "INVALID_UPSTREAM_RESPONSE");
    headers.set("content-type", type || "application/json");
    let body: Uint8Array;
    try { body = await readBoundedBytes(response.body, 8 * 1024 * 1024, AbortSignal.any([request.signal, AbortSignal.timeout(60_000)])); }
    catch { throw new CatalogApiError(502, "API_RESPONSE_UNAVAILABLE"); }
    let parsed: unknown;
    try { parsed = JSON.parse(new TextDecoder().decode(body)); } catch { throw new CatalogApiError(502, "INVALID_UPSTREAM_RESPONSE"); }
    if (!Value.Check(response.ok ? apiResponseSchema(path, request.method, response.status) : ProblemDetailsSchema, parsed)) throw new CatalogApiError(502, "INVALID_UPSTREAM_RESPONSE");
    if (!response.ok && response.status >= 500) throw new CatalogApiError(response.status, "UPSTREAM_UNAVAILABLE");
    return new Response(body as BodyInit, { status: response.status, headers });
  } catch (error) {
    const known = error instanceof CatalogApiError ? error : new CatalogApiError(502, "UPSTREAM_UNAVAILABLE");
    return Response.json({ code: known.code, status: known.status, detail: known.message }, { status: known.status, headers: { "cache-control": "private, no-store" } });
  }
}
