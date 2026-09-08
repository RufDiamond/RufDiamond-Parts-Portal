import type { FastifyInstance } from "fastify";

import type { AppConfig } from "../../config.js";
import { AppError } from "../../plugins/error-handler.js";
import { sessionCookieName } from "../../plugins/auth.js";
import { requireCsrf, requireExactOrigin } from "../../plugins/csrf.js";
import type { IdentityService } from "./service.js";
import {
  MeRouteResponseSchema,
  PasswordResetCompleteBodySchema,
  PasswordResetCompleteResponseSchema,
  PasswordResetRequestBodySchema,
  PasswordResetRequestedResponseSchema,
  SignInBodySchema,
  SignInResponseSchema,
  SignOutBodySchema,
  SignedOutResponseSchema,
} from "./schemas.js";

interface SignInBody { loginId: string; password: string }
interface SignOutBody { allSessions?: boolean }
interface PasswordResetRequestBody { loginId: string }
interface PasswordResetCompleteBody { resetToken: string; newPassword: string }

class InMemoryRateLimiter {
  private readonly windows = new Map<string, { startedAt: number; count: number }>();
  constructor(private readonly limit: number, private readonly windowMs: number, private readonly now: () => Date) {}
  consume(key: string): boolean {
    const timestamp = this.now().getTime();
    const current = this.windows.get(key);
    if (!current || timestamp - current.startedAt >= this.windowMs) {
      this.windows.set(key, { startedAt: timestamp, count: 1 });
      return true;
    }
    current.count += 1;
    return current.count <= this.limit;
  }
}

function cookieOptions(config: AppConfig) {
  return {
    path: "/",
    secure: !config.allowInsecureLoopbackCookie,
    httpOnly: true,
    sameSite: "lax" as const,
    maxAge: 43_200,
  };
}

export function registerIdentityRoutes(app: FastifyInstance, config: AppConfig, identity: IdentityService, now: () => Date = () => new Date()): void {
  // Pilot-only process-local protection; it resets on restart and is not cross-instance durable.
  const signInLimiter = new InMemoryRateLimiter(5, 60_000, now);
  const resetLimiter = new InMemoryRateLimiter(3, 60 * 60_000, now);
  app.post<{ Body: SignInBody }>("/api/v1/auth/sign-in", {
    schema: { body: SignInBodySchema, response: { 200: SignInResponseSchema } },
    preHandler: async request => {
      requireExactOrigin(request, config);
      const key = `${request.ip}\0${request.body.loginId.trim().toLowerCase()}`;
      if (!signInLimiter.consume(key)) throw new AppError("RATE_LIMITED", 429, "Too many requests. Try again later.");
    },
  }, async (request, reply) => {
    const result = await identity.authenticateForRequest(request.body.loginId, request.body.password, request.requestId);
    reply.setCookie(sessionCookieName(config), result.sessionToken, cookieOptions(config));
    return { csrfToken: result.csrfToken };
  });

  app.get("/api/v1/me", { schema: { response: { 200: MeRouteResponseSchema } } }, async request => {
    if (!request.identitySession) throw new AppError("AUTHENTICATION_REQUIRED", 401, "Authentication is required.");
    return request.identitySession.profile;
  });

  app.post<{ Body: SignOutBody }>("/api/v1/auth/sign-out", {
    schema: { body: SignOutBodySchema, response: { 200: SignedOutResponseSchema } },
    preHandler: async request => requireCsrf(request, config),
  }, async (request, reply) => {
    if (!request.identitySession) throw new AppError("AUTHENTICATION_REQUIRED", 401, "Authentication is required.");
    await identity.signOut(request.identitySession.rawToken, request.body.allSessions ?? false);
    reply.clearCookie(sessionCookieName(config), cookieOptions(config));
    return { signedOut: true as const };
  });

  app.post<{ Body: PasswordResetRequestBody }>("/api/v1/auth/password-reset/request", {
    schema: { body: PasswordResetRequestBodySchema, response: { 202: PasswordResetRequestedResponseSchema } },
    preHandler: async request => {
      requireExactOrigin(request, config);
      const key = `${request.ip}\0${request.body.loginId.trim().toLowerCase()}`;
      if (!resetLimiter.consume(key)) throw new AppError("RATE_LIMITED", 429, "Too many requests. Try again later.");
    },
  }, async (request, reply) => {
    await identity.requestPasswordReset(request.body.loginId, request.requestId);
    return reply.code(202).send({ accepted: true as const });
  });

  app.post<{ Body: PasswordResetCompleteBody }>("/api/v1/auth/password-reset/complete", {
    schema: { body: PasswordResetCompleteBodySchema, response: { 200: PasswordResetCompleteResponseSchema } },
    preHandler: async request => requireExactOrigin(request, config),
  }, async request => {
    await identity.completePasswordReset(request.body.resetToken, request.body.newPassword, request.requestId);
    return { completed: true as const };
  });
}
