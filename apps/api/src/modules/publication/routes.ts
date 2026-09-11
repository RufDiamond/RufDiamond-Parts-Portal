import { ActivateReleaseInputSchema, PublishInputSchema, PublishResultSchema, PublicationQueuePageSchema, type ActivateReleaseInput, type PublishInput } from "@rufdiamond/contracts";
import { Type } from "@sinclair/typebox";
import type { FastifyInstance, FastifyRequest } from "fastify";
import type { AppConfig } from "../../config.js";
import type { Database } from "../../db/client.js";
import { requireCsrf } from "../../plugins/csrf.js";
import { AppError } from "../../plugins/error-handler.js";
import { createPublicationService } from "./service.js";

export function routeSchema(schema: unknown): unknown {
  if (Array.isArray(schema)) return schema.map(routeSchema);
  if (schema && typeof schema === "object") return Object.fromEntries(Object.entries(schema).filter(([key]) => key !== "$id").map(([key, value]) => [key, routeSchema(value)]));
  return schema;
}
export function authenticated(request: FastifyRequest) { if (!request.identitySession) throw new AppError("AUTHENTICATION_REQUIRED", 401, "Authentication is required."); }
export const actor = (request: FastifyRequest) => ({ userId: request.identitySession!.user.id, requestId: request.requestId });
function key(request: FastifyRequest) { const value = request.headers["idempotency-key"]; if (typeof value !== "string" || !value.trim() || value.length > 255) throw new AppError("INVALID_IDEMPOTENCY_KEY", 400, "Supply an idempotency key of 1 to 255 characters."); return value; }
export function registerPublicationRoutes(app: FastifyInstance, config: AppConfig, database: Database, now: () => Date) {
  const service = createPublicationService(database, now);
  const onRequest = async (request: FastifyRequest) => { authenticated(request); if (request.method !== "GET") requireCsrf(request, config); };
  app.get<{ Querystring: { cursor?: string; limit?: string } }>("/api/v1/admin/publication/queue", { onRequest, schema: { querystring: Type.Object({ cursor: Type.Optional(Type.String({ maxLength: 4096 })), limit: Type.Optional(Type.String({ pattern: "^(?:[1-9]|[1-9][0-9]|100)$" })) }, { additionalProperties: false }), response: { 200: routeSchema(PublicationQueuePageSchema) } } }, async (request, reply) => {
    reply.header("cache-control", "no-store"); return service.queue(actor(request), { cursor: request.query.cursor, limit: request.query.limit ? Number(request.query.limit) : undefined });
  });
  app.post<{ Body: PublishInput }>("/api/v1/admin/publication/releases", { onRequest, schema: { body: routeSchema(PublishInputSchema), response: { 201: routeSchema(PublishResultSchema) } } }, async (request, reply) => {
    const result = await service.publishModel(actor(request), request.body, key(request)); reply.code(201).header("cache-control", "no-store"); return result;
  });
  for (const action of ["activate", "rollback"] as const) app.post<{ Params: { id: string }; Body: ActivateReleaseInput }>(`/api/v1/admin/publication/releases/:id/${action}`, { onRequest, schema: { params: Type.Object({ id: Type.String() }, { additionalProperties: false }), body: routeSchema(ActivateReleaseInputSchema), response: { 200: routeSchema(PublishResultSchema) } } }, async (request, reply) => {
    const result = await service.activateRelease(actor(request), request.params.id, request.body, key(request), action === "rollback"); reply.header("cache-control", "no-store"); return result;
  });
}
