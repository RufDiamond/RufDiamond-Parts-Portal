/** Operator import. Uses MIGRATION_DATABASE_URL from the operator's secret store. */
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import pg from "pg";
import { parts } from "../src/data/ft3-wagon";

const connectionString = process.env.MIGRATION_DATABASE_URL;
if (!connectionString) throw new Error("MIGRATION_DATABASE_URL is required.");
const revision = createHash("sha256").update(await readFile("src/data/ft3-wagon.ts")).digest("hex");
const pool = new pg.Pool({ connectionString, max: 1, connectionTimeoutMillis: 15000 });
const client = await pool.connect();
try {
  await client.query("begin");
  await client.query("select pg_advisory_xact_lock(7193, 17)");
  for (const part of parts) {
    if (part.listPrice !== undefined && (!Number.isFinite(Number(part.listPrice)) || Number(part.listPrice) < 0)) throw new Error(`Invalid source price for ${part.partNumber}`);
    await client.query(`insert into ordering_catalogue_part(source_key,catalogue_key,source_revision,part_number,description,currency,list_price)
      values($1,'ft3-wagon',$2,$3,$4,$5,$6)
      on conflict(source_key) do update set source_revision=excluded.source_revision,part_number=excluded.part_number,
        description=excluded.description,currency=excluded.currency,list_price=excluded.list_price,version=ordering_catalogue_part.version+1,updated_at=now()
      where (ordering_catalogue_part.source_revision,ordering_catalogue_part.part_number,ordering_catalogue_part.description,ordering_catalogue_part.currency,ordering_catalogue_part.list_price)
        is distinct from (excluded.source_revision,excluded.part_number,excluded.description,excluded.currency,excluded.list_price)`,
      [part.id, revision, part.partNumber, part.description, part.currency, part.listPrice === undefined ? null : Number(part.listPrice).toFixed(2)]);
  }
  await client.query("commit");
  console.log(JSON.stringify({ imported: parts.length, sourceRevision: revision }));
} catch (error) {
  await client.query("rollback");
  throw error;
} finally {
  client.release(); await pool.end();
}
