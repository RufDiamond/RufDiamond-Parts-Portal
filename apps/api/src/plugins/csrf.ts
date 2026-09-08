import { timingSafeEqual } from "node:crypto";
import type { FastifyRequest } from "fastify";
import type { AppConfig } from "../config.js";
import { AppError } from "./error-handler.js";

function constantTimeEqual(left: string, right: string): boolean {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}

export function requireExactOrigin(request: FastifyRequest, config: AppConfig): void {
  const origin = request.headers.origin;
  if (origin !== config.webOrigin) throw new AppError("ORIGIN_REJECTED", 403, "The request origin is not allowed.");
  const referer = request.headers.referer;
  if (referer !== undefined) {
    let refererOrigin: string;
    try { refererOrigin = new URL(referer).origin; } catch { throw new AppError("ORIGIN_REJECTED", 403, "The request origin is not allowed."); }
    if (refererOrigin !== config.webOrigin) throw new AppError("ORIGIN_REJECTED", 403, "The request origin is not allowed.");
  }
}

export function requireCsrf(request: FastifyRequest, config: AppConfig): void {
  requireExactOrigin(request, config);
  if (!request.identitySession) throw new AppError("AUTHENTICATION_REQUIRED", 401, "Authentication is required.");
  const expected = request.identitySession?.csrfToken;
  const supplied = request.headers["x-csrf-token"];
  if (!expected || typeof supplied !== "string" || !constantTimeEqual(expected, supplied)) {
    throw new AppError("CSRF_REJECTED", 403, "The request could not be verified.");
  }
}
