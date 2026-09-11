import {
  AssemblyReferenceReviewInputSchema,
  DepictionReviewInputSchema,
  SourceReviewDetailSchema,
  type AssemblyReferenceReviewInput,
  type DepictionReviewInput,
} from "@rufdiamond/contracts";
import type { FastifyInstance, FastifyRequest } from "fastify";
import type { AppConfig } from "../../config.js";
import type { Database } from "../../db/client.js";
import { AppError } from "../../plugins/error-handler.js";
import { requireCsrf } from "../../plugins/csrf.js";
import type { ImportSourceStorage } from "../imports/source-storage.js";
import { createQuantityReviewService } from "./quantity.js";
import { createDepictionReviewService } from "./service.js";

export function registerCatalogReviewRoutes(
  app: FastifyInstance,
  config: AppConfig,
  database: Database,
  storage: ImportSourceStorage,
  now: () => Date,
) {
  const quantity = createQuantityReviewService(database, storage, now);
  const depiction = createDepictionReviewService(database, now);
  const empty = { type: "object", additionalProperties: false, properties: {} };
  const params = {
    type: "object",
    additionalProperties: false,
    required: ["id"],
    properties: {
      id: {
        type: "string",
        pattern:
          "^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$",
      },
    },
  };
  const actor = (r: FastifyRequest) => ({
    userId: r.identitySession!.user.id,
    requestId: r.requestId,
  });
  const onRequest = async (r: FastifyRequest) => {
    if (!r.identitySession)
      throw new AppError(
        "AUTHENTICATION_REQUIRED",
        401,
        "Authentication is required.",
      );
    if (r.method !== "GET") requireCsrf(r, config);
  };
  const write = (r: FastifyRequest) => {
    const version = r.headers["if-match"],
      key = r.headers["idempotency-key"];
    if (version === undefined)
      throw new AppError(
        "PRECONDITION_REQUIRED",
        428,
        "Supply the current version in If-Match.",
      );
    if (
      typeof version !== "string" ||
      !/^"[1-9][0-9]{0,9}"$/.test(version) ||
      Number(version.slice(1, -1)) > 2147483646
    )
      throw new AppError(
        "INVALID_PRECONDITION",
        400,
        "Supply one quoted positive version.",
      );
    if (typeof key !== "string" || !key.trim() || key.length > 255)
      throw new AppError(
        "INVALID_IDEMPOTENCY_KEY",
        400,
        "Supply an idempotency key of 1 to 255 characters.",
      );
    return {
      expectedVersion: Number(version.slice(1, -1)),
      idempotencyKey: key,
    };
  };
  const path = "/api/v1/admin/catalog-review/imports/:id";
  app.get<{ Params: { id: string } }>(
    path,
    {
      onRequest,
      schema: {
        params,
        querystring: empty,
        response: { 200: SourceReviewDetailSchema },
      },
    },
    async (r, reply) => {
      const result = await quantity.read(actor(r), r.params.id);
      return reply
        .header("etag", `"${result.version}"`)
        .header("cache-control", "no-store")
        .send(result);
    },
  );
  app.post<{ Params: { id: string }; Body: AssemblyReferenceReviewInput }>(
    `${path}/quantity-decisions`,
    {
      onRequest,
      bodyLimit: 8192,
      schema: {
        params,
        querystring: empty,
        body: AssemblyReferenceReviewInputSchema,
        response: { 200: SourceReviewDetailSchema },
      },
    },
    async (r, reply) => {
      const result = await quantity.approve(
        actor(r),
        r.params.id,
        write(r),
        r.body,
      );
      return reply
        .header("etag", `"${result.version}"`)
        .header("cache-control", "no-store")
        .send(result);
    },
  );
  const figurePath = "/api/v1/admin/catalog-review/figures/:id";
  app.get<{ Params: { id: string } }>(
    figurePath,
    {
      onRequest,
      schema: {
        params,
        querystring: empty,
        response: { 200: SourceReviewDetailSchema },
      },
    },
    async (r, reply) => {
      const result = await depiction.read(actor(r), r.params.id);
      return reply
        .header("etag", `"${result.version}"`)
        .header("cache-control", "no-store")
        .send(result);
    },
  );
  app.post<{ Params: { id: string }; Body: DepictionReviewInput }>(
    `${figurePath}/decisions`,
    {
      onRequest,
      bodyLimit: 65536,
      schema: {
        params,
        querystring: empty,
        body: DepictionReviewInputSchema,
        response: { 200: SourceReviewDetailSchema },
      },
    },
    async (r, reply) => {
      const result = await depiction.approve(
        actor(r),
        r.params.id,
        write(r),
        r.body,
      );
      return reply
        .header("etag", `"${result.version}"`)
        .header("cache-control", "no-store")
        .send(result);
    },
  );
}
