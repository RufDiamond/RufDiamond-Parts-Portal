import { DrawingAttachmentSchema, DrawingDeliverySchema, DrawingUploadInputSchema, DrawingUploadIntentSchema, type DrawingUploadInput } from "@rufdiamond/contracts";
import type { FastifyInstance, FastifyRequest } from "fastify";
import type { AppConfig } from "../../config.js";
import type { Database } from "../../db/client.js";
import { AppError } from "../../plugins/error-handler.js";
import { requireCsrf } from "../../plugins/csrf.js";
import { createDrawingService } from "./service.js";
import type { DrawingScanner, DrawingStorage } from "./storage.js";

export function registerDrawingRoutes(app: FastifyInstance, config: AppConfig, database: Database, storage: DrawingStorage, scanner: DrawingScanner, now: () => Date) {
  const service = createDrawingService(database, storage, scanner, now);
  const actor = (request: FastifyRequest) => ({ userId: request.identitySession!.user.id, requestId: request.requestId });
  const onRequest = async (request: FastifyRequest) => {
    if (!request.identitySession) throw new AppError("AUTHENTICATION_REQUIRED", 401, "Authentication is required.");
    if (request.method !== "GET") requireCsrf(request, config);
  };
  const version = (request: FastifyRequest) => {
    const match = request.headers["if-match"];
    if (match === undefined) throw new AppError("PRECONDITION_REQUIRED", 428, "Supply the current figure version in If-Match.");
    if (typeof match !== "string" || !/^"[1-9][0-9]*"$/.test(match) || Number(match.slice(1, -1)) > 2147483646) throw new AppError("INVALID_PRECONDITION", 400, "Supply one quoted figure version from 1 to 2147483646.");
    return Number(match.slice(1, -1));
  };
  const path = "/api/v1/admin/figures/:figureId";
  const params = { type: "object", additionalProperties: false, required: ["figureId"], properties: { figureId: { type: "string" } } };
  const empty = { type: "object", additionalProperties: false, properties: {} };
  app.post<{ Params: { figureId: string }; Body: DrawingUploadInput }>(`${path}/drawing-uploads`, { onRequest, bodyLimit: 4096, schema: { params, body: DrawingUploadInputSchema, querystring: empty, response: { 201: DrawingUploadIntentSchema } } }, async (request, reply) => {
    const result = await service.intent(actor(request), request.params.figureId, version(request), request.body);
    return reply.code(201).header("cache-control", "no-store").send(result);
  });
  app.post<{ Params: { figureId: string; uploadId: string }; Body: Record<string, never> }>(`${path}/drawing-uploads/:uploadId/finalize`, { onRequest, bodyLimit: 4096, schema: { params: { ...params, required: ["figureId", "uploadId"], properties: { ...params.properties, uploadId: { type: "string" } } }, body: empty, querystring: empty, response: { 200: DrawingAttachmentSchema } } }, async (request, reply) => {
    const result = await service.finalize(actor(request), request.params.figureId, request.params.uploadId, version(request));
    return reply.header("cache-control", "no-store").send(result);
  });
  app.get<{ Params: { figureId: string } }>(`${path}/drawing`, { onRequest, schema: { params, querystring: empty, response: { 200: DrawingDeliverySchema } } }, async (request, reply) => {
    const result = await service.delivery(actor(request), request.params.figureId);
    return reply.header("cache-control", "no-store").send(result);
  });
}
