import { PostgreSqlContainer } from "@testcontainers/postgresql";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";

export const migrationsFolder = fileURLToPath(new URL("../../drizzle", import.meta.url));

export async function closePostgresPool(pool: Pool): Promise<void> {
  const expectedRemovals = pool.totalCount;
  if (expectedRemovals === 0) {
    await pool.end();
    return;
  }

  let removed = 0;
  let resolveRemoved!: () => void;
  const allRemoved = new Promise<void>(resolve => { resolveRemoved = resolve; });
  const onRemove = () => {
    removed += 1;
    if (removed === expectedRemovals) resolveRemoved();
  };
  pool.on("remove", onRemove);
  try {
    await Promise.all([pool.end(), allRemoved]);
  } finally {
    pool.off("remove", onRemove);
  }
}

export async function startPostgres() {
  // Testcontainers does not resolve Docker CLI contexts (notably Colima).
  // Respect explicit CI settings; otherwise use the developer's active context.
  if (!process.env.DOCKER_HOST) {
    try {
      const endpoint = execFileSync("docker", ["context", "inspect", "--format", "{{.Endpoints.docker.Host}}"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
      if (endpoint) process.env.DOCKER_HOST = endpoint;
      if (endpoint.includes("/.colima/")) process.env.TESTCONTAINERS_DOCKER_SOCKET_OVERRIDE ??= "/var/run/docker.sock";
    } catch {
      // Other supported runtimes can still be discovered by Testcontainers.
    }
  }
  const container = await new PostgreSqlContainer("postgres:17-alpine")
    .withEnvironment({ TZ: "UTC", PGTZ: "UTC" }).start();
  const pool = new Pool({ connectionString: container.getConnectionUri() });
  return {
    pool,
    connectionString: container.getConnectionUri(),
    migrate: (folder = migrationsFolder) => migrate(drizzle(pool), { migrationsFolder: folder }),
    async stop() {
      await closePostgresPool(pool);
      await container.stop();
    },
  };
}
