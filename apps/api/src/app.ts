import Fastify, { type FastifyInstance } from "fastify";

import type { AppConfig } from "./config.js";
import { registerErrorHandler, registerNotFoundHandler } from "./plugins/error-handler.js";
import { registerRequestContext } from "./plugins/request-context.js";

export type AppDependencies = Record<string, never>;

export interface BuildAppOptions {
  config: AppConfig;
  dependencies?: Partial<AppDependencies>;
}

export async function buildApp({ config, dependencies: _dependencies }: BuildAppOptions): Promise<FastifyInstance> {
  void config;
  void _dependencies;

  const app = Fastify({ logger: false });
  registerRequestContext(app);
  registerErrorHandler(app);
  registerNotFoundHandler(app);

  app.get("/health/live", async () => ({ status: "ok" }));

  return app;
}
