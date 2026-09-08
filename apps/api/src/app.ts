import Fastify, { type FastifyInstance } from "fastify";
import type { HashOptions } from "argon2";

import type { AppConfig } from "./config.js";
import { createDatabase } from "./db/client.js";
import { createDatabaseAuthorizationResolver } from "./modules/authorization/policy.js";
import { registerIdentityRoutes } from "./modules/identity/routes.js";
import { createIdentityService, type AuthorizationResolver } from "./modules/identity/service.js";
import { registerAuth } from "./plugins/auth.js";
import { registerErrorHandler, registerNotFoundHandler } from "./plugins/error-handler.js";
import { registerRequestContext } from "./plugins/request-context.js";

export interface AppDependencies {
  database: ReturnType<typeof createDatabase>;
  authorizationResolver: AuthorizationResolver;
  passwordOptions: HashOptions;
  now: () => Date;
}

export interface BuildAppOptions {
  config: AppConfig;
  dependencies?: Partial<AppDependencies>;
}

export async function buildApp({ config, dependencies = {} }: BuildAppOptions): Promise<FastifyInstance> {
  const ownedDatabase = dependencies.database ? null : createDatabase(config.databaseUrl);
  const database = dependencies.database ?? ownedDatabase!;
  const app = Fastify({ logger: false, ajv: { customOptions: { removeAdditional: false } } });
  if (ownedDatabase) app.addHook("onClose", async () => ownedDatabase.close());
  registerRequestContext(app);
  const now = dependencies.now ?? (() => new Date());
  const identity = await createIdentityService({
    database,
    sessionSecret: config.sessionSecret,
    authorizationResolver: dependencies.authorizationResolver ?? createDatabaseAuthorizationResolver(database.db),
    passwordOptions: dependencies.passwordOptions,
    now,
    deliveryEncryption: config.deliveryEncryption,
  });
  registerAuth(app, config, identity);
  registerIdentityRoutes(app, config, identity, now);
  registerErrorHandler(app);
  registerNotFoundHandler(app);

  app.get("/health/live", async () => ({ status: "ok" }));

  return app;
}
