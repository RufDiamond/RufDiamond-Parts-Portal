import {
  AddFactoryQuoteLineInputSchema,
  CompanyDiscountResultSchema,
  CustomerQuotePageSchema,
  NotifyQuoteInputSchema,
  PatchCompanyDiscountInputSchema,
  PatchQuoteLineInputSchema,
  QuoteLinePageSchema,
  QuoteLineSchema,
  QuoteNoticeSchema,
  SubmitCommerceOrderInputSchema,
  SubmitCommerceOrderResultSchema,
  SubmitQuoteInputSchema,
  SubmitQuoteResultSchema,
  type AddFactoryQuoteLineInput,
  type NotifyQuoteInput,
  type PatchCompanyDiscountInput,
  type PatchQuoteLineInput,
  type SubmitCommerceOrderInput,
  type SubmitQuoteInput,
} from "@rufdiamond/contracts";
import { Type } from "@sinclair/typebox";
import type { FastifyInstance, FastifyRequest } from "fastify";
import type { AppConfig } from "../../config.js";
import type { Database } from "../../db/client.js";
import { requireCsrf } from "../../plugins/csrf.js";
import { AppError } from "../../plugins/error-handler.js";
import { actor, authenticated, routeSchema } from "../publication/routes.js";
import { createQuoteService } from "./service.js";

function key(request: FastifyRequest) {
  const value = request.headers["idempotency-key"];
  if (typeof value !== "string" || !value.trim() || value.length > 255) {
    throw new AppError("INVALID_IDEMPOTENCY_KEY", 400, "Supply an idempotency key of 1 to 255 characters.");
  }
  return value;
}

const OkSchema = Type.Object({ ok: Type.Literal(true) }, { additionalProperties: false });
const NoticesSchema = Type.Object(
  { notices: Type.Array(QuoteNoticeSchema) },
  { additionalProperties: false },
);

export function registerQuoteRoutes(app: FastifyInstance, config: AppConfig, database: Database, now: () => Date) {
  const service = createQuoteService(database, now);
  const onRequest = async (request: FastifyRequest) => {
    authenticated(request);
    if (request.method !== "GET") requireCsrf(request, config);
  };

  app.post<{ Body: SubmitQuoteInput }>("/api/v1/quotes", {
    onRequest,
    schema: { body: routeSchema(SubmitQuoteInputSchema), response: { 201: routeSchema(SubmitQuoteResultSchema) } },
  }, async (request, reply) => {
    const result = await service.submit(actor(request), request.body, key(request));
    reply.code(201).header("cache-control", "no-store");
    return result;
  });

  app.get<{ Querystring: { productLine?: string } }>("/api/v1/admin/quotes", {
    onRequest,
    schema: {
      querystring: Type.Object({
        productLine: Type.Optional(Type.Union([
          Type.Literal("Fat Truck"),
          Type.Literal("IronHorse"),
          Type.Literal("Agilis"),
        ])),
      }, { additionalProperties: false }),
      response: { 200: routeSchema(QuoteLinePageSchema) },
    },
  }, async (request, reply) => {
    reply.header("cache-control", "no-store");
    return service.listAdmin(actor(request), request.query.productLine);
  });

  app.get("/api/v1/quotes/mine", {
    onRequest,
    schema: { response: { 200: routeSchema(CustomerQuotePageSchema) } },
  }, async (request, reply) => {
    reply.header("cache-control", "no-store");
    return service.listMine(actor(request));
  });

  app.patch<{ Params: { id: string }; Body: PatchQuoteLineInput }>("/api/v1/admin/quotes/:id", {
    onRequest,
    schema: {
      params: Type.Object({ id: Type.String({ format: "uuid" }) }, { additionalProperties: false }),
      body: routeSchema(PatchQuoteLineInputSchema),
      response: { 200: routeSchema(QuoteLineSchema) },
    },
  }, async (request, reply) => {
    const result = await service.patchLine(actor(request), request.params.id, request.body, key(request));
    reply.header("cache-control", "no-store");
    return result;
  });

  app.post<{ Body: NotifyQuoteInput }>("/api/v1/admin/quotes/notify", {
    onRequest,
    schema: { body: routeSchema(NotifyQuoteInputSchema), response: { 200: routeSchema(NoticesSchema) } },
  }, async (request, reply) => {
    const result = await service.notify(actor(request), request.body, key(request));
    reply.header("cache-control", "no-store");
    return result;
  });

  app.post<{ Body: AddFactoryQuoteLineInput }>("/api/v1/admin/quotes/factory-lines", {
    onRequest,
    schema: { body: routeSchema(AddFactoryQuoteLineInputSchema), response: { 201: routeSchema(QuoteLineSchema) } },
  }, async (request, reply) => {
    const result = await service.addFactoryLine(actor(request), request.body, key(request));
    reply.code(201).header("cache-control", "no-store");
    return result;
  });

  app.post("/api/v1/quotes/notices/seen", {
    onRequest,
    schema: { response: { 200: OkSchema } },
  }, async (request, reply) => {
    const result = await service.markNoticesSeen(actor(request));
    reply.header("cache-control", "no-store");
    return result;
  });

  app.post<{ Body: SubmitCommerceOrderInput }>("/api/v1/commerce-orders", {
    onRequest,
    schema: { body: routeSchema(SubmitCommerceOrderInputSchema), response: { 201: routeSchema(SubmitCommerceOrderResultSchema) } },
  }, async (request, reply) => {
    const result = await service.submitCommerceOrder(actor(request), request.body, key(request));
    reply.code(201).header("cache-control", "no-store");
    return result;
  });

  app.get<{ Params: { id: string } }>("/api/v1/admin/companies/:id/discount", {
    onRequest,
    schema: {
      params: Type.Object({ id: Type.String({ format: "uuid" }) }, { additionalProperties: false }),
      response: { 200: routeSchema(CompanyDiscountResultSchema) },
    },
  }, async (request, reply) => {
    reply.header("cache-control", "no-store");
    return service.getCompanyDiscount(actor(request), request.params.id);
  });

  app.patch<{ Params: { id: string }; Body: PatchCompanyDiscountInput }>("/api/v1/admin/companies/:id/discount", {
    onRequest,
    schema: {
      params: Type.Object({ id: Type.String({ format: "uuid" }) }, { additionalProperties: false }),
      body: routeSchema(PatchCompanyDiscountInputSchema),
      response: { 200: routeSchema(CompanyDiscountResultSchema) },
    },
  }, async (request, reply) => {
    const result = await service.patchCompanyDiscount(actor(request), request.params.id, request.body, key(request));
    reply.header("cache-control", "no-store");
    return result;
  });
}
