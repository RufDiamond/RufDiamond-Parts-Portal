import type { FastifyInstance } from "fastify";

declare module "fastify" {
  interface FastifyRequest {
    requestId: string;
  }
}

export function registerRequestContext(app: FastifyInstance): void {
  app.addHook("onRequest", (request, reply, done) => {
    request.requestId = request.id;
    reply.header("x-request-id", request.requestId);
    done();
  });
}
