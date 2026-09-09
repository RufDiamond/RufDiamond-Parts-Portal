import { randomUUID } from "node:crypto";
import { copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";
import { closePostgresPool, migrationsFolder, startPostgres } from "../helpers/postgres.js";

type TestPostgres = Awaited<ReturnType<typeof startPostgres>>;

async function migratePre0006(postgres: TestPostgres) {
  const historicalFolder = await mkdtemp(join(tmpdir(), "rufdiamond-integration-schema-"));
  try {
    const journal = JSON.parse(await readFile(join(migrationsFolder, "meta/_journal.json"), "utf8"));
    journal.entries = journal.entries.slice(0, 5);
    await mkdir(join(historicalFolder, "meta"));
    await writeFile(join(historicalFolder, "meta/_journal.json"), JSON.stringify(journal));
    for (const entry of journal.entries) {
      await copyFile(join(migrationsFolder, `${entry.tag}.sql`), join(historicalFolder, `${entry.tag}.sql`));
    }
    await postgres.migrate(historicalFolder);
  } finally {
    await rm(historicalFolder, { recursive: true, force: true });
  }
}

async function createSiblingDatabase(postgres: TestPostgres): Promise<TestPostgres> {
  const databaseName = `integration_schema_${randomUUID().replaceAll("-", "")}`;
  await postgres.pool.query(`create database "${databaseName}"`);
  const connectionUrl = new URL(postgres.connectionString);
  connectionUrl.pathname = `/${databaseName}`;
  const pool = new Pool({ connectionString: connectionUrl.toString() });
  return {
    pool,
    connectionString: connectionUrl.toString(),
    migrate: (folder = migrationsFolder) => migrate(drizzle(pool), { migrationsFolder: folder }),
    async stop() {
      await closePostgresPool(pool);
      await postgres.pool.query(`drop database "${databaseName}"`);
    },
  } as TestPostgres;
}

async function createPre0006Fixture(postgres: TestPostgres, reference = "RFQ-LEGACY-1", post0006 = false) {
  const ids = {
    productLine: randomUUID(),
    model: randomUUID(),
    variant: randomUUID(),
    system: randomUUID(),
    drawing: randomUUID(),
    figure: randomUUID(),
    part: randomUUID(),
    figurePart: randomUUID(),
    callout: randomUUID(),
    company: randomUUID(),
    user: randomUUID(),
    release: randomUUID(),
    releaseDrawing: randomUUID(),
    releaseModel: randomUUID(),
    releaseVariant: randomUUID(),
    releaseSystem: randomUUID(),
    releaseFigure: randomUUID(),
    releasePart: randomUUID(),
    releaseFigurePart: randomUUID(),
    releaseCallout: randomUUID(),
    order: randomUUID(),
    orderLine: randomUUID(),
    importJob: randomUUID(),
  };
  const q = (query: string, values?: unknown[]) => postgres.pool.query(query, values);

  const productLineName = `line-${ids.productLine}`;
  const systemName = `system-${ids.system}`;
  const partNumber = ids.part.toUpperCase();
  await q("insert into product_line(id,name,normalized_name) values($1,$2,$2)", [ids.productLine, productLineName]);
  await q("insert into drawing_file(id,object_key,filename,media_type,bytes,sha256) values($1,$2,'legacy.svg','image/svg+xml',100,repeat('a',64))", [ids.drawing, `drawing-${ids.drawing}`]);
  await q("insert into model(id,product_line_id,name) values($1,$2,'FT3')", [ids.model, ids.productLine]);
  await q("insert into variant(id,model_id,label) values($1,$2,'Legacy machine')", [ids.variant, ids.model]);
  await q("insert into system(id,name,normalized_name) values($1,$2,$2)", [ids.system, systemName]);
  await q("insert into model_system(model_id,system_id) values($1,$2)", [ids.model, ids.system]);
  await q("insert into figure(id,variant_id,system_id,drawing_file_id,name,source_key) values($1,$2,$3,$4,'Pump','figure-legacy')", [ids.figure, ids.variant, ids.system, ids.drawing]);
  await q("insert into part(id,part_number,normalized_part_number,description,list_price) values($1,$2,$2,'Pump',12.34)", [ids.part, partNumber]);
  await q("insert into figure_part(id,figure_id,part_id,source_row_key,qty) values($1,$2,$3,'row-legacy',1)", [ids.figurePart, ids.figure, ids.part]);
  await q("insert into callout(id,figure_id,figure_part_id,source_key,number,x,y) values($1,$2,$3,'marker-legacy','1',10,20)", [ids.callout, ids.figure, ids.figurePart]);

  await q("insert into company(id,name) values($1,'Legacy Customer')", [ids.company]);
  if (post0006) {
    await q("insert into app_user(id,company_id,name,login_id,email,password_hash,role_id) select $1,$2,'Legacy Buyer',$3,$3,'argon2-existing',id from role where key='purchaser'", [ids.user, ids.company, `${ids.user}@example.test`]);
  } else {
    await q("insert into app_user(id,company_id,name,email,password_hash,role_id) select $1,$2,'Legacy Buyer',$3,'argon2-existing',id from role where key='purchaser'", [ids.user, ids.company, `${ids.user}@example.test`]);
  }

  await q("insert into publication_release(id,model_id,revision,source_checksum) values($1,$2,1,repeat('b',64))", [ids.release, ids.model]);
  await q("insert into release_drawing(release_id,id,working_id,object_key,filename,media_type,bytes,sha256) values($1,$2,$3,$4,'legacy.svg','image/svg+xml',100,repeat('a',64))", [ids.release, ids.releaseDrawing, ids.drawing, `release-drawing-${ids.releaseDrawing}`]);
  await q("insert into release_model(release_id,id,working_id,product_line_id,product_line_name,name,status) values($1,$2,$3,$4,'Fat Truck','FT3','active')", [ids.release, ids.releaseModel, ids.model, ids.productLine]);
  await q("insert into release_variant(release_id,id,working_id,model_id,label) values($1,$2,$3,$4,'Legacy machine')", [ids.release, ids.releaseVariant, ids.variant, ids.releaseModel]);
  await q("insert into release_system(release_id,id,working_id,model_id,name) values($1,$2,$3,$4,'Hydraulics')", [ids.release, ids.releaseSystem, ids.system, ids.releaseModel]);
  await q("insert into release_figure(release_id,id,working_id,variant_id,system_id,drawing_id,name,source_key) values($1,$2,$3,$4,$5,$6,'Pump','figure-legacy')", [ids.release, ids.releaseFigure, ids.figure, ids.releaseVariant, ids.releaseSystem, ids.releaseDrawing]);
  await q("insert into release_part(release_id,id,working_id,part_number,description,list_price,currency) values($1,$2,$3,$4,'Pump',12.34,'CAD')", [ids.release, ids.releasePart, ids.part, partNumber]);
  await q("insert into release_figure_part(release_id,id,working_id,figure_id,part_id,source_row_key,qty) values($1,$2,$3,$4,$5,'row-legacy',1)", [ids.release, ids.releaseFigurePart, ids.figurePart, ids.releaseFigure, ids.releasePart]);
  await q("insert into release_callout(release_id,id,working_id,figure_id,figure_part_id,source_key,number,x,y) values($1,$2,$3,$4,$5,'marker-legacy','1',10,20)", [ids.release, ids.releaseCallout, ids.callout, ids.releaseFigure, ids.releaseFigurePart]);
  await q("update publication_release set status='active',published_at=now(),activated_at=now() where id=$1", [ids.release]);

  await q('insert into "order"(id,company_id,submitted_by_user_id,variant_id,release_id,reference,currency,list_total,discount_applied,net_total) values($1,$2,$3,$4,$5,$6,\'CAD\',12.34,0,12.34)', [ids.order, ids.company, ids.user, ids.variant, ids.release, reference]);
  await q("insert into order_line(id,order_id,part_id,release_id,release_part_id,part_number_snapshot,description_snapshot,qty,unit_price_snapshot,line_total) values($1,$2,$3,$4,$5,$6,'Pump',1,12.34,12.34)", [ids.orderLine, ids.order, ids.part, ids.release, ids.releasePart, partNumber]);
  await q('update "order" set submitted_at=now() where id=$1', [ids.order]);
  await q("insert into import_job(id,model_id,variant_id,source_checksum,object_key,filename,actor_id) values($1,$2,$3,repeat('c',64),$5,'legacy.csv',$4)", [ids.importJob, ids.model, ids.variant, ids.user, `import-${ids.importJob}`]);

  return ids;
}

describe("integration schema migration", () => {
  let postgres: TestPostgres;

  beforeAll(async () => {
    postgres = await startPostgres();
  }, 120_000);

  afterAll(async () => {
    await postgres?.stop();
  }, 30_000);

  it("upgrades pre-0006 history additively and keeps added release, order, and import fields protected", async () => {
    await migratePre0006(postgres);
    const ids = await createPre0006Fixture(postgres);
    const oldHistory = (await postgres.pool.query("select * from drizzle.__drizzle_migrations order by id")).rows;
    const oldRelease = (await postgres.pool.query("select id,status,published_at,source_checksum from publication_release where id=$1", [ids.release])).rows[0];
    const oldOrder = (await postgres.pool.query('select id,reference,status,submitted_at,net_total from "order" where id=$1', [ids.order])).rows[0];

    await postgres.migrate();
    await postgres.migrate();

    expect((await postgres.pool.query("select count(*)::int as count from drizzle.__drizzle_migrations")).rows[0].count).toBe(9);
    expect((await postgres.pool.query("select nextval('rfq_reference_seq') as value")).rows[0].value).toBe("1");
    expect((await postgres.pool.query("select * from drizzle.__drizzle_migrations order by id")).rows.slice(0, 5)).toEqual(oldHistory);
    expect((await postgres.pool.query("select id,status,published_at,source_checksum from publication_release where id=$1", [ids.release])).rows[0]).toEqual(oldRelease);
    expect((await postgres.pool.query('select id,reference,status,submitted_at,net_total from "order" where id=$1', [ids.order])).rows[0]).toEqual(oldOrder);
    expect((await postgres.pool.query("select login_id,email,password_hash from app_user where id=$1", [ids.user])).rows[0]).toEqual({
      login_id: `${ids.user}@example.test`,
      email: `${ids.user}@example.test`,
      password_hash: "argon2-existing",
    });
    expect((await postgres.pool.query("select default_shipping_address from company where id=$1", [ids.company])).rows[0].default_shipping_address).toBeNull();
    expect((await postgres.pool.query("select object_version_id,preview_object_version_id,preview_sha256,preview_bytes,preview_width,preview_height from drawing_file where id=$1", [ids.drawing])).rows[0]).toEqual({ object_version_id: null, preview_object_version_id: null, preview_sha256: null, preview_bytes: null, preview_width: null, preview_height: null });
    expect((await postgres.pool.query("select object_version_id,preview_object_version_id,preview_sha256,preview_bytes,preview_width,preview_height from release_drawing where release_id=$1 and id=$2", [ids.release, ids.releaseDrawing])).rows[0]).toEqual({ object_version_id: null, preview_object_version_id: null, preview_sha256: null, preview_bytes: null, preview_width: null, preview_height: null });
    expect((await postgres.pool.query("select mask_path from callout where id=$1", [ids.callout])).rows[0].mask_path).toBeNull();
    expect((await postgres.pool.query("select mask_path from release_callout where release_id=$1 and id=$2", [ids.release, ids.releaseCallout])).rows[0].mask_path).toBeNull();
    expect((await postgres.pool.query('select customer_reference,details_snapshot,context_snapshot from "order" where id=$1', [ids.order])).rows[0]).toEqual({ customer_reference: null, details_snapshot: null, context_snapshot: null });
    expect((await postgres.pool.query("select comment_snapshot from order_line where id=$1", [ids.orderLine])).rows[0].comment_snapshot).toBeNull();
    expect((await postgres.pool.query("select object_version_id from import_job where id=$1", [ids.importJob])).rows[0].object_version_id).toBeNull();

    await expect(postgres.pool.query("update release_drawing set object_version_id='tampered' where release_id=$1 and id=$2", [ids.release, ids.releaseDrawing])).rejects.toMatchObject({ code: "23514" });
    await expect(postgres.pool.query("update release_callout set mask_path='M0 0' where release_id=$1 and id=$2", [ids.release, ids.releaseCallout])).rejects.toMatchObject({ code: "23514" });
    await expect(postgres.pool.query("update drawing_file set object_version_id='tampered' where id=$1", [ids.drawing])).rejects.toMatchObject({ code: "23514" });
    await expect(postgres.pool.query('update "order" set customer_reference=\'changed\' where id=$1', [ids.order])).rejects.toMatchObject({ code: "23514" });
    await expect(postgres.pool.query('update "order" set details_snapshot=\'{"generalComment":"changed","shipping":null}\' where id=$1', [ids.order])).rejects.toMatchObject({ code: "23514" });
    await expect(postgres.pool.query('update "order" set context_snapshot=\'{"companyName":"changed","companyAddress":null,"productLineName":"Fat Truck","modelName":"FT3","serialLabel":"Legacy machine"}\' where id=$1', [ids.order])).rejects.toMatchObject({ code: "23514" });
    await expect(postgres.pool.query("update order_line set comment_snapshot='changed' where id=$1", [ids.orderLine])).rejects.toMatchObject({ code: "23514" });
    await expect(postgres.pool.query("update import_job set object_version_id='tampered' where id=$1", [ids.importJob])).rejects.toMatchObject({ code: "23514" });
  }, 30_000);

  it("enforces canonical logins, exact order context snapshots, pinned-object metadata, and unique non-null RFQ references", async () => {
    const ids = await createPre0006Fixture(postgres, "RFQ-NEW-BASE", true);
    const q = (query: string, values?: unknown[]) => postgres.pool.query(query, values);

    await expect(q("insert into app_user(company_id,name,login_id,email,password_hash,role_id) select $1,'Bad Login',' Not-Canonical ','bad-login@example.test','existing-hash',id from role where key='purchaser'", [ids.company])).rejects.toMatchObject({ code: "23514" });
    await expect(q("insert into app_user(company_id,name,login_id,email,password_hash,role_id) select $1,'Duplicate Login',$2,'unique-email@example.test','existing-hash',id from role where key='purchaser'", [ids.company, `${ids.user}@example.test`])).rejects.toMatchObject({ code: "23505" });
    await q("update company set default_shipping_address='100 Test Street' where id=$1", [ids.company]);
    expect((await q("select default_shipping_address from company where id=$1", [ids.company])).rows[0].default_shipping_address).toBe("100 Test Street");
    await expect(q("insert into import_job(model_id,variant_id,source_checksum,object_key,object_version_id,actor_id) values($1,$2,repeat('9',64),$3,'',$4)", [ids.model, ids.variant, `invalid-import-${randomUUID()}`, ids.user])).rejects.toMatchObject({ code: "23514" });

    const orderId = randomUUID();
    const context = { companyName: "Legacy Customer", companyAddress: null, productLineName: "Fat Truck", modelName: "FT3", serialLabel: "Legacy machine" };
    const details = { generalComment: "Please quote", shipping: null };
    await q('insert into "order"(id,company_id,submitted_by_user_id,variant_id,release_id,reference,customer_reference,details_snapshot,context_snapshot,currency,list_total,discount_applied,net_total) values($1,$2,$3,$4,$5,\'RFQ-NEW-2\',\'CUSTOMER-PO\',$6,$7,\'CAD\',0,0,0)', [orderId, ids.company, ids.user, ids.variant, ids.release, details, context]);
    expect((await q('select customer_reference,details_snapshot,context_snapshot from "order" where id=$1', [orderId])).rows[0]).toEqual({ customer_reference: "CUSTOMER-PO", details_snapshot: details, context_snapshot: context });
    for (const invalidContext of [
      { ...context, extra: "not allowed" },
      { ...context, companyName: null },
      { companyName: "Legacy Customer", companyAddress: null, productLineName: "Fat Truck", modelName: "FT3" },
    ]) {
      await expect(q('update "order" set context_snapshot=$2 where id=$1', [orderId, invalidContext])).rejects.toMatchObject({ code: "23514" });
    }
    await expect(q('insert into "order"(company_id,submitted_by_user_id,variant_id,release_id,reference,currency,list_total,discount_applied,net_total) values($1,$2,$3,$4,\'RFQ-NEW-2\',\'CAD\',0,0,0)', [ids.company, ids.user, ids.variant, ids.release])).rejects.toMatchObject({ code: "23505" });
    await q('insert into "order"(company_id,submitted_by_user_id,variant_id,release_id,reference,currency,list_total,discount_applied,net_total) values($1,$2,$3,$4,null,\'CAD\',0,0,0),($1,$2,$3,$4,null,\'CAD\',0,0,0)', [ids.company, ids.user, ids.variant, ids.release]);

    const drawing = randomUUID();
    await q("insert into drawing_file(id,object_key,object_version_id,filename,media_type,bytes,sha256,preview_object_key,preview_object_version_id,preview_sha256,preview_bytes,preview_width,preview_height) values($1,$2,'v-original','new.svg','image/svg+xml',100,repeat('d',64),$3,'v-preview',repeat('e',64),50,640,480)", [drawing, `drawing-${drawing}`, `${drawing}-preview`]);
    expect((await q("select object_version_id,preview_object_version_id,preview_bytes,preview_width,preview_height from drawing_file where id=$1", [drawing])).rows[0]).toEqual({ object_version_id: "v-original", preview_object_version_id: "v-preview", preview_bytes: "50", preview_width: 640, preview_height: 480 });
    for (const [column, value] of [["object_version_id", ""], ["preview_object_version_id", "  "], ["preview_sha256", "invalid"], ["preview_bytes", 0], ["preview_width", 0], ["preview_height", -1]] as const) {
      const invalidDrawing = randomUUID();
      await expect(q(`insert into drawing_file(id,object_key,filename,media_type,bytes,sha256,${column}) values($1,$2,'invalid.svg','image/svg+xml',100,repeat('f',64),$3)`, [invalidDrawing, `drawing-${invalidDrawing}`, value])).rejects.toMatchObject({ code: "23514" });
    }

    const buildingRelease = randomUUID();
    await q("insert into publication_release(id,model_id,revision,source_checksum) values($1,$2,2,repeat('8',64))", [buildingRelease, ids.model]);
    for (const [column, value] of [["object_version_id", ""], ["preview_object_version_id", "  "], ["preview_sha256", "invalid"], ["preview_bytes", 0], ["preview_width", 0], ["preview_height", -1]] as const) {
      await expect(q(`insert into release_drawing(release_id,id,working_id,object_key,filename,media_type,bytes,sha256,${column}) values($1,$2,$3,$4,'invalid.svg','image/svg+xml',100,repeat('7',64),$5)`, [buildingRelease, randomUUID(), randomUUID(), `invalid-release-drawing-${randomUUID()}`, value])).rejects.toMatchObject({ code: "23514" });
    }
  }, 30_000);

  it("fails migration with a diagnostic when historical RFQ references conflict and leaves history unchanged", async () => {
    const conflicting = await createSiblingDatabase(postgres);
    try {
      await migratePre0006(conflicting);
      const ids = await createPre0006Fixture(conflicting, "RFQ-DUPLICATE");
      await conflicting.pool.query('insert into "order"(company_id,submitted_by_user_id,variant_id,release_id,reference,currency,list_total,discount_applied,net_total,submitted_at) values($1,$2,$3,$4,\'RFQ-DUPLICATE\',\'CAD\',0,0,0,now())', [ids.company, ids.user, ids.variant, ids.release]);

      await expect(conflicting.migrate()).rejects.toMatchObject({
        cause: {
          code: "23505",
          message: expect.stringMatching(/duplicate RFQ references.*RFQ-DUPLICATE.*2/i),
        },
      });
      expect((await conflicting.pool.query('select count(*)::int as count from "order" where reference=\'RFQ-DUPLICATE\'')).rows[0].count).toBe(2);
      await expect(conflicting.pool.query('select customer_reference from "order" limit 1')).rejects.toMatchObject({ code: "42703" });
      expect((await conflicting.pool.query("select count(*)::int as count from drizzle.__drizzle_migrations")).rows[0].count).toBe(5);
    } finally {
      await conflicting.stop();
    }
  }, 30_000);
});
