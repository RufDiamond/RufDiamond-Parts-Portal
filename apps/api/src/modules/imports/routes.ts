import { createHash } from "node:crypto";
import type { Readable } from "node:stream";
import { Value } from "@sinclair/typebox/value";
import {
  ImportDetailSchema,
  ImportIssueReviewInputSchema,
  ImportUploadMetadataSchema,
  type ImportIssueReviewInput,
  type ImportUploadMetadata,
} from "@rufdiamond/contracts";
import type { FastifyInstance, FastifyRequest } from "fastify";
import type { AppConfig } from "../../config.js";
import type { Database } from "../../db/client.js";
import { AppError } from "../../plugins/error-handler.js";
import { requireCsrf } from "../../plugins/csrf.js";
import type { DrawingScanner } from "../drawings/storage.js";
import { MAX_IMPORT_BYTES } from "./parser.js";
import { createImportService, type ImportWrite } from "./service.js";
import {
  importContentType,
  type ImportSourceStorage,
} from "./source-storage.js";
const uuid = {
  type: "string",
  pattern:
    "^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$",
};
export function registerImportRoutes(
  app: FastifyInstance,
  config: AppConfig,
  database: Database,
  storage: ImportSourceStorage,
  scanner: DrawingScanner,
  now: () => Date,
) {
  const service = createImportService(database, storage, scanner, now),
    path = "/api/v1/admin/imports",
    empty = { type: "object", additionalProperties: false, properties: {} };
  const actor = (request: FastifyRequest) => ({
    userId: request.identitySession!.user.id,
    requestId: request.requestId,
  });
  const onRequest = async (request: FastifyRequest) => {
    if (!request.identitySession)
      throw new AppError(
        "AUTHENTICATION_REQUIRED",
        401,
        "Authentication is required.",
      );
    if (request.method !== "GET") requireCsrf(request, config);
  };
  const write = (request: FastifyRequest): ImportWrite => {
    const version = request.headers["if-match"],
      key = request.headers["idempotency-key"];
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
  // Encapsulation keeps these content types and byte limits away from all PNG/JSON routes.
  void app.register(async (scoped) => {
    scoped.addContentTypeParser(
      [
        "text/csv",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      ],
      async (request: FastifyRequest, payload: Readable) => {
        const input = request.query as ImportUploadMetadata;
        if (!Value.Check(ImportUploadMetadataSchema, input))
          throw new AppError(
            "INVALID_IMPORT_METADATA",
            400,
            "Supply exact import metadata.",
          );
        if (request.headers["content-type"] !== importContentType(input.format))
          throw new AppError(
            "INVALID_IMPORT_FORMAT",
            400,
            "Source content type must match its declared format.",
          );
        await service.preflight(actor(request), input, write(request));
        if (request.headers["content-encoding"])
          throw new AppError(
            "INVALID_IMPORT_ENCODING",
            400,
            "Compressed HTTP bodies are not accepted.",
          );
        const declared = Number(request.headers["content-length"] ?? 0);
        if (declared > MAX_IMPORT_BYTES)
          throw new AppError(
            "IMPORT_TOO_LARGE",
            413,
            "Import byte limit exceeded.",
          );
        const chunks: Buffer[] = [],
          hash = createHash("sha256");
        let size = 0;
        for await (const chunk of payload) {
          const bytes = Buffer.from(chunk);
          size += bytes.length;
          if (size > MAX_IMPORT_BYTES)
            throw new AppError(
              "IMPORT_TOO_LARGE",
              413,
              "Import byte limit exceeded.",
            );
          hash.update(bytes);
          chunks.push(bytes);
        }
        if (hash.digest("hex") !== input.sha256)
          throw new AppError(
            "SOURCE_HASH_MISMATCH",
            422,
            "Source bytes do not match the declared checksum.",
          );
        return Buffer.concat(chunks);
      },
    );
    scoped.post<{ Querystring: ImportUploadMetadata; Body: Buffer }>(
      path,
      {
        onRequest: async (request) => {
          await onRequest(request);
          if (!Value.Check(ImportUploadMetadataSchema, request.query))
            throw new AppError(
              "INVALID_IMPORT_METADATA",
              400,
              "Supply exact import metadata.",
            );
          if (
            request.headers["content-type"] !==
            importContentType(request.query.format)
          )
            throw new AppError(
              "INVALID_IMPORT_FORMAT",
              400,
              "Source content type must match its declared format.",
            );
          await service.preflight(
            actor(request),
            request.query,
            write(request),
          );
        },
        bodyLimit: MAX_IMPORT_BYTES,
        schema: {
          querystring: ImportUploadMetadataSchema,
          response: { 201: ImportDetailSchema },
        },
      },
      async (request, reply) =>
        reply
          .code(201)
          .header("cache-control", "no-store")
          .send(
            await service.stage(
              actor(request),
              request.query,
              write(request),
              request.body,
            ),
          ),
    );
  });
  const params = {
    type: "object",
    additionalProperties: false,
    required: ["id"],
    properties: { id: uuid },
  };
  app.get<{ Params: { id: string } }>(
    `${path}/:id`,
    {
      onRequest,
      schema: {
        params,
        querystring: empty,
        response: { 200: ImportDetailSchema },
      },
    },
    async (request, reply) => {
      const result = await service.read(actor(request), request.params.id);
      return reply
        .header("etag", `"${result.version}"`)
        .header("cache-control", "no-store")
        .send(result);
    },
  );
  for (const operation of ["validate", "apply"] as const)
    app.post<{ Params: { id: string }; Body: Record<string, never> }>(
      `${path}/:id/${operation}`,
      {
        onRequest,
        bodyLimit: 4096,
        schema: {
          params,
          querystring: empty,
          body: empty,
          response: { 200: ImportDetailSchema },
        },
      },
      async (request, reply) => {
        const result = await service[operation](
          actor(request),
          request.params.id,
          write(request),
        );
        return reply
          .header("etag", `"${result.version}"`)
          .header("cache-control", "no-store")
          .send(result);
      },
    );
  app.patch<{
    Params: { id: string; issueId: string };
    Body: ImportIssueReviewInput;
  }>(
    `${path}/:id/issues/:issueId`,
    {
      onRequest,
      bodyLimit: 8192,
      schema: {
        params: {
          ...params,
          required: ["id", "issueId"],
          properties: { id: uuid, issueId: uuid },
        },
        querystring: empty,
        body: ImportIssueReviewInputSchema,
        response: { 200: ImportDetailSchema },
      },
    },
    async (request, reply) => {
      const result = await service.review(
        actor(request),
        request.params.id,
        request.params.issueId,
        write(request),
        request.body,
      );
      return reply
        .header("etag", `"${result.version}"`)
        .header("cache-control", "no-store")
        .send(result);
    },
  );
}
