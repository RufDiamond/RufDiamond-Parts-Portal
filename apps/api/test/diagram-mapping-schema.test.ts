import { randomUUID } from "node:crypto";
import { copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool, type PoolClient } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { closePostgresPool, migrationsFolder, startPostgres } from "./helpers/postgres.js";

type TestPostgres = Awaited<ReturnType<typeof startPostgres>>;

async function createDatabase(postgres: TestPostgres, prefix: string) {
  const name = `${prefix}_${randomUUID().replaceAll("-", "")}`;
  await postgres.pool.query(`create database "${name}"`);
  const url = new URL(postgres.connectionString);
  url.pathname = `/${name}`;
  const pool = new Pool({ connectionString: url.toString() });
  return {
    pool,
    migrate: (folder = migrationsFolder) => migrate(drizzle(pool), { migrationsFolder: folder }),
    async stop() {
      await closePostgresPool(pool);
      await postgres.pool.query(`drop database "${name}"`);
    },
  };
}

async function withHistoricalMigrations<T>(count: number, fn: (folder: string) => Promise<T>): Promise<T> {
  const folder = await mkdtemp(join(tmpdir(), "ruf-diagram-migrations-"));
  try {
    await mkdir(join(folder, "meta"));
    const journal = JSON.parse(await readFile(join(migrationsFolder, "meta/_journal.json"), "utf8"));
    journal.entries = journal.entries.slice(0, count);
    await writeFile(join(folder, "meta/_journal.json"), JSON.stringify(journal));
    for (const entry of journal.entries) {
      await copyFile(join(migrationsFolder, `${entry.tag}.sql`), join(folder, `${entry.tag}.sql`));
    }
    return await fn(folder);
  } finally {
    await rm(folder, { recursive: true, force: true });
  }
}

