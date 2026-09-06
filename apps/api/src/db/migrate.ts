import { migrate } from "drizzle-orm/node-postgres/migrator";
import { fileURLToPath } from "node:url";
import { createDatabase } from "./client.js";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("Missing required configuration: DATABASE_URL");
const connection = createDatabase(connectionString);
try {
  await migrate(connection.db, { migrationsFolder: fileURLToPath(new URL("../../drizzle", import.meta.url)) });
} finally {
  await connection.close();
}
