import { fileURLToPath } from "node:url";

import { buildApp, type AppDependencies } from "./app.js";
import { loadConfig, type AppConfig } from "./config.js";

export interface StartServerOptions {
  config?: AppConfig;
  dependencies?: Partial<AppDependencies>;
}

export async function startServer(options: StartServerOptions = {}) {
  const config = options.config ?? loadConfig(process.env);
  const app = await buildApp({ config, dependencies: options.dependencies });
  let shuttingDown = false;

  const shutdown = () => {
    if (shuttingDown) return;
    shuttingDown = true;
    void app.close().then(
      () => process.exit(0),
      () => process.exit(1),
    );
  };

  process.once("SIGTERM", shutdown);
  try {
    await app.listen({ port: config.port, host: "0.0.0.0" });
  } catch (error) {
    process.removeListener("SIGTERM", shutdown);
    await app.close();
    throw error;
  }

  return app;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  void startServer();
}
