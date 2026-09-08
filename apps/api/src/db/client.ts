import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema/index.js";

export type Database = NodePgDatabase<typeof schema>;
export type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0];

export function createDatabase(connectionString: string) {
  const pool = new Pool({ connectionString, options: "-c timezone=UTC" });
  const db: Database = drizzle(pool, { schema });
  return {
    db,
    pool,
    withTransaction<T>(fn: (tx: Transaction) => Promise<T>): Promise<T> {
      return db.transaction(fn);
    },
    close: () => pool.end(),
  };
}

let defaultConnection: ReturnType<typeof createDatabase> | undefined;

export function getDatabase(): Database {
  if (!defaultConnection) {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) throw new Error("Missing required configuration: DATABASE_URL");
    defaultConnection = createDatabase(connectionString);
  }
  return defaultConnection.db;
}

export function withTransaction<T>(fn: (tx: Transaction) => Promise<T>): Promise<T> {
  return getDatabase().transaction(fn);
}

export async function closeDatabase(): Promise<void> {
  const connection = defaultConnection;
  defaultConnection = undefined;
  await connection?.close();
}
