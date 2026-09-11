import "server-only";
import { Value } from "@sinclair/typebox/value";
import type { Static, TSchema } from "@sinclair/typebox";
import { CatalogApiError } from "@/lib/api-error";
import { readBoundedBytes } from "@/lib/api-body.server";

export type ApiRead = (path: string) => Promise<Response>;

/** Bound even chunked responses, and never expose an upstream error body or URL. */
export async function readApiContract<S extends TSchema>(read: ApiRead, path: string, schema: S): Promise<Static<S>> {
  let response: Response;
  try { response = await read(path); }
  catch (error) { throw error instanceof CatalogApiError ? error : new CatalogApiError(502, "UPSTREAM_UNAVAILABLE"); }
  if (response.redirected || response.status >= 300 && response.status < 400) throw new CatalogApiError(502, "UPSTREAM_REDIRECT_DENIED");
  let bytes: Uint8Array;
  try { bytes = await readBoundedBytes(response.body, 8 * 1024 * 1024); }
  catch { throw new CatalogApiError(502, "API_RESPONSE_UNAVAILABLE"); }
  let body: unknown;
  try { body = JSON.parse(new TextDecoder().decode(bytes)); }
  catch { throw new CatalogApiError(502, "INVALID_API_CONTRACT"); }
  if (!response.ok) {
    const code = body && typeof body === "object" && "code" in body && typeof body.code === "string" && /^[A-Z][A-Z0-9_]{0,79}$/.test(body.code) ? body.code : "API_REQUEST_FAILED";
    throw new CatalogApiError(response.status, code);
  }
  if (!/^application\/json(?:;|$)/i.test(response.headers.get("content-type") ?? "") || !Value.Check(schema, body)) throw new CatalogApiError(502, "INVALID_API_CONTRACT");
  return body;
}
