import Fastify, { type FastifyInstance } from "fastify";
import type { HashOptions } from "argon2";

import type { AppConfig } from "./config.js";
import { createDatabase } from "./db/client.js";
import { createDatabaseAuthorizationResolver } from "./modules/authorization/policy.js";
import { registerIdentityRoutes } from "./modules/identity/routes.js";
import { registerAccountRoutes } from "./modules/accounts/routes.js";
import { registerMappingRoutes } from "./modules/diagram-mapping/routes.js";
import { registerDrawingRoutes } from "./modules/drawings/routes.js";
import { registerPublicationRoutes } from "./modules/publication/routes.js";
import { registerCatalogRoutes } from "./modules/catalog/routes.js";
import { createS3DrawingStorage } from "./modules/drawings/s3-storage.js";
import { createClamdScanner, createClamdImportScanner } from "./modules/drawings/scanner.js";
import { registerImportRoutes } from "./modules/imports/routes.js";
import { registerCatalogReviewRoutes } from "./modules/catalog-review/routes.js";
import { createS3ImportStorage, type ImportSourceStorage } from "./modules/imports/source-storage.js";
import type { DrawingScanner, DrawingStorage } from "./modules/drawings/storage.js";
import { createIdentityService, type AuthorizationResolver } from "./modules/identity/service.js";
import { registerQuoteRoutes } from "./modules/quotes/routes.js";
import { registerAuth } from "./plugins/auth.js";
import { AppError, registerErrorHandler, registerNotFoundHandler } from "./plugins/error-handler.js";
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

function storageUnavailable(): never {
  throw new AppError("PRIVATE_STORAGE_UNAVAILABLE", 503, "Private storage is unavailable.");
}

const unavailableDrawings: DrawingStorage = {
  createUpload: async () => storageUnavailable(),
  inspect: async () => storageUnavailable(),
  read: async function* () { storageUnavailable(); },
  createDownload: async () => storageUnavailable(),
  deleteQuarantine: async () => storageUnavailable(),
};

const unavailableImports: ImportSourceStorage = {
  put: async () => storageUnavailable(),
  read: async () => storageUnavailable(),
  remove: async () => storageUnavailable(),
};

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
  registerAccountRoutes(app, config, database.db, now, dependencies.passwordOptions);
  registerMappingRoutes(app, config, database.db, now);
  const ownedStorage = config.s3 && !dependencies.drawingStorage ? createS3DrawingStorage(config.s3) : null;
  if (ownedStorage) app.addHook("onClose", async () => ownedStorage.close());
  const drawingStorage = dependencies.drawingStorage ?? ownedStorage ?? unavailableDrawings;
  registerDrawingRoutes(app, config, database.db, drawingStorage, dependencies.drawingScanner ?? createClamdScanner(config.drawingScanner), now);
  registerPublicationRoutes(app, config, database.db, now);
  const ownedImportStorage = config.s3 && !dependencies.importStorage ? createS3ImportStorage(config.s3) : null;
  if (ownedImportStorage) app.addHook("onClose", async () => ownedImportStorage.close());
  const importStorage = dependencies.importStorage ?? ownedImportStorage ?? unavailableImports;
  registerImportRoutes(app, config, database.db, importStorage, dependencies.importScanner ?? createClamdImportScanner(config.drawingScanner), now);
  registerCatalogReviewRoutes(app,config,database.db,importStorage,now);
  registerCatalogRoutes(app, database.db, drawingStorage);
  registerQuoteRoutes(app, config, database.db, now);
  registerErrorHandler(app);
  registerNotFoundHandler(app);

  app.get("/health/live", async () => ({ status: "ok" }));

  return app;
}
