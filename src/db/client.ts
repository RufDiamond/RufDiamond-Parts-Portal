/**
 * Database client.
 *
 * The connection is created once per process. `src/data/repository.ts` remains
 * the only module the UI talks to; this sits behind it.
 */

import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import * as schema from "./schema";

const connectionString =
  process.env.DATABASE_URL ??
  "postgres://rufdiamond:rufdiamond@localhost:5433/rufdiamond";

const client = postgres(connectionString, { max: 10 });

export const db = drizzle(client, { schema });
export { schema, client };