async function inFixtureTransaction(pool: Pool, fn: (client: PoolClient) => Promise<void>) {
  const client = await pool.connect();
  try {
    await client.query("begin");
    await fn(client);
    await client.query("commit");
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
}

async function createWorkingFixture(pool: Pool) {
  const ids = {
    line: randomUUID(), model: randomUUID(), variant: randomUUID(), system: randomUUID(),
    drawing: randomUUID(), otherDrawing: randomUUID(), figure: randomUUID(), otherFigure: randomUUID(),
    company: randomUUID(), actor: randomUUID(),
  };
  await inFixtureTransaction(pool, async q => {
    await q.query("insert into product_line(id,name,normalized_name) values($1,$2,$2)", [ids.line, `line-${ids.line}`]);
    await q.query("insert into model(id,product_line_id,name) values($1,$2,'FT3')", [ids.model, ids.line]);
    await q.query("insert into variant(id,model_id,label) values($1,$2,'Machine')", [ids.variant, ids.model]);
    await q.query("insert into system(id,name,normalized_name) values($1,$2,$2)", [ids.system, `system-${ids.system}`]);
    await q.query("insert into drawing_file(id,object_key,filename,media_type,bytes,sha256,width,height) values($1,$2,'one.png','image/png',100,repeat('a',64),640,480),($3,$4,'two.png','image/png',100,repeat('b',64),800,600)", [ids.drawing, `drawing-${ids.drawing}`, ids.otherDrawing, `drawing-${ids.otherDrawing}`]);
    await q.query("insert into figure(id,variant_id,system_id,drawing_file_id,name,source_key) values($1,$2,$3,$4,'One','one'),($5,$2,$3,$6,'Two','two')", [ids.figure, ids.variant, ids.system, ids.drawing, ids.otherFigure, ids.otherDrawing]);
    await q.query("insert into diagram_mapping(figure_id) values($1),($2)", [ids.figure, ids.otherFigure]);
    await q.query("insert into company(id,name) values($1,'Mapping team')", [ids.company]);
    await q.query("insert into app_user(id,company_id,name,login_id,email,password_hash,role_id) select $1,$2,'Mapper',$3,$3,'hash',id from role where key='catalog_admin'", [ids.actor, ids.company, `${ids.actor}@example.test`]);
  });
  const heads = await pool.query("select id,figure_id from diagram_mapping where figure_id = any($1::uuid[]) order by figure_id", [[ids.figure, ids.otherFigure]]);
  return { ...ids, heads: new Map(heads.rows.map(row => [row.figure_id as string, row.id as string])) };
}

function documentFor(ids: Awaited<ReturnType<typeof createWorkingFixture>>, figureId = ids.figure, drawingId = ids.drawing) {
  return {
    schemaVersion: 1,
    figureId,
    drawingFileId: drawingId,
    drawingSha256: "a".repeat(64),
    imageWidth: 640,
    imageHeight: 480,
    catalogueBindingSha256: "c".repeat(64),
    occurrences: [],
  };
}

async function insertRevision(pool: Pool, ids: Awaited<ReturnType<typeof createWorkingFixture>>, options: { headId?: string; revision?: number; document?: unknown; drawingId?: string; drawingSha256?: string; imageWidth?: number; imageHeight?: number; catalogueBindingSha256?: string; checksum?: string; actorId?: string } = {}) {
  const id = randomUUID();
  await pool.query("insert into diagram_mapping_revision(id,head_id,revision,document,drawing_file_id,drawing_sha256,image_width,image_height,catalogue_binding_sha256,document_checksum,created_by_user_id) values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)", [
    id,
    options.headId ?? ids.heads.get(ids.figure),
    options.revision ?? 1,
    options.document ?? documentFor(ids),
    options.drawingId ?? ids.drawing,
    options.drawingSha256 ?? "a".repeat(64),
    options.imageWidth ?? 640,
    options.imageHeight ?? 480,
    options.catalogueBindingSha256 ?? "c".repeat(64),
    options.checksum ?? "d".repeat(64),
    options.actorId ?? ids.actor,
  ]);
  return id;
}

describe("diagram mapping schema migration", () => {
  let postgres: TestPostgres;

  beforeAll(async () => { postgres = await startPostgres(); }, 120_000);
  afterAll(async () => { await postgres?.stop(); }, 30_000);

  it("creates all four focused tables on an empty database", async () => {
    const database = await createDatabase(postgres, "diagram_empty");
    try {
      await database.migrate();
      const result = await database.pool.query("select count(*)::int count from information_schema.tables where table_schema='public' and table_name in ('diagram_mapping','diagram_mapping_revision','diagram_mapping_approval','release_diagram_mapping')");
      expect(result.rows[0].count).toBe(4);
      expect((await database.pool.query("select count(*)::int count from diagram_mapping")).rows[0].count).toBe(0);
    } finally {
      await database.stop();
    }
  });

  it("upgrades existing figures to empty version-one heads without altering old release snapshots", async () => {
    const database = await createDatabase(postgres, "diagram_upgrade");
    try {
      await withHistoricalMigrations(7, folder => database.migrate(folder));
      const ids = await createWorkingFixtureBeforeMapping(database.pool);
      const oldRelease = (await database.pool.query("select * from publication_release where id=$1", [ids.release])).rows[0];
      const oldCallout = (await database.pool.query("select * from release_callout where release_id=$1 and id=$2", [ids.release, ids.releaseCallout])).rows[0];
      const oldHistory = (await database.pool.query("select * from drizzle.__drizzle_migrations order by id")).rows;
      expect((await database.pool.query("select count(*)::int count from information_schema.tables where table_schema='public' and table_name in ('diagram_mapping','diagram_mapping_revision','diagram_mapping_approval','release_diagram_mapping')")).rows[0].count).toBe(0);

      await database.migrate();
      await database.migrate();

      expect((await database.pool.query("select figure_id,version,current_revision_id from diagram_mapping")).rows).toEqual([{ figure_id: ids.figure, version: 1, current_revision_id: null }]);
      expect((await database.pool.query("select count(*)::int count from diagram_mapping_revision")).rows[0].count).toBe(0);
      expect((await database.pool.query("select count(*)::int count from diagram_mapping_approval")).rows[0].count).toBe(0);
      expect((await database.pool.query("select count(*)::int count from release_diagram_mapping")).rows[0].count).toBe(0);
      expect((await database.pool.query("select * from publication_release where id=$1", [ids.release])).rows[0]).toEqual(oldRelease);
      expect((await database.pool.query("select * from release_callout where release_id=$1 and id=$2", [ids.release, ids.releaseCallout])).rows[0]).toEqual(oldCallout);
      expect((await database.pool.query("select count(*)::int count from drizzle.__drizzle_migrations")).rows[0].count).toBe(10);
      expect((await database.pool.query("select * from drizzle.__drizzle_migrations order by id")).rows.slice(0, 7)).toEqual(oldHistory);
    } finally {
      await database.stop();
    }
  });

  it("rejects cross-head current revision pointers and duplicate or non-positive heads", async () => {
    const database = await createDatabase(postgres, "diagram_heads");
    try {
      await database.migrate();
      const ids = await createWorkingFixture(database.pool);
      const otherRevision = await insertRevision(database.pool, ids, { headId: ids.heads.get(ids.otherFigure), document: documentFor(ids, ids.otherFigure, ids.otherDrawing), drawingId: ids.otherDrawing });
      await expect(database.pool.query("update diagram_mapping set version=2,current_revision_id=$1 where figure_id=$2", [otherRevision, ids.figure])).rejects.toMatchObject({ code: "23503" });
      await expect(database.pool.query("insert into diagram_mapping(figure_id) values($1)", [ids.figure])).rejects.toMatchObject({ code: "23505" });
      await expect(database.pool.query("update diagram_mapping set version=0 where figure_id=$1", [ids.figure])).rejects.toMatchObject({ code: "23514" });
      await expect(database.pool.query("update diagram_mapping set version=2 where figure_id=$1", [ids.figure])).rejects.toMatchObject({ code: "23514" });
      const ownRevision = await insertRevision(database.pool, ids);
      await expect(database.pool.query("update diagram_mapping set current_revision_id=$1 where figure_id=$2", [ownRevision, ids.figure])).rejects.toMatchObject({ code: "23514" });
      await database.pool.query("update diagram_mapping set version=2,current_revision_id=$1 where figure_id=$2", [ownRevision, ids.figure]);
      expect((await database.pool.query("select version,current_revision_id from diagram_mapping where figure_id=$1", [ids.figure])).rows[0]).toEqual({ version: 2, current_revision_id: ownRevision });
    } finally {
      await database.stop();
    }
  });

  it("validates revision identity, source bindings, checksums, dimensions, actors, and JSON objects", async () => {
    const database = await createDatabase(postgres, "diagram_revision_checks");
    try {
      await database.migrate();
      const ids = await createWorkingFixture(database.pool);
      await insertRevision(database.pool, ids);
      await expect(insertRevision(database.pool, ids)).rejects.toMatchObject({ code: "23505" });
      await expect(insertRevision(database.pool, ids, { revision: 0 })).rejects.toMatchObject({ code: "23514" });
      await expect(insertRevision(database.pool, ids, { revision: 2, document: JSON.stringify([]) })).rejects.toMatchObject({ code: "23514" });
      await expect(insertRevision(database.pool, ids, { revision: 2, drawingSha256: "bad" })).rejects.toMatchObject({ code: "23514" });
      await expect(insertRevision(database.pool, ids, { revision: 2, catalogueBindingSha256: "bad" })).rejects.toMatchObject({ code: "23514" });
      await expect(insertRevision(database.pool, ids, { revision: 2, checksum: "bad" })).rejects.toMatchObject({ code: "23514" });
      await expect(insertRevision(database.pool, ids, { revision: 2, imageWidth: 0 })).rejects.toMatchObject({ code: "23514" });
      await expect(insertRevision(database.pool, ids, { revision: 2, imageHeight: 0 })).rejects.toMatchObject({ code: "23514" });
      await expect(insertRevision(database.pool, ids, { revision: 2, drawingId: randomUUID() })).rejects.toMatchObject({ code: "23503" });
      await expect(insertRevision(database.pool, ids, { revision: 2, actorId: randomUUID() })).rejects.toMatchObject({ code: "23503" });
    } finally {
      await database.stop();
    }
  });

  it("keeps revisions and their checksum-bound approvals append-only", async () => {
    const database = await createDatabase(postgres, "diagram_immutable");
    try {
      await database.migrate();
      const ids = await createWorkingFixture(database.pool);
      const revision = await insertRevision(database.pool, ids);
      await expect(database.pool.query("update diagram_mapping_revision set revision=2 where id=$1", [revision])).rejects.toMatchObject({ code: "23514" });
      await expect(database.pool.query("delete from diagram_mapping_revision where id=$1", [revision])).rejects.toMatchObject({ code: "23514" });
      await expect(database.pool.query("insert into diagram_mapping_approval(revision_id,document_checksum,reviewed_by_user_id) values($1,repeat('e',64),$2)", [revision, ids.actor])).rejects.toMatchObject({ code: "23503" });
      await database.pool.query("insert into diagram_mapping_approval(revision_id,document_checksum,reviewed_by_user_id) values($1,repeat('d',64),$2)", [revision, ids.actor]);
      await expect(database.pool.query("update diagram_mapping_approval set document_checksum=repeat('e',64) where revision_id=$1", [revision])).rejects.toMatchObject({ code: "23514" });
      await expect(database.pool.query("delete from diagram_mapping_approval where revision_id=$1", [revision])).rejects.toMatchObject({ code: "23514" });
    } finally {
      await database.stop();
    }
  });

  it("enforces same-release figure and drawing identities and seals mapping snapshots", async () => {
    const database = await createDatabase(postgres, "diagram_release");
    try {
      await database.migrate();
      const ids = await createReleaseFixture(database.pool);
      const snapshot = { ...ids.document, figureId: ids.releaseFigure, drawingFileId: ids.releaseDrawing };
      await database.pool.query("insert into release_diagram_mapping(release_id,figure_id,drawing_id,document,source_revision_id,source_document_checksum,reviewed_by_user_id,reviewed_at) values($1,$2,$3,$4,$5,repeat('d',64),$6,now())", [ids.release, ids.releaseFigure, ids.releaseDrawing, snapshot, randomUUID(), ids.actor]);
      await expect(database.pool.query("insert into release_diagram_mapping(release_id,figure_id,drawing_id,document,source_revision_id,source_document_checksum,reviewed_by_user_id,reviewed_at) values($1,$2,$3,$4,$5,repeat('d',64),$6,now())", [ids.release, ids.otherReleaseFigure, ids.releaseDrawing, snapshot, randomUUID(), ids.actor])).rejects.toMatchObject({ code: "23503" });
      await expect(database.pool.query("update release_diagram_mapping set drawing_id=$3 where release_id=$1 and figure_id=$2", [ids.release, ids.releaseFigure, ids.otherReleaseDrawing])).rejects.toMatchObject({ code: "23503" });
      await database.pool.query("update publication_release set status='active',published_at=now() where id=$1", [ids.release]);
      await expect(database.pool.query("update release_diagram_mapping set document=$3 where release_id=$1 and figure_id=$2", [ids.release, ids.releaseFigure, snapshot])).rejects.toMatchObject({ code: "23514" });
      await expect(database.pool.query("delete from release_diagram_mapping where release_id=$1 and figure_id=$2", [ids.release, ids.releaseFigure])).rejects.toMatchObject({ code: "23514" });
      await expect(database.pool.query("insert into release_diagram_mapping(release_id,figure_id,drawing_id,document,source_revision_id,source_document_checksum,reviewed_by_user_id,reviewed_at) values($1,$2,$3,$4,$5,repeat('d',64),$6,now())", [ids.release, ids.secondReleaseFigure, ids.releaseDrawing, snapshot, randomUUID(), ids.actor])).rejects.toMatchObject({ code: "23514" });
    } finally {
      await database.stop();
    }
  });

  it("revokes inherited browser-role access while retaining owner migration access", async () => {
    await postgres.pool.query("create role anon nologin; create role authenticated nologin; create role browser_public_test nologin");
    const database = await createDatabase(postgres, "diagram_privileges");
    try {
      await database.pool.query("alter default privileges in schema public grant select,insert,update,delete,truncate on tables to public, anon, authenticated");
      await database.migrate();
      const privileges = ["SELECT", "INSERT", "UPDATE", "DELETE", "TRUNCATE"];
      for (const role of ["anon", "authenticated", "browser_public_test"]) {
        for (const table of ["diagram_mapping", "diagram_mapping_revision", "diagram_mapping_approval", "release_diagram_mapping"]) {
          for (const privilege of privileges) {
            expect((await database.pool.query("select has_table_privilege($1,$2,$3) allowed", [role, `public.${table}`, privilege])).rows[0].allowed).toBe(false);
          }
        }
      }
      for (const privilege of privileges) {
        expect((await database.pool.query("select has_table_privilege(current_user,'public.diagram_mapping',$1) allowed", [privilege])).rows[0].allowed).toBe(true);
      }
    } finally {
      await database.stop();
      await postgres.pool.query("drop role browser_public_test; drop role authenticated; drop role anon");
    }
  });
});

async function createWorkingFixtureBeforeMapping(pool: Pool) {
  const ids = {
    line: randomUUID(), model: randomUUID(), variant: randomUUID(), system: randomUUID(), drawing: randomUUID(), figure: randomUUID(),
    release: randomUUID(), releaseDrawing: randomUUID(), releaseModel: randomUUID(), releaseVariant: randomUUID(), releaseSystem: randomUUID(),
    releaseFigure: randomUUID(), part: randomUUID(), figurePart: randomUUID(), callout: randomUUID(), releasePart: randomUUID(), releaseFigurePart: randomUUID(), releaseCallout: randomUUID(),
  };
  await inFixtureTransaction(pool, async q => {
    await q.query("insert into product_line(id,name,normalized_name) values($1,$2,$2)", [ids.line, `line-${ids.line}`]);
    await q.query("insert into model(id,product_line_id,name) values($1,$2,'FT3')", [ids.model, ids.line]);
    await q.query("insert into variant(id,model_id,label) values($1,$2,'Machine')", [ids.variant, ids.model]);
    await q.query("insert into system(id,name,normalized_name) values($1,$2,$2)", [ids.system, `system-${ids.system}`]);
    await q.query("insert into drawing_file(id,object_key,filename,media_type,bytes,sha256,width,height) values($1,$2,'one.png','image/png',100,repeat('a',64),640,480)", [ids.drawing, `drawing-${ids.drawing}`]);
    await q.query("insert into figure(id,variant_id,system_id,drawing_file_id,name,source_key) values($1,$2,$3,$4,'One','one')", [ids.figure, ids.variant, ids.system, ids.drawing]);
    await q.query("insert into part(id,part_number,normalized_part_number,description) values($1,$2,upper($2),'Part')", [ids.part, ids.part]);
    await q.query("insert into figure_part(id,figure_id,part_id,source_row_key,qty) values($1,$2,$3,'row',1)", [ids.figurePart, ids.figure, ids.part]);
    await q.query("insert into callout(id,figure_id,figure_part_id,source_key,number,x,y,mask_path) values($1,$2,$3,'callout','1',10,20,'M0 0L1 1')", [ids.callout, ids.figure, ids.figurePart]);
    await q.query("insert into publication_release(id,model_id,revision,source_checksum) values($1,$2,1,repeat('b',64))", [ids.release, ids.model]);
    await q.query("insert into release_drawing(release_id,id,working_id,object_key,filename,media_type,bytes,sha256,width,height) values($1,$2,$3,$4,'one.png','image/png',100,repeat('a',64),640,480)", [ids.release, ids.releaseDrawing, ids.drawing, `release-drawing-${ids.releaseDrawing}`]);
    await q.query("insert into release_model(release_id,id,working_id,product_line_id,product_line_name,name,status) values($1,$2,$3,$4,'Fat Truck','FT3','active')", [ids.release, ids.releaseModel, ids.model, ids.line]);
    await q.query("insert into release_variant(release_id,id,working_id,model_id,label) values($1,$2,$3,$4,'Machine')", [ids.release, ids.releaseVariant, ids.variant, ids.releaseModel]);
    await q.query("insert into release_system(release_id,id,working_id,model_id,name) values($1,$2,$3,$4,'System')", [ids.release, ids.releaseSystem, ids.system, ids.releaseModel]);
    await q.query("insert into release_figure(release_id,id,working_id,variant_id,system_id,drawing_id,name,source_key) values($1,$2,$3,$4,$5,$6,'One','one')", [ids.release, ids.releaseFigure, ids.figure, ids.releaseVariant, ids.releaseSystem, ids.releaseDrawing]);
    await q.query("insert into release_part(release_id,id,working_id,part_number,description,currency) values($1,$2,$3,$4,'Part','CAD')", [ids.release, ids.releasePart, ids.part, ids.part]);
    await q.query("insert into release_figure_part(release_id,id,working_id,figure_id,part_id,source_row_key,qty) values($1,$2,$3,$4,$5,'row',1)", [ids.release, ids.releaseFigurePart, ids.figurePart, ids.releaseFigure, ids.releasePart]);
    await q.query("insert into release_callout(release_id,id,working_id,figure_id,figure_part_id,source_key,number,x,y,mask_path) values($1,$2,$3,$4,$5,'callout','1',10,20,'M0 0L1 1')", [ids.release, ids.releaseCallout, ids.callout, ids.releaseFigure, ids.releaseFigurePart]);
    await q.query("update publication_release set status='active',published_at=now(),activated_at=now() where id=$1", [ids.release]);
  });
  return ids;
}

async function createReleaseFixture(pool: Pool) {
  const working = await createWorkingFixture(pool);
  const ids = {
    ...working,
    release: randomUUID(), otherRelease: randomUUID(), releaseDrawing: randomUUID(), otherReleaseDrawing: randomUUID(),
    releaseModel: randomUUID(), otherReleaseModel: randomUUID(), releaseVariant: randomUUID(), otherReleaseVariant: randomUUID(),
    releaseSystem: randomUUID(), otherReleaseSystem: randomUUID(), releaseFigure: randomUUID(), secondReleaseFigure: randomUUID(), otherReleaseFigure: randomUUID(),
    document: documentFor(working),
  };
  await inFixtureTransaction(pool, async q => {
    await q.query("insert into publication_release(id,model_id,revision,source_checksum) values($1,$3,1,repeat('1',64)),($2,$3,2,repeat('2',64))", [ids.release, ids.otherRelease, ids.model]);
    await q.query("insert into release_drawing(release_id,id,working_id,object_key,filename,media_type,bytes,sha256,width,height) values($1,$2,$3,$4,'one.png','image/png',100,repeat('a',64),640,480),($5,$6,$7,$8,'two.png','image/png',100,repeat('b',64),800,600)", [ids.release, ids.releaseDrawing, ids.drawing, `release-${ids.releaseDrawing}`, ids.otherRelease, ids.otherReleaseDrawing, ids.otherDrawing, `release-${ids.otherReleaseDrawing}`]);
    await q.query("insert into release_model(release_id,id,working_id,product_line_id,product_line_name,name,status) values($1,$2,$3,$4,'Fat Truck','FT3','active'),($5,$6,$3,$4,'Fat Truck','FT3','active')", [ids.release, ids.releaseModel, ids.model, ids.line, ids.otherRelease, ids.otherReleaseModel]);
    await q.query("insert into release_variant(release_id,id,working_id,model_id,label) values($1,$2,$3,$4,'Machine'),($5,$6,$3,$7,'Machine')", [ids.release, ids.releaseVariant, ids.variant, ids.releaseModel, ids.otherRelease, ids.otherReleaseVariant, ids.otherReleaseModel]);
    await q.query("insert into release_system(release_id,id,working_id,model_id,name) values($1,$2,$3,$4,'System'),($5,$6,$3,$7,'System')", [ids.release, ids.releaseSystem, ids.system, ids.releaseModel, ids.otherRelease, ids.otherReleaseSystem, ids.otherReleaseModel]);
    await q.query("insert into release_figure(release_id,id,working_id,variant_id,system_id,drawing_id,name,source_key) values($1,$2,$3,$4,$5,$6,'One','one'),($1,$7,$8,$4,$5,$6,'Two','two'),($9,$10,$3,$11,$12,$13,'One','one')", [ids.release, ids.releaseFigure, ids.figure, ids.releaseVariant, ids.releaseSystem, ids.releaseDrawing, ids.secondReleaseFigure, ids.otherFigure, ids.otherRelease, ids.otherReleaseFigure, ids.otherReleaseVariant, ids.otherReleaseSystem, ids.otherReleaseDrawing]);
  });
  return ids;
}
