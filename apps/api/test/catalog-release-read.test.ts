import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, expect, it } from "vitest";
import { createDatabase } from "../src/db/client.js";
import { createCatalogRepository } from "../src/modules/catalog/repository.js";
import type { DrawingStorage } from "../src/modules/drawings/storage.js";
import { closePostgresPool, startPostgres } from "./helpers/postgres.js";

let pg: Awaited<ReturnType<typeof startPostgres>>;
let connection: ReturnType<typeof createDatabase>;
const id = Object.fromEntries(["line", "model", "variant", "system", "drawing", "figure", "part", "row", "company", "actor", "release", "rm", "rv", "rs", "rd", "rf", "rp", "rr", "callout"].map(k => [k, randomUUID()]));
const ctx = { userId: id.actor, requestId: "legacy-read-fixture" };
const unavailableStorage: DrawingStorage = {
  createUpload: async () => { throw new Error("not used"); }, inspect: async () => { throw new Error("not used"); },
  read: async function* () { throw new Error("not used"); }, deleteQuarantine: async () => { throw new Error("not used"); },
  createDownload: async (key, version) => `https://private.example.test/${encodeURIComponent(key)}?version=${version}`,
};
beforeAll(async () => {
  pg = await startPostgres(); await pg.migrate(); connection = createDatabase(pg.connectionString);
  await pg.pool.query("insert into product_line(id,name,normalized_name) values($1,'Working line','working line')", [id.line]);
  await pg.pool.query("insert into model(id,product_line_id,name) values($1,$2,'Working model')", [id.model, id.line]);
  await pg.pool.query("insert into variant(id,model_id,label) values($1,$2,'Working variant')", [id.variant, id.model]);
  await pg.pool.query("insert into company(id,name,type) values($1,'Reader','internal')", [id.company]);
  await pg.pool.query("insert into app_user(id,company_id,name,login_id,email,password_hash,role_id) select $1,$2,'Reader','reader@test.example','reader@test.example','test-no-login',id from role where key='catalog_admin'", [id.actor, id.company]);
  await pg.pool.query("insert into user_scope(user_id,brand_mode,account_mode,fleet_mode,environment) values($1,'all','all','all','published')", [id.actor]);
  await pg.pool.query("insert into user_capability(user_id,capability_key) values($1,'catalog.figure.view') on conflict do nothing", [id.actor]);
  await pg.pool.query("insert into publication_release(id,model_id,revision,source_checksum) values($1,$2,1,repeat('b',64))", [id.release, id.model]);
  await pg.pool.query("insert into release_model(release_id,id,working_id,product_line_id,product_line_name,name,status) values($1,$2,$3,$4,'Historical line','Historical model','active')", [id.release, id.rm, id.model, id.line]);
  await pg.pool.query("insert into release_variant(release_id,id,working_id,model_id,label) values($1,$2,$3,$4,'Historical variant')", [id.release, id.rv, id.variant, id.rm]);
  await pg.pool.query("insert into release_system(release_id,id,working_id,model_id,name) values($1,$2,$3,$4,'Historical system')", [id.release, id.rs, id.system, id.rm]);
  await pg.pool.query("insert into release_drawing(release_id,id,working_id,object_key,filename,media_type,bytes,sha256,width,height,object_version_id) values($1,$2,$3,'legacy-private','historical.png','image/png',100,repeat('a',64),640,480,null)", [id.release, id.rd, id.drawing]);
  await pg.pool.query("insert into release_figure(release_id,id,working_id,variant_id,system_id,drawing_id,name,source_key) values($1,$2,$3,$4,$5,$6,'Historical figure','one')", [id.release, id.rf, id.figure, id.rv, id.rs, id.rd]);
  await pg.pool.query("insert into release_part(release_id,id,working_id,part_number,description,list_price,currency) values($1,$2,$3,'OLD1','Historical part',25,'CAD')", [id.release, id.rp, id.part]);
  await pg.pool.query("insert into release_figure_part(release_id,id,working_id,figure_id,part_id,source_row_key,qty) values($1,$2,$3,$4,$5,'one',1)", [id.release, id.rr, id.row, id.rf, id.rp]);
  await pg.pool.query("insert into release_callout(release_id,id,working_id,figure_id,figure_part_id,source_key,number,x,y,mask_path) values($1,$2,$3,$4,$5,'one','A',20,30,'M 1 1 L 2 2')", [id.release, randomUUID(), id.callout, id.rf, id.rr]);
  await pg.pool.query("update publication_release set status='active',published_at=now() where id=$1", [id.release]);
}, 120000);
afterAll(async () => { if (connection) await closePostgresPool(connection.pool); await pg?.stop(); }, 30000);

