import { randomUUID } from "node:crypto";
import { copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool, type PoolClient } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { closePostgresPool, migrationsFolder, startPostgres } from "../helpers/postgres.js";

const securityTriggerFunctions = [
  "protect_idempotency_record",
  "protect_import_source",
  "protect_import_staging_source",
  "protect_order_line",
  "protect_order_snapshot",
  "protect_publication_release",
  "protect_release_snapshot",
  "reject_immutable_change",
] as const;

describe("snapshot trigger security", () => {
  let postgres: Awaited<ReturnType<typeof startPostgres>>;
  let runtime: PoolClient;
  const ids = {
    line: randomUUID(), model: randomUUID(), variant: randomUUID(), part: randomUUID(),
    sealedRelease: randomUUID(), buildingRelease: randomUUID(), releasedModel: randomUUID(),
    releasedVariant: randomUUID(), releasedPart: randomUUID(), company: randomUUID(), user: randomUUID(),
    submittedOrder: randomUUID(), buildingOrder: randomUUID(),
  };

  beforeAll(async () => {
    postgres = await startPostgres();
    await postgres.migrate();
    const q = (text: string, values?: unknown[]) => postgres.pool.query(text, values);
    await q("insert into product_line(id,name,normalized_name) values($1,'Fat Truck','fat truck')", [ids.line]);
    await q("insert into model(id,product_line_id,name) values($1,$2,'FT3')", [ids.model, ids.line]);
    await q("insert into variant(id,model_id,label) values($1,$2,'Wagon')", [ids.variant, ids.model]);
    await q("insert into part(id,part_number,normalized_part_number,description,list_price) values($1,'P-1','P-1','Part',10)", [ids.part]);
    await q("insert into publication_release(id,model_id,revision,status,published_at,source_checksum) values($1,$2,1,'inactive',now(),repeat('a',64)),($3,$2,2,'building',null,repeat('b',64))", [ids.sealedRelease, ids.model, ids.buildingRelease]);
    await q("insert into release_model(release_id,id,working_id,product_line_id,product_line_name,name,status) values($1,$2,$3,$4,'Fat Truck','FT3','active')", [ids.buildingRelease, ids.releasedModel, ids.model, ids.line]);
    await q("insert into release_variant(release_id,id,working_id,model_id,label) values($1,$2,$3,$4,'Wagon')", [ids.buildingRelease, ids.releasedVariant, ids.variant, ids.releasedModel]);
    await q("insert into release_part(release_id,id,working_id,part_number,description,list_price,currency) values($1,$2,$3,'P-1','Part',10,'CAD')", [ids.buildingRelease, ids.releasedPart, ids.part]);
    await q("insert into company(id,name) values($1,'Customer')", [ids.company]);
    await q("insert into app_user(id,company_id,name,login_id,email,password_hash,role_id) select $1,$2,'Buyer',$3,$3,'hash',id from role where key='purchaser'", [ids.user, ids.company, `${ids.user}@example.test`]);
    await q('insert into "order"(id,company_id,submitted_by_user_id,variant_id,release_id,currency,list_total,discount_applied,net_total,submitted_at) values($1,$3,$4,$5,$6,\'CAD\',0,0,0,now()),($2,$3,$4,$5,$6,\'CAD\',0,0,0,null)', [ids.submittedOrder, ids.buildingOrder, ids.company, ids.user, ids.variant, ids.buildingRelease]);
    await q("create role ruf_runtime_trigger_test nologin nosuperuser nocreatedb nocreaterole noinherit nobypassrls");
    await q("grant usage on schema public to ruf_runtime_trigger_test");
    await q('grant select, update on public.publication_release, public."order" to ruf_runtime_trigger_test');
    await q("grant insert on public.release_part, public.order_line to ruf_runtime_trigger_test");

    runtime = await postgres.pool.connect();
    await runtime.query("set role ruf_runtime_trigger_test");
    await runtime.query("create temporary table publication_release(id uuid primary key,published_at timestamptz)");
    await runtime.query('create temporary table "order"(id uuid primary key,submitted_at timestamptz)');
    await runtime.query("insert into pg_temp.publication_release values($1,null)", [ids.sealedRelease]);
    await runtime.query('insert into pg_temp."order" values($1,null)', [ids.submittedOrder]);
  }, 120_000);

  afterAll(async () => {
    runtime?.release();
    await postgres?.stop();
  }, 30_000);

  it("rejects inserts into a sealed public release despite a conflicting temporary parent", async () => {
    await expect(runtime.query("insert into public.release_part(release_id,working_id,part_number,description,currency) values($1,$2,'SHADOW','Shadow','CAD')", [ids.sealedRelease, randomUUID()]))
      .rejects.toMatchObject({ code: "23514" });
  });

  it("still permits inserts into a legitimate building release", async () => {
    await expect(runtime.query("insert into public.release_part(release_id,working_id,part_number,description,currency) values($1,$2,'VALID','Valid','CAD')", [ids.buildingRelease, randomUUID()]))
      .resolves.toMatchObject({ rowCount: 1 });
  });

  it("rejects inserts into submitted public order lines despite a conflicting temporary parent", async () => {
    await expect(runtime.query("insert into public.order_line(order_id,part_id,release_id,release_part_id,part_number_snapshot,description_snapshot,qty,unit_price_snapshot,line_total) values($1,$2,$3,$4,'P-1','Part',1,10,10)", [ids.submittedOrder, ids.part, ids.buildingRelease, ids.releasedPart]))
      .rejects.toMatchObject({ code: "23514" });
  });

  it("still permits inserts into a legitimate unsubmitted order", async () => {
    await expect(runtime.query("insert into public.order_line(order_id,part_id,release_id,release_part_id,part_number_snapshot,description_snapshot,qty,unit_price_snapshot,line_total) values($1,$2,$3,$4,'P-1','Part',1,10,10)", [ids.buildingOrder, ids.part, ids.buildingRelease, ids.releasedPart]))
      .resolves.toMatchObject({ rowCount: 1 });
  });

  it("keeps every security-trigger function invoker-secure with a pinned lookup path", async () => {
    const rows = (await postgres.pool.query("select p.proname,p.prosecdef,pg_get_functiondef(p.oid) definition from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname = any($1::text[]) order by p.proname", [securityTriggerFunctions])).rows;
    expect(rows.map(row => row.proname)).toEqual(securityTriggerFunctions);
    for (const row of rows) {
      expect(row.prosecdef).toBe(false);
      expect(row.definition).toContain("SET search_path TO 'pg_catalog', 'public', 'pg_temp'");
    }
  });

  it("waits for owned pool clients to be removed before pool shutdown resolves", async () => {
    const ownedPool = new Pool({ connectionString: postgres.connectionString });
    await ownedPool.query("select 1");
    let removed = false;
    ownedPool.once("remove", () => { removed = true; });

    await closePostgresPool(ownedPool);

    expect(removed).toBe(true);
  });

  it("upgrades 0001-0006 additively and replays without changing prior history", async () => {
    const historicalFolder = await mkdtemp(join(tmpdir(), "ruf-migrations-"));
    const databaseName = `upgrade_${randomUUID().replaceAll("-", "")}`;
    await postgres.pool.query(`create database "${databaseName}"`);
    const upgradeUrl = new URL(postgres.connectionString);
    upgradeUrl.pathname = `/${databaseName}`;
    const upgradePool = new Pool({ connectionString: upgradeUrl.toString() });
    try {
      await mkdir(join(historicalFolder, "meta"));
      const journal = JSON.parse(await readFile(join(migrationsFolder, "meta/_journal.json"), "utf8"));
      const firstSix = { ...journal, entries: journal.entries.slice(0, 6) };
      await writeFile(join(historicalFolder, "meta/_journal.json"), JSON.stringify(firstSix));
      for (const entry of firstSix.entries) await copyFile(join(migrationsFolder, `${entry.tag}.sql`), join(historicalFolder, `${entry.tag}.sql`));

      await migrate(drizzle(upgradePool), { migrationsFolder: historicalFolder });
      const oldHistory = (await upgradePool.query("select * from drizzle.__drizzle_migrations order by id")).rows;
      await migrate(drizzle(upgradePool), { migrationsFolder });
      await migrate(drizzle(upgradePool), { migrationsFolder });
      expect((await upgradePool.query("select count(*)::int count from drizzle.__drizzle_migrations")).rows[0].count).toBe(8);
      expect((await upgradePool.query("select * from drizzle.__drizzle_migrations order by id")).rows.slice(0, 6)).toEqual(oldHistory);
    } finally {
      await closePostgresPool(upgradePool);
      await postgres.pool.query(`drop database "${databaseName}" with (force)`);
      await rm(historicalFolder, { recursive: true, force: true });
    }
  });
});
