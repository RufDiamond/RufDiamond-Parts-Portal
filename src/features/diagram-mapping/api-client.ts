import { Value } from "@sinclair/typebox/value";
import type { Static, TSchema } from "@sinclair/typebox";
import { MappingEditorDocumentSchema, MappingHistoricalDocumentSchema, MappingHistorySchema, MappingIssueSchema, MappingRevisionSchema } from "@rufdiamond/contracts/diagram-mapping";
import type { DiagramMappingDocument, MappingEditorDocument, MappingHistoricalDocument, MappingHistory, MappingIssue, MappingRevision } from "@rufdiamond/contracts";

export class MappingApiError extends Error {
  constructor(public readonly status: number, message: string, public readonly issues: MappingIssue[] = [], public readonly requestId?: string, public readonly code?: string) { super(message); this.name = "MappingApiError"; }
}
export type MappingApiClient = {
  loadMapping(figureId: string, signal?: AbortSignal): Promise<MappingEditorDocument>;
  saveMapping(figureId: string, version: number, document: DiagramMappingDocument, key: string, signal?: AbortSignal): Promise<MappingRevision>;
  approveMapping(figureId: string, version: number, revisionId: string, checksum: string, key: string, signal?: AbortSignal): Promise<MappingRevision>;
  listRevisions(figureId: string, before?: number, signal?: AbortSignal): Promise<MappingHistory>;
  loadRevision(figureId: string, revisionId: string, signal?: AbortSignal): Promise<MappingHistoricalDocument>;
};
function id(value: string): string {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)) throw new MappingApiError(400, "A valid figure or revision identity is required.");
  return value;
}
/** Inputs grant no authority: each backend operation validates the current cookie session. */
export function createMappingApiClient(options: { csrfToken: string; fetch?: typeof fetch }): MappingApiClient {
  if (!options.csrfToken.trim()) throw new MappingApiError(401, "An authenticated session is required.");
  const request = options.fetch ?? globalThis.fetch.bind(globalThis);
  const base = (figureId: string) => `/api/v1/admin/figures/${id(figureId)}/diagram-mapping`;
  async function send<S extends TSchema>(path: string, schema: S, signal?: AbortSignal, write?: { method: string; version: number; key: string; body: unknown }): Promise<Static<S>> {
    if (write && (!Number.isSafeInteger(write.version) || write.version < 1 || !write.key.trim() || write.key.length > 255)) throw new MappingApiError(400, "A current version and idempotency key are required.");
    const response = await request(path, { method: write?.method ?? "GET", credentials: "same-origin", cache: "no-store", redirect: "error", signal,
      headers: { Accept: "application/json, application/problem+json", ...(write ? { "Content-Type": "application/json", "X-CSRF-Token": options.csrfToken, "If-Match": `"${write.version}"`, "Idempotency-Key": write.key } : {}) },
      ...(write ? { body: JSON.stringify(write.body) } : {}),
    });
    let body: unknown;
    try { body = await response.json(); } catch { throw new MappingApiError(response.status || 502, "The authenticated API did not return a valid response."); }
    if (!response.ok) {
      const problem = body && typeof body === "object" ? body as Record<string, unknown> : {};
      const issues = Array.isArray(problem.issues) ? problem.issues.filter((issue): issue is MappingIssue => Value.Check(MappingIssueSchema, issue)) : [];
      throw new MappingApiError(response.status, typeof problem.detail === "string" ? problem.detail : "The mapping request failed.", issues, typeof problem.requestId === "string" ? problem.requestId : undefined);
    }
    if (!Value.Check(schema, body)) throw new MappingApiError(502, "The authenticated API returned an invalid mapping contract.");
    return body;
  }
  return {
    loadMapping: (figure, signal) => send(base(figure), MappingEditorDocumentSchema, signal),
    saveMapping: (figure, version, document, key, signal) => send(base(figure), MappingRevisionSchema, signal, { method: "PUT", version, key, body: { document } }),
    approveMapping: (figure, version, revisionId, checksum, key, signal) => send(`${base(figure)}/approve`, MappingRevisionSchema, signal, { method: "POST", version, key, body: { revisionId, checksum } }),
    listRevisions: (figure, before, signal) => {
      if (before !== undefined && (!Number.isSafeInteger(before) || before < 1 || before > 2147483647)) throw new MappingApiError(400, "A valid revision cursor is required.");
      return send(`${base(figure)}/revisions${before === undefined ? "" : `?before=${before}`}`, MappingHistorySchema, signal);
    },
    loadRevision: (figure, revision, signal) => send(`${base(figure)}/revisions/${id(revision)}`, MappingHistoricalDocumentSchema, signal),
  };
}
