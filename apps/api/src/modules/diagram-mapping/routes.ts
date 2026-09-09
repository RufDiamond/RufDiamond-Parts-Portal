import { MappingApproveInputSchema, MappingEditorDocumentSchema, MappingHistoricalDocumentSchema, MappingHistorySchema, MappingRevisionSchema, MappingSaveInputSchema, type MappingApproveInput, type MappingSaveInput, type MappingWriteContext } from "@rufdiamond/contracts";
import type { FastifyInstance, FastifyRequest } from "fastify";
import type { AppConfig } from "../../config.js";
import type { Database } from "../../db/client.js";
import { requireCsrf } from "../../plugins/csrf.js";
import { AppError } from "../../plugins/error-handler.js";
import { createMappingService } from "./service.js";

// Shared contracts inline repeated named sub-schemas. Remove annotation-only IDs
// at the Fastify boundary so AJV/fast-json-stringify do not register them twice.
function routeSchema(schema: unknown): unknown {
  if (Array.isArray(schema)) return schema.map(routeSchema);
  if (schema && typeof schema === "object") return Object.fromEntries(Object.entries(schema).filter(([key]) => key !== "$id").map(([key, value]) => [key, routeSchema(value)]));
  return schema;
}

function authenticated(request: FastifyRequest) {
  if (!request.identitySession) throw new AppError("AUTHENTICATION_REQUIRED", 401, "Authentication is required.");
}
function writeContext(request: FastifyRequest<{ Params: { figureId: string } }>): MappingWriteContext {
  const match = request.headers["if-match"];
  if (match === undefined) throw new AppError("PRECONDITION_REQUIRED", 428, "Supply the current mapping version in If-Match.");
  if (typeof match !== "string" || !/^"[1-9][0-9]*"$/.test(match) || !Number.isSafeInteger(Number(match.slice(1, -1)))) throw new AppError("INVALID_PRECONDITION", 400, "If-Match must contain one quoted positive integer version.");
  const key = request.headers["idempotency-key"];
  if (typeof key !== "string" || !key.trim() || key.length > 255) throw new AppError("INVALID_IDEMPOTENCY_KEY", 400, "Supply an idempotency key of 1 to 255 characters.");
  return { figureId: request.params.figureId, expectedVersion: Number(match.slice(1, -1)), idempotencyKey: key };
}
export function registerMappingRoutes(app: FastifyInstance, config: AppConfig, database: Database, now: () => Date) {
  const service = createMappingService(database, now);
  const actor = (request: FastifyRequest) => ({ userId: request.identitySession!.user.id, requestId: request.requestId });
  const path = "/api/v1/admin/figures/:figureId/diagram-mapping";
  const params = { type: "object", required: ["figureId"], additionalProperties: false, properties: { figureId: { type: "string" } } };
  const onRequest = async (request: FastifyRequest) => { authenticated(request); if (request.method !== "GET") requireCsrf(request, config); };
  app.get<{ Params: { figureId: string }; Querystring: { before?: string } }>(`${path}/revisions`, { onRequest, schema: { params, querystring: { type: "object", additionalProperties: false, properties: { before: { type: "string", pattern: "^[1-9][0-9]*$" } } }, response: { 200: routeSchema(MappingHistorySchema) } } }, async (request, reply) => {
    const before = request.query.before === undefined ? undefined : Number(request.query.before);
    if (before !== undefined && (!Number.isSafeInteger(before) || before > 2147483647)) throw new AppError("INVALID_CURSOR", 400, "Supply a revision cursor from 1 to 2147483647.");
    const result = await service.history(actor(request), request.params.figureId, before);
    reply.header("cache-control", "no-store"); return result;
  });
  app.get<{ Params: { figureId: string; revisionId: string } }>(`${path}/revisions/:revisionId`, { onRequest, schema: { params: { ...params, required: ["figureId", "revisionId"], properties: { ...params.properties, revisionId: { type: "string" } } }, response: { 200: routeSchema(MappingHistoricalDocumentSchema) } } }, async (request, reply) => {
    const result = await service.historical(actor(request), request.params.figureId, request.params.revisionId);
    reply.header("cache-control", "no-store"); return result;
  });
  app.get<{ Params: { figureId: string } }>(path, { onRequest, schema: { params, response: { 200: routeSchema(MappingEditorDocumentSchema) } } }, async (request, reply) => {
    const result = await service.read(await actor(request), request.params.figureId);
    reply.header("etag", `"${result.version}"`).header("cache-control", "no-store");
    return result;
  });
  app.put<{ Params: { figureId: string }; Body: MappingSaveInput }>(path, { onRequest, bodyLimit: 1024 * 1024, schema: { params, body: routeSchema(MappingSaveInputSchema), response: { 200: routeSchema(MappingRevisionSchema) } } }, async (request, reply) => {
    const result = await service.save(await actor(request), writeContext(request), request.body);
    reply.header("etag", `"${result.version}"`).header("cache-control", "no-store"); return result;
  });
  app.post<{ Params: { figureId: string }; Body: MappingApproveInput }>(`${path}/approve`, { onRequest, bodyLimit: 1024 * 1024, schema: { params, body: routeSchema(MappingApproveInputSchema), response: { 200: routeSchema(MappingRevisionSchema) } } }, async (request, reply) => {
    const result = await service.approve(await actor(request), writeContext(request), request.body);
    reply.header("etag", `"${result.version}"`).header("cache-control", "no-store"); return result;
  });
}