async function pinnedClone() {
  const releaseId = randomUUID();
  await pg.pool.query("insert into publication_release(id,model_id,revision,source_checksum) values($1,$2,(select max(revision)+1 from publication_release where model_id=$2),repeat('c',64))", [releaseId, id.model]);
  for (const table of ["release_model", "release_variant", "release_system", "release_drawing", "release_figure", "release_part", "release_figure_part", "release_callout"]) {
    const columns = (await pg.pool.query("select column_name from information_schema.columns where table_schema='public' and table_name=$1 order by ordinal_position", [table])).rows.map(r => r.column_name as string);
    const select = columns.map(c => c === "release_id" ? "$1" : `"${c}"`).join(",");
    await pg.pool.query(`insert into ${table} (${columns.map(c => `"${c}"`).join(",")}) select ${select} from ${table} where release_id=$2`, [releaseId, id.release]);
  }
  await pg.pool.query("update release_drawing set object_version_id='verified-original-version' where release_id=$1", [releaseId]);
  await pg.pool.query("update publication_release set status='inactive' where model_id=$1 and status='active'", [id.model]);
  await pg.pool.query("update publication_release set status='active',published_at=now() where id=$1", [releaseId]);
  return releaseId;
}

it("reads a legacy release without numeric geometry using only snapshot identities and legacy masks", async () => {
  const repository = createCatalogRepository(connection.db, unavailableStorage);
  const detail = await repository.readPublishedFigure(ctx, id.figure);
  expect(detail.mapping).toBeNull();
  expect(detail.figure.name).toBe("Historical figure"); expect(detail.variant.label).toBe("Historical variant");
  expect(detail.callouts[0]).toMatchObject({ figureId: id.figure, figurePartId: id.row, number: "A", x: 20, y: 30, maskPath: "M 1 1 L 2 2" });
  expect(detail.rows[0].part.releasePartId).toBe(id.rp);
  const models = await repository.list(ctx, { kind: "models" }); expect(models.items[0]).toMatchObject({ name: "Historical model" });
});
it("keeps missing historical object version distinct from missing geometry and fails delivery safely", async () => {
  const repository = createCatalogRepository(connection.db, unavailableStorage);
  expect((await repository.readPublishedFigure(ctx, id.figure)).mapping).toBeNull();
  await expect(repository.drawing(ctx, id.figure, id.release)).rejects.toMatchObject({ status: 503, code: "DRAWING_VERSION_UNAVAILABLE" });
  await expect(repository.drawing(ctx, id.figure, randomUUID())).rejects.toMatchObject({ status: 404 });
});

it("pins legacy drawing delivery and distinguishes a retired release from an unknown or denied figure", async () => {
  const releaseId = await pinnedClone(); const repository = createCatalogRepository(connection.db, unavailableStorage);
  expect(await repository.drawing(ctx, id.figure, releaseId)).toBe("https://private.example.test/legacy-private?version=verified-original-version");
  expect((await repository.readPublishedFigure(ctx, id.figure)).mapping).toBeNull();
  await expect(repository.drawing(ctx, id.figure, id.release)).rejects.toMatchObject({ status: 409, code: "RELEASE_CHANGED" });
  await expect(repository.drawing(ctx, randomUUID(), id.release)).rejects.toMatchObject({ status: 404 });
});

it("rechecks authorization after external URL signing completes", async () => {
  const releaseId = await pinnedClone();
  const storage = { ...unavailableStorage, createDownload: async () => {
    await pg.pool.query("update user_scope set fleet_mode='subset' where user_id=$1", [id.actor]);
    return "https://private.example.test/should-not-be-delivered";
  } };
  try { await expect(createCatalogRepository(connection.db, storage).drawing(ctx, id.figure, releaseId)).rejects.toMatchObject({ status: 404 }); }
  finally { await pg.pool.query("update user_scope set fleet_mode='all' where user_id=$1", [id.actor]); }
});
