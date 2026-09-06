import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { startPostgres } from "../helpers/postgres.js";
import { sql } from "drizzle-orm";
import { getTableConfig } from "drizzle-orm/pg-core";
import * as schema from "../../src/db/schema/index.js";
import { closeDatabase, createDatabase, withTransaction } from "../../src/db/client.js";

describe("PostgreSQL domain constraints", () => {
  let postgres: Awaited<ReturnType<typeof startPostgres>>;
  beforeAll(async () => { postgres = await startPostgres(); }, 120_000);
  afterAll(async () => { await postgres?.stop(); }, 30_000);

  it("migrations build an empty database and replay without duplicating schema or seeds", async () => {
    await expect(postgres.migrate()).resolves.toBeUndefined();
    await expect(postgres.migrate()).resolves.toBeUndefined();
    const result = await postgres.pool.query("select count(*)::int as count from drizzle.__drizzle_migrations");
    expect(result.rows[0].count).toBe(4);
    expect((await postgres.pool.query("select count(*)::int as count from capability")).rows[0].count).toBe(45);
  });

  async function fixture() {
    const ids = { line: randomUUID(), model: randomUUID(), variant: randomUUID(), system: randomUUID(), figure: randomUUID(), otherFigure: randomUUID(), part: randomUUID(), otherPart: randomUUID(), row: randomUUID() };
    const q = (sql: string, values?: unknown[]) => postgres.pool.query(sql, values);
    await q("insert into product_line(id,name,normalized_name) values($1,$2,$2)", [ids.line, ids.line]);
    await q("insert into model(id,product_line_id,name) values($1,$2,'FT3')", [ids.model, ids.line]);
    await q("insert into variant(id,model_id,label) values($1,$2,'Wagon')", [ids.variant, ids.model]);
    await q("insert into system(id,name,normalized_name) values($1,$2,$2)", [ids.system, ids.system]);
    await q("insert into model_system(model_id,system_id) values($1,$2)", [ids.model, ids.system]);
    for (const id of [ids.figure, ids.otherFigure]) await q("insert into figure(id,variant_id,system_id,name,source_key) values($1,$2,$3,'Filters',$4)", [id, ids.variant, ids.system, id]);
    for (const id of [ids.part, ids.otherPart]) await q("insert into part(id,part_number,normalized_part_number,description,list_price) values($1,$2,upper($2),'Filter',12.34)", [id, id]);
    await q("insert into figure_part(id,figure_id,part_id,source_row_key,qty) values($1,$2,$3,'source-a',2)", [ids.row, ids.figure, ids.part]);
    return ids;
  }

  it("rejects dangling FKs and cross-figure mappings but permits incomplete draft mappings", async () => {
    const ids = await fixture();
    await expect(postgres.pool.query("insert into callout(figure_id,figure_part_id,source_key,number) values($1,$2,'wrong','1')", [ids.otherFigure, ids.row])).rejects.toMatchObject({ code: "23503" });
    await expect(postgres.pool.query("insert into figure_part(figure_id,part_id,source_row_key,qty) values($1,$2,'missing',1)", [ids.figure, randomUUID()])).rejects.toMatchObject({ code: "23503" });
    await postgres.pool.query("insert into callout(figure_id,source_key,number) values($1,'unmapped','1')", [ids.figure]);
  });

  it("accepts paired nulls and coordinate boundaries while rejecting partial and out-of-range coordinates", async () => {
    const { figure } = await fixture();
    for (const [x, y] of [[null, null], [0, 0], [100, 100]]) {
      await postgres.pool.query("insert into callout(figure_id,source_key,number,x,y) values($1,$2,'7',$3,$4)", [figure, randomUUID(), x, y]);
    }
    for (const [x, y] of [[null, 1], [1, null], [-0.01, 0], [0, 100.01]]) {
      await expect(postgres.pool.query("insert into callout(figure_id,source_key,number,x,y) values($1,$2,'7',$3,$4)", [figure, randomUUID(), x, y])).rejects.toMatchObject({ code: "23514" });
    }
  });

  it("retains repeated callout numbers and drawn and not-shown rows of the same part", async () => {
    const ids = await fixture();
    await postgres.pool.query("insert into figure_part(figure_id,part_id,source_row_key,qty,remarks) values($1,$2,'source-b',1,'not shown; other configuration')", [ids.figure, ids.part]);
    for (let i = 0; i < 3; i++) await postgres.pool.query("insert into callout(figure_id,figure_part_id,source_key,number,x,y) values($1,$2,$3,'7',10,20)", [ids.figure, ids.row, `marker-${i}`]);
    expect((await postgres.pool.query("select count(*)::int as count from callout where figure_part_id=$1", [ids.row])).rows[0].count).toBe(3);
    expect((await postgres.pool.query("select count(*)::int as count from figure_part where figure_id=$1 and part_id=$2", [ids.figure, ids.part])).rows[0].count).toBe(2);
    await expect(postgres.pool.query("insert into figure_part(figure_id,part_id,source_row_key,qty) values($1,$2,'source-b',1)", [ids.figure, ids.part])).rejects.toMatchObject({ code: "23505" });
  });

  it("stores directional requirements and rejects self-links and nonpositive quantities", async () => {
    const ids = await fixture();
    await postgres.pool.query("insert into part_requires(part_id,required_part_id,qty) values($1,$2,2)", [ids.part, ids.otherPart]);
    expect((await postgres.pool.query("select count(*)::int as count from part_requires where part_id=$1", [ids.otherPart])).rows[0].count).toBe(0);
    await expect(postgres.pool.query("insert into part_requires(part_id,required_part_id,qty) values($1,$1,1)", [ids.part])).rejects.toMatchObject({ code: "23514" });
    await expect(postgres.pool.query("insert into part_requires(part_id,required_part_id,qty) values($1,$2,0)", [ids.otherPart, ids.part])).rejects.toMatchObject({ code: "23514" });
    await expect(postgres.pool.query("update figure_part set qty=-1 where id=$1", [ids.row])).rejects.toMatchObject({ code: "23514" });
  });

  it("permits only one active release per model and seals snapshots after publication", async () => {
    const ids = await fixture();
    const release = randomUUID();
    const next = randomUUID();
    await postgres.pool.query("insert into publication_release(id,model_id,revision,source_checksum) values($1,$2,1,repeat('a',64)),($3,$2,2,repeat('b',64))", [release, ids.model, next]);
    await postgres.pool.query("insert into release_model(release_id,id,working_id,product_line_id,name,product_line_name,status) values($1,$2,$2,$3,'FT3','Fat Truck','active')", [release, ids.model, ids.line]);
    await postgres.pool.query("update publication_release set status='active',published_at=now() where id=$1", [release]);
    await expect(postgres.pool.query("update publication_release set status='active',published_at=now() where id=$1", [next])).rejects.toMatchObject({ code: "23505" });
    await expect(postgres.pool.query("update release_model set name='Changed' where release_id=$1", [release])).rejects.toMatchObject({ code: "23514" });
    await expect(postgres.pool.query("delete from release_model where release_id=$1", [release])).rejects.toMatchObject({ code: "23514" });
    await postgres.pool.query("update publication_release set status='inactive' where id=$1", [release]);
    await expect(postgres.pool.query("insert into release_part(release_id,id,working_id,part_number,description,currency) values($1,$2,$2,'new','new','CAD')", [release, randomUUID()])).rejects.toMatchObject({ code: "23514" });
    await expect(postgres.pool.query("update publication_release set published_at=null,status='building' where id=$1", [release])).rejects.toMatchObject({ code: "23514" });
    await postgres.pool.query("update publication_release set status='active' where id=$1", [release]);
  });

  async function account() {
    const company = randomUUID();
    const user = randomUUID();
    await postgres.pool.query("insert into company(id,name) values($1,'Mine')", [company]);
    await postgres.pool.query("insert into app_user(id,company_id,name,email,password_hash,role_id) select $1,$2,'Buyer',$3,'argon2-placeholder',id from role where key='purchaser'", [user, company, `${user}@example.test`]);
    return { company, user };
  }

  async function orderRelease(source: Awaited<ReturnType<typeof fixture>>) {
    const release = randomUUID();
    const releasedModel = randomUUID();
    const releasedVariant = randomUUID();
    const releasedPart = randomUUID();
    const connection = createDatabase(postgres.connectionString);
    try {
      await connection.withTransaction(async tx => {
        await tx.insert(schema.publicationRelease).values({ id: release, modelId: source.model, revision: 1, sourceChecksum: 'a'.repeat(64) });
        await tx.insert(schema.releaseModel).values({ releaseId: release, id: releasedModel, workingId: source.model, productLineId: source.line, productLineName: 'Fat Truck', name: 'FT3', status: 'active' });
        await tx.insert(schema.releaseVariant).values({ releaseId: release, id: releasedVariant, workingId: source.variant, modelId: releasedModel, label: 'Wagon' });
        await tx.insert(schema.releasePart).values({ releaseId: release, id: releasedPart, workingId: source.part, partNumber: 'P', description: 'Filter', listPrice: '12.34', currency: 'CAD' });
      });
      return { release, releasedPart };
    } finally { await connection.close(); }
  }

  it("enforces decimal money, positive order quantities, and immutable submitted snapshots", async () => {
    const ids = await fixture();
    const { company, user } = await account();
    const order = randomUUID();
    const { release, releasedPart } = await orderRelease(ids);
    await postgres.pool.query('insert into "order"(id,company_id,submitted_by_user_id,variant_id,release_id,currency,list_total,discount_applied,net_total) values($1,$2,$3,$4,$5,\'CAD\',24.68,2.47,22.21)', [order, company, user, ids.variant, release]);
    await expect(postgres.pool.query("update company set discount_rate=1.01 where id=$1", [company])).rejects.toMatchObject({ code: "23514" });
    await expect(postgres.pool.query('insert into order_line(order_id,part_id,release_id,release_part_id,part_number_snapshot,description_snapshot,qty,unit_price_snapshot,line_total) values($1,$2,$3,$4,\'P\',\'Filter\',0,12.34,0)', [order, ids.part, release, releasedPart])).rejects.toMatchObject({ code: "23514" });
    await postgres.pool.query("insert into order_line(order_id,part_id,release_id,release_part_id,part_number_snapshot,description_snapshot,qty,unit_price_snapshot,line_total) values($1,$2,$3,$4,'P','Filter',2,12.34,24.68)", [order, ids.part, release, releasedPart]);
    await postgres.pool.query('update "order" set submitted_at=now() where id=$1', [order]);
    await postgres.pool.query("update part set list_price=99.99 where id=$1", [ids.part]);
    expect((await postgres.pool.query("select unit_price_snapshot from order_line where order_id=$1", [order])).rows[0].unit_price_snapshot).toBe("12.34");
    await expect(postgres.pool.query("update order_line set unit_price_snapshot=99.99 where order_id=$1", [order])).rejects.toMatchObject({ code: "23514" });
    await expect(postgres.pool.query('update "order" set net_total=22.20 where id=$1', [order])).rejects.toMatchObject({ code: "23514" });
    await postgres.pool.query('update "order" set status=\'quoted\',version=version+1 where id=$1', [order]);
  });

  it("keeps narrow dealer scopes, per-company technician pricing, and explicit publisher assignments", async () => {
    const a = await account();
    const b = await account();
    expect((await postgres.pool.query("select technician_pricing_visible from company where id=$1", [a.company])).rows[0].technician_pricing_visible).toBe(true);
    await postgres.pool.query("update company set technician_pricing_visible=false where id=$1", [a.company]);
    expect((await postgres.pool.query("select technician_pricing_visible from company where id=$1", [b.company])).rows[0].technician_pricing_visible).toBe(true);
    await postgres.pool.query("insert into dealer_customer_scope(dealer_company_id,customer_company_id) values($1,$2)", [a.company, b.company]);
    await expect(postgres.pool.query("insert into dealer_customer_scope(dealer_company_id,customer_company_id) values($1,$1)", [a.company])).rejects.toMatchObject({ code: "23514" });
    expect((await postgres.pool.query("select count(*)::int as count from role_capability where capability_key in ('publish.execute','publish.rollback','publish.block.override')")).rows[0].count).toBe(0);
    await postgres.pool.query("insert into user_capability(user_id,capability_key) values($1,'publish.execute')", [a.user]);
    expect((await postgres.pool.query("select count(*)::int as count from user_capability where user_id=$1", [b.user])).rows[0].count).toBe(0);
  });

  it("deduplicates staged source identities and actor-operation idempotency keys", async () => {
    const ids = await fixture();
    const { user } = await account();
    const job = randomUUID();
    await postgres.pool.query("insert into import_job(id,model_id,variant_id,source_checksum,object_key,actor_id) values($1,$2,$3,repeat('c',64),$5,$4)", [job, ids.model, ids.variant, user, job]);
    await postgres.pool.query("insert into import_staging_row(job_id,source_row_key,source_payload,normalized_fields) values($1,'row-a','{}','{}')", [job]);
    await expect(postgres.pool.query("insert into import_staging_row(job_id,source_row_key,source_payload,normalized_fields) values($1,'row-a','{}','{}')", [job])).rejects.toMatchObject({ code: "23505" });
    await postgres.pool.query("insert into idempotency_record(actor_id,operation,key,request_hash) values($1,'orders.submit','retry-key',repeat('d',64))", [user]);
    await expect(postgres.pool.query("insert into idempotency_record(actor_id,operation,key,request_hash) values($1,'orders.submit','retry-key',repeat('e',64))", [user])).rejects.toMatchObject({ code: "23505" });
    await postgres.pool.query("insert into idempotency_record(actor_id,operation,key,request_hash) values($1,'parts.import','retry-key',repeat('e',64))", [user]);
  });

  it("keeps audit records append-only and object keys immutable", async () => {
    const { user, company } = await account();
    const audit = randomUUID();
    await postgres.pool.query("insert into audit_log(id,actor_id,effective_company_id,capability,object_type,object_id,request_id) values($1,$2,$3,'parts.record.edit','part',$4,$5)", [audit, user, company, randomUUID(), randomUUID()]);
    await expect(postgres.pool.query("delete from audit_log where id=$1", [audit])).rejects.toMatchObject({ code: "23514" });
    await expect(postgres.pool.query("update audit_log set capability='parts.record.view' where id=$1", [audit])).rejects.toMatchObject({ code: "23514" });
    const drawing = randomUUID();
    await postgres.pool.query("insert into drawing_file(id,object_key,filename,media_type,bytes,sha256,uploaded_by_user_id) values($1,$3,'drawing.svg','image/svg+xml',100,repeat('f',64),$2)", [drawing, user, drawing]);
    await expect(postgres.pool.query("update drawing_file set object_key='replacement' where id=$1", [drawing])).rejects.toMatchObject({ code: "23514" });
  });

  it("keeps staged import identity and idempotency request hashes stable", async () => {
    const ids = await fixture();
    const { user } = await account();
    const job = randomUUID();
    await postgres.pool.query("insert into import_job(id,model_id,variant_id,source_checksum,object_key,actor_id) values($1,$2,$3,repeat('c',64),$5,$4)", [job, ids.model, ids.variant, user, job]);
    await expect(postgres.pool.query("update import_job set source_checksum=repeat('b',64) where id=$1", [job])).rejects.toMatchObject({ code: "23514" });
    await postgres.pool.query("update import_job set state='staged',version=version+1 where id=$1", [job]);
    await postgres.pool.query("insert into idempotency_record(actor_id,operation,key,request_hash) values($1,'orders.submit','stable',repeat('a',64))", [user]);
    await expect(postgres.pool.query("update idempotency_record set request_hash=repeat('b',64) where actor_id=$1", [user])).rejects.toMatchObject({ code: "23514" });
    await postgres.pool.query("update idempotency_record set status='completed',response='{\"id\":\"saved\"}',response_status=201 where actor_id=$1", [user]);
    await expect(postgres.pool.query("update idempotency_record set response='{\"id\":\"changed\"}' where actor_id=$1", [user])).rejects.toMatchObject({ code: "23514" });
  });

  it("rolls back domain, audit, and outbox writes together through the exported transaction API", async () => {
    const { company, user } = await account();
    const id = randomUUID();
    const priorUrl = process.env.DATABASE_URL;
    process.env.DATABASE_URL = postgres.connectionString;
    try {
      await expect(withTransaction(async tx => {
        await tx.insert(schema.productLine).values({ id, name: 'Rollback', normalizedName: 'rollback' });
        await tx.insert(schema.auditLog).values({ actorId: user, effectiveCompanyId: company, capability: 'catalog.model.create', objectType: 'product_line', objectId: id, requestId: id });
        await tx.insert(schema.outboxEvent).values({ eventType: 'catalog.changed', aggregateType: 'product_line', aggregateId: id, payload: { id } });
        throw new Error('abort transaction');
      })).rejects.toThrow('abort transaction');
      expect((await postgres.pool.query("select count(*)::int as count from product_line where id=$1", [id])).rows[0].count).toBe(0);
      expect((await postgres.pool.query("select count(*)::int as count from audit_log where object_id=$1", [id])).rows[0].count).toBe(0);
      expect((await postgres.pool.query("select count(*)::int as count from outbox_event where aggregate_id=$1", [id])).rows[0].count).toBe(0);
      expect(await withTransaction(async tx => {
        await tx.insert(schema.productLine).values({ id, name: 'Committed', normalizedName: 'committed' });
        return 'committed';
      })).toBe('committed');
      expect((await postgres.pool.query("select name from product_line where id=$1", [id])).rows[0].name).toBe('Committed');
    } finally {
      await closeDatabase();
      if (priorUrl === undefined) delete process.env.DATABASE_URL; else process.env.DATABASE_URL = priorUrl;
    }
    const connection = createDatabase(postgres.connectionString);
    try {
      const result = await connection.withTransaction(tx => tx.execute(sql`select current_setting('TimeZone') as timezone`));
      expect(result.rows[0]?.timezone).toBe('UTC');
    } finally { await connection.close(); }
  });

  it("matches every deployed column type and nullability to the Drizzle contract", async () => {
    const actual = await postgres.pool.query<{ table_name: string; column_name: string; sql_type: string; not_null: boolean }>(`
      select c.relname as table_name,a.attname as column_name,format_type(a.atttypid,a.atttypmod) as sql_type,a.attnotnull as not_null
      from pg_attribute a join pg_class c on c.oid=a.attrelid join pg_namespace n on n.oid=c.relnamespace
      where n.nspname='public' and c.relkind='r' and a.attnum>0 and not a.attisdropped
    `);
    const deployed = new Map(actual.rows.map(row => [`${row.table_name}.${row.column_name}`, row]));
    let count = 0;
    for (const table of Object.values(schema)) {
      const config = getTableConfig(table);
      for (const column of config.columns) {
        const key = `${config.name}.${column.name}`;
        expect(deployed.get(key)?.sql_type.replaceAll(' ', ''), key).toBe(column.getSQLType().replaceAll(' ', ''));
        expect(deployed.get(key)?.not_null, key).toBe(column.notNull);
        count++;
      }
    }
    expect(actual.rows).toHaveLength(count);
  });

  it("keeps the complete release graph local, preserves repeated rows, and seals every snapshot table", async () => {
    const connection = createDatabase(postgres.connectionString);
    async function graph() {
      const source = await fixture();
      const release = randomUUID();
      const drawing = randomUUID();
      await connection.withTransaction(async tx => {
        await tx.insert(schema.publicationRelease).values({ id: release, modelId: source.model, revision: 1, sourceChecksum: 'a'.repeat(64) });
        await tx.insert(schema.releaseDrawing).values({ releaseId: release, id: drawing, workingId: drawing, objectKey: drawing, filename: 'drawing.svg', mediaType: 'image/svg+xml', bytes: 100n, sha256: 'a'.repeat(64) });
        await tx.insert(schema.releaseModel).values({ releaseId: release, id: source.model, workingId: source.model, productLineId: source.line, productLineName: 'Fat Truck', name: 'FT3', status: 'active' });
        await tx.insert(schema.releaseVariant).values({ releaseId: release, id: source.variant, workingId: source.variant, modelId: source.model, label: 'Wagon' });
        await tx.insert(schema.releaseSystem).values({ releaseId: release, id: source.system, workingId: source.system, modelId: source.model, name: 'Filters' });
        for (const id of [source.figure, source.otherFigure]) await tx.insert(schema.releaseFigure).values({ releaseId: release, id, workingId: id, variantId: source.variant, systemId: source.system, drawingId: drawing, name: 'Filters', sourceKey: id });
        for (const id of [source.part, source.otherPart]) await tx.insert(schema.releasePart).values({ releaseId: release, id, workingId: id, partNumber: id, description: 'Filter', listPrice: '12.34', currency: 'CAD' });
        await tx.insert(schema.releasePartRequires).values({ releaseId: release, partId: source.part, requiredPartId: source.otherPart, qty: 2 });
        const notShown = randomUUID();
        await tx.insert(schema.releaseFigurePart).values([
          { releaseId: release, id: source.row, workingId: source.row, figureId: source.figure, partId: source.part, sourceRowKey: 'source-a', qty: 2 },
          { releaseId: release, id: notShown, workingId: notShown, figureId: source.figure, partId: source.part, sourceRowKey: 'source-b', qty: 1, remarks: 'not shown' },
        ]);
        for (let i = 0; i < 2; i++) await tx.insert(schema.releaseCallout).values({ releaseId: release, workingId: randomUUID(), figureId: source.figure, figurePartId: source.row, sourceKey: `marker-${i}`, number: '7', x: '0', y: '100' });
      });
      return { ...source, release, drawing };
    }
    try {
      const a = await graph();
      const b = await graph();
      await expect(postgres.pool.query("update release_figure set drawing_id=$2 where release_id=$1", [a.release, b.drawing])).rejects.toMatchObject({ code: '23503' });
      await expect(postgres.pool.query("update release_callout set figure_id=$2 where release_id=$1", [a.release, a.otherFigure])).rejects.toMatchObject({ code: '23503' });
      await expect(postgres.pool.query("update release_callout set x=null where release_id=$1", [a.release])).rejects.toMatchObject({ code: '23502' });
      await expect(postgres.pool.query("update release_callout set y=100.01 where release_id=$1", [a.release])).rejects.toMatchObject({ code: '23514' });
      expect((await postgres.pool.query("select count(*)::int as count from release_figure_part where release_id=$1 and part_id=$2", [a.release, a.part])).rows[0].count).toBe(2);
      expect((await postgres.pool.query("select count(*)::int as count from release_callout where release_id=$1 and figure_part_id=$2", [a.release, a.row])).rows[0].count).toBe(2);
      await postgres.pool.query("update publication_release set status='active',published_at=now() where id=$1", [a.release]);
      await postgres.pool.query("update part set list_price=99.99 where id=$1", [a.part]);
      expect((await postgres.pool.query("select list_price from release_part where release_id=$1 and id=$2", [a.release, a.part])).rows[0].list_price).toBe('12.34');
      for (const table of ['release_model','release_variant','release_system','release_drawing','release_figure','release_part','release_part_requires','release_figure_part','release_callout']) {
        await expect(postgres.pool.query(`update ${table} set release_id=release_id where release_id=$1`, [a.release])).rejects.toMatchObject({ code: '23514' });
      }
    } finally { await connection.close(); }
  });

  it.each(['cross-release line', 'mismatched working part', 'variant outside release', 'missing order release', 'missing line release'])('rejects RFQ reference corruption: %s', async scenario => {
    const a = await fixture();
    const b = await fixture();
    const releaseA = await orderRelease(a);
    const releaseB = await orderRelease(b);
    const { company, user } = await account();
    const order = randomUUID();
    const insertOrder = (variantId: string, releaseId: string | null) => postgres.pool.query('insert into "order"(id,company_id,submitted_by_user_id,variant_id,release_id,currency,list_total,discount_applied,net_total) values($1,$2,$3,$4,$5,\'CAD\',12.34,0,12.34)', [order, company, user, variantId, releaseId]);
    if (scenario === 'variant outside release') {
      await expect(insertOrder(b.variant, releaseA.release)).rejects.toMatchObject({ code: '23503' });
      return;
    }
    if (scenario === 'missing order release') {
      await expect(insertOrder(a.variant, null)).rejects.toMatchObject({ code: '23502' });
      return;
    }
    await insertOrder(a.variant, releaseA.release);
    const insertLine = (partId: string, releaseId: string | null, releasedPartId: string | null) => postgres.pool.query("insert into order_line(order_id,part_id,release_id,release_part_id,part_number_snapshot,description_snapshot,qty,unit_price_snapshot,line_total) values($1,$2,$3,$4,'P','Filter',1,12.34,12.34)", [order, partId, releaseId, releasedPartId]);
    if (scenario === 'cross-release line') {
      await expect(insertLine(b.part, releaseB.release, releaseB.releasedPart)).rejects.toMatchObject({ code: '23503' });
    } else if (scenario === 'mismatched working part') {
      await expect(insertLine(a.otherPart, releaseA.release, releaseA.releasedPart)).rejects.toMatchObject({ code: '23503' });
    } else {
      await expect(insertLine(a.part, null, null)).rejects.toMatchObject({ code: '23502' });
    }
    await insertLine(a.part, releaseA.release, releaseA.releasedPart);
  });

  it.each(['insert', 'complete'])('requires an HTTP response status when idempotency records %s as completed', async operation => {
    const { user } = await account();
    if (operation === 'insert') {
      await expect(postgres.pool.query("insert into idempotency_record(actor_id,operation,key,request_hash,status,response) values($1,'orders.submit','missing-status',repeat('a',64),'completed','{}')", [user])).rejects.toMatchObject({ code: '23514' });
    } else {
      await postgres.pool.query("insert into idempotency_record(actor_id,operation,key,request_hash) values($1,'orders.submit','missing-status',repeat('a',64))", [user]);
      await expect(postgres.pool.query("update idempotency_record set status='completed',response='{}' where actor_id=$1", [user])).rejects.toMatchObject({ code: '23514' });
      await postgres.pool.query("update idempotency_record set status='completed',response='{}',response_status=201 where actor_id=$1", [user]);
      expect((await postgres.pool.query("select response_status from idempotency_record where actor_id=$1", [user])).rows[0].response_status).toBe(201);
    }
  });

  it.each(['job_id', 'source_row_key', 'source_payload'])('protects import staging %s while permitting normalized-field review', async field => {
    const source = await fixture();
    const { user } = await account();
    const job = randomUUID();
    const otherJob = randomUUID();
    const row = randomUUID();
    for (const [id, checksum] of [[job, 'a'], [otherJob, 'b']]) await postgres.pool.query("insert into import_job(id,model_id,variant_id,source_checksum,object_key,actor_id) values($1,$2,$3,repeat($4,64),$5,$6)", [id, source.model, source.variant, checksum, id, user]);
    await postgres.pool.query("insert into import_staging_row(id,job_id,source_row_key,source_payload,normalized_fields) values($1,$2,'row-a','{\"PART NO\":\"P\"}','{\"partNumber\":\"P\"}')", [row, job]);
    const replacement = field === 'job_id' ? otherJob : field === 'source_row_key' ? 'row-b' : '{"PART NO":"changed"}';
    await expect(postgres.pool.query(`update import_staging_row set ${field}=$2 where id=$1`, [row, replacement])).rejects.toMatchObject({ code: '23514' });
    await postgres.pool.query("update import_staging_row set normalized_fields='{\"partNumber\":\"P-corrected\"}',version=version+1 where id=$1", [row]);
    expect((await postgres.pool.query("select job_id,source_row_key,source_payload,normalized_fields,version from import_staging_row where id=$1", [row])).rows[0]).toEqual({ job_id: job, source_row_key: 'row-a', source_payload: { 'PART NO': 'P' }, normalized_fields: { partNumber: 'P-corrected' }, version: 2 });
  });
});
