import cookie from "@fastify/cookie";
import type { SessionUser } from "@rufdiamond/contracts";
import type { FastifyInstance } from "fastify";

import type { AppConfig } from "../config.js";
import type { AuthenticatedSession, IdentityService } from "../modules/identity/service.js";

declare module "fastify" {
  interface FastifyRequest {
    sessionUser: SessionUser | null;
    identitySession: AuthenticatedSession | null;
  }
}

export function sessionCookieName(config: AppConfig): string {
  return config.allowInsecureLoopbackCookie ? "ruf-session-dev" : "__Host-ruf-session";
}

export function registerAuth(app: FastifyInstance, config: AppConfig, identity: IdentityService): void {
  app.register(cookie);
  app.decorateRequest("sessionUser", null);
  app.decorateRequest("identitySession", null);
  app.addHook("onRequest", async request => {
    const token = request.cookies[sessionCookieName(config)];
    if (!token) return;
    const details = await identity.readSessionDetails(token);
    request.identitySession = details;
    request.sessionUser = details?.user ?? null;
  });
}
