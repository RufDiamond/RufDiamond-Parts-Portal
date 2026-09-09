import { FigureDetailSchema, PageSchema, PartSchema, PartUsageRowSchema, PartUsageIndexEntrySchema, ProductLineSchema, ModelSchema, VariantSchema, SystemSchema, ReleasedFigureSchema } from "@rufdiamond/contracts";
import { Type } from "@sinclair/typebox";
import type { FastifyInstance, FastifyRequest } from "fastify";
import type { Database } from "../../db/client.js";
import type { DrawingStorage } from "../drawings/storage.js";
import { actor, authenticated, routeSchema } from "../publication/routes.js";
import { createCatalogRepository, type CatalogQuery } from "./repository.js";

export function registerCatalogRoutes(app: FastifyInstance, database: Database, storage: DrawingStorage) {
  const repository = createCatalogRepository(database, storage);
  const onRequest = async (request: FastifyRequest) => { authenticated(request); };
  const routes = [
    ["/product-lines", "product-lines", ProductLineSchema], ["/models", "models", ModelSchema],
    ["/models/:id/variants", "variants", VariantSchema], ["/variants/:id/systems", "systems", SystemSchema],
    ["/variants/:id/systems/:systemId/figures", "figures", ReleasedFigureSchema],
    ["/parts/search", "search", PartSchema], ["/parts/usages", "usages", PartUsageRowSchema], ["/parts/:id/usages", "part-usages", PartUsageRowSchema],
    ["/parts/usage-index", "usage-index", PartUsageIndexEntrySchema],
  ] as const;
  for (const [path, kind, schema] of routes) app.get<{ Params: { id?: string; systemId?: string }; Querystring: { q?: string; mode?: "any" | "part" | "description"; cursor?: string; limit?: string } }>(`/api/v1/catalog${path}`, { onRequest, schema: {
    querystring: Type.Object({ q: Type.Optional(Type.String({ maxLength: 200 })), mode: Type.Optional(Type.Union([Type.Literal("any"), Type.Literal("part"), Type.Literal("description")])), cursor: Type.Optional(Type.String({ maxLength: 4096 })), limit: Type.Optional(Type.String({ pattern: "^(?:[1-9]|[1-9][0-9]|100)$" })) }, { additionalProperties: false }), response: { 200: routeSchema(PageSchema(schema)) },
  } }, async (request, reply) => {
    const query: CatalogQuery = { ...request.params, ...request.query, limit: request.query.limit ? Number(request.query.limit) : undefined, kind };
    const result = await repository.list(actor(request), query); reply.header("cache-control", "no-store"); return result;
  });
  app.get<{ Params: { id: string } }>("/api/v1/catalog/figures/:id", { onRequest, schema: { response: { 200: routeSchema(FigureDetailSchema) } } }, async (request, reply) => {
    const result = await repository.readPublishedFigure(actor(request), request.params.id); reply.header("cache-control", "no-store"); return result;
  });
  app.get<{ Params: { id: string }; Querystring: { releaseId: string } }>("/api/v1/catalog/figures/:id/drawing", { onRequest, schema: { querystring: Type.Object({ releaseId: Type.String() }, { additionalProperties: false }) } }, async (request, reply) => {
    const url = await repository.drawing(actor(request), request.params.id, request.query.releaseId); return reply.header("cache-control", "no-store").redirect(url);
  });
}
