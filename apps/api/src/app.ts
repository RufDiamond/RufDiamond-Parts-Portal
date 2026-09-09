import Fastify, { type FastifyInstance } from "fastify";
import type { HashOptions } from "argon2";

import type { AppConfig } from "./config.js";
import { createDatabase } from "./db/client.js";
import { createDatabaseAuthorizationResolver } from "./modules/authorization/policy.js";
import { registerIdentityRoutes } from "./modules/identity/routes.js";
import { registerMappingRoutes } from "./modules/diagram-mapping/routes.js";
import { registerDrawingRoutes } from "./modules/drawings/routes.js";
import { registerPublicationRoutes } from "./modules/publication/routes.js";
import { registerCatalogRoutes } from "./modules/catalog/routes.js";
import { createS3DrawingStorage } from "./modules/drawings/s3-storage.js";
import { createClamdScanner, createClamdImportScanner } from "./modules/drawings/scanner.js";
import { registerImportRoutes } from "./modules/imports/routes.js";
import { createS3ImportStorage, type ImportSourceStorage } from "./modules/imports/source-storage.js";
import type { DrawingScanner, DrawingStorage } from "./modules/drawings/storage.js";
import { createIdentityService, type AuthorizationResolver } from "./modules/identity/service.js";
import { registerAuth } from "./plugins/auth.js";
import { registerErrorHandler, registerNotFoundHandler } from "./plugins/error-handler.js";
import { registerRequestContext } from "./plugins/request-context.js";

export interface AppDependencies {
  database: ReturnType<typeof createDatabase>;
  authorizationResolver: AuthorizationResolver;
  passwordOptions: HashOptions;
  now: () => Date;
  drawingStorage: DrawingStorage;
  drawingScanner: DrawingScanner;
  importStorage: ImportSourceStorage;
  importScanner: DrawingScanner;
}

export interface BuildAppOptions {
  config: AppConfig;
  dependencies?: Partial<AppDependencies>;
}

export async function buildApp({ config, dependencies = {} }: BuildAppOptions): Promise<FastifyInstance> {
  const ownedDatabase = dependencies.database ? null : createDatabase(config.databaseUrl);
  const database = dependencies.database ?? ownedDatabase!;
  const app = Fastify({ logger: false, ajv: { customOptions: { removeAdditional: false, coerceTypes: false } } });
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
  registerMappingRoutes(app, config, database.db, now);
  const ownedStorage = dependencies.drawingStorage ? null : createS3DrawingStorage(config.s3);
  if (ownedStorage) app.addHook("onClose", async () => ownedStorage.close());
  registerDrawingRoutes(app, config, database.db, dependencies.drawingStorage ?? ownedStorage!, dependencies.drawingScanner ?? createClamdScanner(config.drawingScanner), now);
  registerPublicationRoutes(app, config, database.db, now);
  const ownedImportStorage = dependencies.importStorage ? null : createS3ImportStorage(config.s3);
  if (ownedImportStorage) app.addHook("onClose", async () => ownedImportStorage.close());
  registerImportRoutes(app, config, database.db, dependencies.importStorage ?? ownedImportStorage!, dependencies.importScanner ?? createClamdImportScanner(config.drawingScanner), now);
  registerCatalogRoutes(app, database.db, dependencies.drawingStorage ?? ownedStorage!);
  registerErrorHandler(app);
  registerNotFoundHandler(app);

  app.get("/health/live", async () => ({ status: "ok" }));

  return app;
}
