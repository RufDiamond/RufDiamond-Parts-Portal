import { Value } from "@sinclair/typebox/value";
import type { Static, TSchema } from "@sinclair/typebox";
import { DrawingAttachmentSchema, DrawingDeliverySchema, DrawingUploadIntentSchema, type DrawingAttachment, type DrawingDelivery, type DrawingUploadIntent } from "@rufdiamond/contracts/drawing-upload";
import { MappingApiError } from "./api-client";

export type DrawingApiClient = {
  createIntent(figureId: string, figureVersion: number, file: File, signal?: AbortSignal): Promise<DrawingUploadIntent>;
  uploadFile(intent: DrawingUploadIntent, file: File, signal?: AbortSignal): Promise<void>;
  finalize(figureId: string, uploadId: string, figureVersion: number, signal?: AbortSignal): Promise<DrawingAttachment>;
  loadDrawing(figureId: string, signal?: AbortSignal): Promise<DrawingDelivery>;
};
function id(value: string) { if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)) throw new MappingApiError(400, "A valid drawing or figure identity is required."); return value; }
export function createDrawingApiClient(options: { csrfToken: string; fetch?: typeof fetch }): DrawingApiClient {
  if (!options.csrfToken.trim()) throw new MappingApiError(401, "An authenticated session is required.");
  const request = options.fetch ?? globalThis.fetch.bind(globalThis);
  const base = (figure: string) => `/api/v1/admin/figures/${id(figure)}`;
  async function send<S extends TSchema>(path: string, schema: S, signal?: AbortSignal, write?: { version: number; body: unknown }): Promise<Static<S>> {
    if (write && (!Number.isInteger(write.version) || write.version < 1 || write.version > 2147483646)) throw new MappingApiError(400, "A current figure version is required.");
    const result = await request(path, { method: write ? "POST" : "GET", credentials: "same-origin", cache: "no-store", redirect: "error", signal, headers: { Accept: "application/json, application/problem+json", ...(write ? { "Content-Type": "application/json", "X-CSRF-Token": options.csrfToken, "If-Match": `"${write.version}"` } : {}) }, ...(write ? { body: JSON.stringify(write.body) } : {}) });
    let body: unknown;
    try { body = await result.json(); } catch { throw new MappingApiError(502, "The drawing API returned an invalid response."); }
    if (!result.ok) { const error = body && typeof body === "object" ? body as Record<string, unknown> : {}; throw new MappingApiError(result.status, typeof error.detail === "string" ? error.detail : "The drawing request failed."); }
    if (!Value.Check(schema, body)) throw new MappingApiError(502, "The drawing API returned an invalid contract.");
    return body;
  }
  return {
    async createIntent(figure, version, file, signal) {
      if (!/^[^/\\\u0000-\u001f]+\.png$/i.test(file.name) || (file.type && file.type !== "image/png") || file.size < 1) throw new MappingApiError(400, "Choose a PNG file.");
      if (file.size > 20 * 1024 * 1024) throw new MappingApiError(413, "The PNG must be at most 20 MiB.");
      const bytes = await file.arrayBuffer();
      const hash = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)), byte => byte.toString(16).padStart(2, "0")).join("");
      return send(`${base(figure)}/drawing-uploads`, DrawingUploadIntentSchema, signal, { version, body: { filename: file.name, bytes: file.size, sha256: hash } });
    },
    async uploadFile(intent, file, signal) {
      const url = new URL(intent.url);
      // Local HTTP storage is development-only; never forward session/CSRF to object storage.
      if (url.username || url.password || (url.protocol !== "https:" && !(url.protocol === "http:" && ["127.0.0.1", "localhost", "[::1]"].includes(url.hostname)))) throw new MappingApiError(502, "The API returned an unsupported upload URL.");
      const result = await request(url.href, { method: "PUT", body: file, headers: intent.headers, credentials: "omit", redirect: "error", cache: "no-store", signal });
      if (!result.ok) throw new MappingApiError(result.status, "PNG upload failed or expired. Create a new upload.");
    },
    finalize: (figure, upload, version, signal) => send(`${base(figure)}/drawing-uploads/${id(upload)}/finalize`, DrawingAttachmentSchema, signal, { version, body: {} }),
    loadDrawing: (figure, signal) => send(`${base(figure)}/drawing`, DrawingDeliverySchema, signal),
  };
}
