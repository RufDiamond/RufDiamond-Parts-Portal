import type { ProblemDetails, ProblemIssue } from "@rufdiamond/contracts";
import type { FastifyError, FastifyInstance, FastifyRequest } from "fastify";

export class AppError extends Error {
  constructor(
    public readonly code: string,
    public readonly status: number,
    detail: string,
    public readonly issues?: ProblemIssue[],
  ) {
    super(detail);
    this.name = "AppError";
  }
}

function problem(
  request: FastifyRequest,
  code: string,
  status: number,
  title: string,
  detail?: string,
  issues?: ProblemIssue[],
): ProblemDetails {
  const type = code === "ROUTE_NOT_FOUND" ? "not-found" : code.toLowerCase().replaceAll("_", "-");
  return {
    type: `https://rufdiamond.example/problems/${type}`,
    title,
    status,
    detail,
    instance: request.url,
    code,
    requestId: request.requestId,
    issues,
  };
}

function titleForStatus(status: number): string {
  switch (status) {
    case 400:
      return "Invalid request";
    case 409:
      return "Conflict";
    case 422:
      return "Validation failed";
    case 429:
      return "Too Many Requests";
    case 503:
      return "Service Unavailable";
    default:
      return "Internal Server Error";
  }
}

function validationIssues(error: FastifyError): ProblemIssue[] | undefined {
  return error.validation?.map((issue) => ({
    path: issue.instancePath || issue.schemaPath,
    code: issue.keyword,
    message: issue.message ?? "Invalid value",
  }));
}

function isValidationError(error: unknown): error is FastifyError {
  return typeof error === "object" && error !== null && "validation" in error && Array.isArray(error.validation);
}

export function registerErrorHandler(app: FastifyInstance): void {
  app.setErrorHandler((error, request, reply) => {
    if (isValidationError(error)) {
      return reply
        .type("application/problem+json")
        .code(400)
        .send(problem(request, "INVALID_REQUEST", 400, "Invalid request", "The request is invalid.", validationIssues(error)));
    }

    if (error instanceof AppError) {
      return reply
        .type("application/problem+json")
        .code(error.status)
        .send(problem(request, error.code, error.status, titleForStatus(error.status), error.message, error.issues));
    }

    return reply
      .type("application/problem+json")
      .code(500)
      .send(problem(request, "INTERNAL_ERROR", 500, "Internal Server Error", "An unexpected error occurred."));
  });
}

export function registerNotFoundHandler(app: FastifyInstance): void {
  app.setNotFoundHandler((request, reply) => {
    return reply
      .type("application/problem+json")
      .code(404)
      .send(problem(request, "ROUTE_NOT_FOUND", 404, "Not Found", "The requested resource was not found."));
  });
}
