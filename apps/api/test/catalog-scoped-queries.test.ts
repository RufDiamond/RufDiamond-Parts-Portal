import { randomUUID } from "node:crypto";
import { drizzle } from "drizzle-orm/node-postgres";
import { afterAll, beforeAll, beforeEach, expect, it } from "vitest";
import { createDatabase } from "../src/db/client.js";
import * as schema from "../src/db/schema/index.js";
import { createCatalogRepository, type CatalogQuery } from "../src/modules/catalog/repository.js";
import type { DrawingStorage } from "../src/modules/drawings/storage.js";
import { closePostgresPool, startPostgres } from "./helpers/postgres.js";

let pg: Awaited<ReturnType<typeof startPostgres>>;
let connection: ReturnType<typeof createDatabase>;
let repository: ReturnType<typeof createCatalogRepository>;
const actorId = randomUUID(); const companyId = randomUUID();
const ctx = { userId: actorId, requestId: "mixed-scope-query-test" };
const statements: Array<{ query: string; params: unknown[] }> = [];
const storage: DrawingStorage = {
  createUpload: async () => { throw new Error("Unused upload"); }, inspect: async () => { throw new Error("Unused inspect"); },
  read: async function* () { throw new Error("Unused read"); }, deleteQuarantine: async () => { throw new Error("Unused cleanup"); },
  createDownload: async (key, version) => `https://drawing.test/${key}?version=${version}`,
};
type FixtureVariant = { id: string; localId: string; figures: Array<{ id: string; localId: string; rowId: string; partId: string; localPartId: string }> };
type FixtureModel = { lineId: string; modelId: string; releaseId: string; variants: FixtureVariant[]; dependencyId: string };
let allowed: FixtureModel; let denied: FixtureModel;

async function seedModel(name: string, counts: number[]): Promise<FixtureModel> {
  const lineId = randomUUID(); const modelId = randomUUID(); const releaseId = randomUUID(); const localModelId = randomUUID(); const systemId = randomUUID();
  await pg.pool.query("insert into product_line(id,name,normalized_name) values($1,$2,lower($2))", [lineId, name]);
  await pg.pool.query("insert into model(id,product_line_id,name) values($1,$2,$3)", [modelId, lineId, `${name}_MODEL`]);
  await pg.pool.query("insert into publication_release(id,model_id,revision,source_checksum) values($1,$2,1,repeat('a',64))", [releaseId, modelId]);
  await pg.pool.query("insert into release_model(release_id,id,working_id,product_line_id,product_line_name,name,status) values($1,$2,$3,$4,$5,$6,'active')", [releaseId, localModelId, modelId, lineId, `${name}_LINE`, `${name}_MODEL`]);
  await pg.pool.query("insert into release_system(release_id,id,working_id,model_id,name) values($1,$2,$3,$4,$5)", [releaseId, systemId, randomUUID(), localModelId, `${name}_SYSTEM`]);
  const variants: FixtureVariant[] = [];
  for (const [variantIndex, figureCount] of counts.entries()) {
    const prefix = variantIndex === 0 ? name : "DENIED_VARIANT";
    const variantId = randomUUID(); const localVariantId = randomUUID();
    await pg.pool.query("insert into variant(id,model_id,label) values($1,$2,$3)", [variantId, modelId, `${prefix}_VARIANT`]);
    await pg.pool.query("insert into release_variant(release_id,id,working_id,model_id,label) values($1,$2,$3,$4,$5)", [releaseId, localVariantId, variantId, localModelId, `${prefix}_VARIANT`]);
    const variant: FixtureVariant = { id: variantId, localId: localVariantId, figures: [] };
    for (let index = 0; index < figureCount; index++) {
      const f = { id: randomUUID(), localId: randomUUID(), rowId: randomUUID(), partId: randomUUID(), localPartId: randomUUID() };
      const drawingId = randomUUID(); const calloutId = randomUUID();
      await pg.pool.query("insert into release_drawing(release_id,id,working_id,object_key,object_version_id,filename,media_type,bytes,sha256,width,height) values($1,$2,$3,$4,'pinned-version','fixture.png','image/png',100,repeat('b',64),640,480)", [releaseId, drawingId, randomUUID(), `${prefix}-drawing-${index}`]);
      await pg.pool.query("insert into release_figure(release_id,id,working_id,variant_id,system_id,drawing_id,name,group_no,source_key,sort_order) values($1,$2,$3,$4,$5,$6,$7,$8,$8,$9)", [releaseId, f.localId, f.id, localVariantId, systemId, drawingId, `${prefix}_FIGURE_${index}`, String(index + 1), index]);
      await pg.pool.query("insert into release_part(release_id,id,working_id,part_number,description,list_price,currency) values($1,$2,$3,$4,$4,77.77,'CAD')", [releaseId, f.localPartId, f.partId, `${prefix}_PART_${index}`]);
      await pg.pool.query("insert into release_figure_part(release_id,id,working_id,figure_id,part_id,source_row_key,qty) values($1,$2,$3,$4,$5,'row',1)", [releaseId, f.rowId, randomUUID(), f.localId, f.localPartId]);
      await pg.pool.query("insert into release_callout(release_id,id,working_id,figure_id,figure_part_id,source_key,number,x,y) values($1,$2,$3,$4,$5,'callout','1',10,20)", [releaseId, calloutId, randomUUID(), f.localId, f.rowId]);
      const document = { schemaVersion: 1, figureId: f.localId, drawingFileId: drawingId, drawingSha256: "b".repeat(64), imageWidth: 640, imageHeight: 480, catalogueBindingSha256: "c".repeat(64), occurrences: [{ calloutId, figurePartId: f.rowId, refNo: "1", labelRegion: { x: 10, y: 10, width: 20, height: 20 }, regions: [{ id: "component", outer: [[40, 40], [80, 40], [80, 80], [40, 80]], holes: [] }], evidence: "Synthetic source-reviewed geometry" }] };
      await pg.pool.query("insert into release_diagram_mapping(release_id,figure_id,drawing_id,document,source_revision_id,source_document_checksum,reviewed_by_user_id,reviewed_at) values($1,$2,$3,$4,$5,repeat('c',64),$6,now())", [releaseId, f.localId, drawingId, document, randomUUID(), actorId]);
      variant.figures.push(f);
    }
    variants.push(variant);
  }
  const dependencyId = randomUUID(); const localDependency = randomUUID();
  await pg.pool.query("insert into release_part(release_id,id,working_id,part_number,description,list_price,currency) values($1,$2,$3,$4,$4,88.88,'CAD')", [releaseId, localDependency, dependencyId, `${name}_DEPENDENCY`]);
  await pg.pool.query("insert into release_part_requires(release_id,part_id,required_part_id,qty) values($1,$2,$3,2)", [releaseId, variants[0].figures[0].localPartId, localDependency]);
  // A supersession edge returning to a reachable part exercises finite UNION
  // traversal across mixed requirement/supersession relationships.
  await pg.pool.query("update release_part set superseded_by_part_id=$1,status='superseded' where release_id=$2 and id=$3", [variants[0].figures[0].localPartId, releaseId, localDependency]);
  if (variants[1]) {
    const hiddenDependency = randomUUID();
    await pg.pool.query("insert into release_part(release_id,id,working_id,part_number,description,list_price,currency) values($1,$2,$3,'DENIED_VARIANT_DEPENDENCY','DENIED_VARIANT_DEPENDENCY',999.99,'CAD')", [releaseId, hiddenDependency, randomUUID()]);
    await pg.pool.query("insert into release_part_requires(release_id,part_id,required_part_id,qty) values($1,$2,$3,1)", [releaseId, variants[1].figures[0].localPartId, hiddenDependency]);
  }
  await pg.pool.query("update publication_release set status='active',published_at=now() where id=$1", [releaseId]);
  return { lineId, modelId, releaseId, variants, dependencyId };
}

beforeAll(async () => {
  pg = await startPostgres(); await pg.migrate(); connection = createDatabase(pg.connectionString);
  await pg.pool.query("insert into company(id,name,type,technician_pricing_visible) values($1,'Mixed scope reader','internal',false)", [companyId]);
  await pg.pool.query("insert into app_user(id,company_id,name,login_id,email,password_hash,role_id) select $1,$2,'Mixed reader','mixed@test.example','mixed@test.example','unused-password',id from role where key='catalog_admin'", [actorId, companyId]);
  await pg.pool.query("insert into user_scope(user_id,brand_mode,account_mode,fleet_mode,environment) values($1,'subset','all','subset','published')", [actorId]);
  await pg.pool.query("insert into user_capability(user_id,capability_key) select $1,key from capability where key in ('catalog.model.view','catalog.figure.view','parts.record.view','orders.list.build','pricing.cost.view') on conflict do nothing", [actorId]);
  await pg.pool.query("delete from role_capability where role_id=(select role_id from app_user where id=$1) and capability_key='orders.submit'", [actorId]);
  allowed = await seedModel("ALLOWED", [3, 1]); denied = await seedModel("DENIED_BRAND", [1]);
  await pg.pool.query("insert into user_product_line_scope(user_id,product_line_id) values($1,$2)", [actorId, allowed.lineId]);
  // The denied brand's fleet ID is granted deliberately: brand policy must
  // exclude it independently of the mixed fleet within the allowed release.
  await pg.pool.query("insert into user_fleet_scope(user_id,variant_id) values($1,$2),($1,$3)", [actorId, allowed.variants[0].id, denied.variants[0].id]);
  const logged = drizzle(connection.pool, { schema, logger: { logQuery(query, params) { statements.push({ query, params }); } } });
  repository = createCatalogRepository(logged, storage);
}, 120000);
beforeEach(() => { statements.length = 0; });
afterAll(async () => { if (connection) await closePostgresPool(connection.pool); await pg?.stop(); }, 30000);

async function pages(query: CatalogQuery) {
  const items: unknown[] = []; const releases: string[] = []; let cursor: string | undefined;
  for (let pageIndex = 0; pageIndex < 10; pageIndex++) {
    const page = await repository.list(ctx, { ...query, cursor, limit: 1 });
    expect(page.items.length).toBeLessThanOrEqual(1); items.push(...page.items); releases.push(...page.releases.map(r => r.releaseId));
    if (!page.nextCursor) return { items, releases };
    cursor = page.nextCursor;
  }
  throw new Error("Pagination did not terminate");
}

it("keeps allowed navigation, figure and dependency results while excluding denied fleet and brands on every page", async () => {
  expect((await pages({ kind: "models" })).items).toMatchObject([{ id: allowed.modelId, name: "ALLOWED_MODEL" }]);
  expect((await pages({ kind: "product-lines" })).items).toMatchObject([{ id: allowed.lineId }]);
  expect((await pages({ kind: "variants", id: allowed.modelId })).items).toMatchObject([{ id: allowed.variants[0].id }]);
  const systems = await pages({ kind: "systems", id: allowed.variants[0].id });
  const systemId = (systems.items[0] as { id: string }).id;
  const figures = await pages({ kind: "figures", id: allowed.variants[0].id, systemId });
  expect(figures.items).toHaveLength(3); expect(JSON.stringify(figures)).not.toContain("DENIED");
  const search = await pages({ kind: "search", q: "ALLOWED" });
  expect(search.items).toHaveLength(4); expect(new Set(search.releases)).toEqual(new Set([allowed.releaseId]));
  expect(search.items).toEqual(expect.arrayContaining([expect.objectContaining({ id: allowed.dependencyId })]));
  expect(search.items).toEqual(expect.arrayContaining([expect.objectContaining({ id: allowed.dependencyId, supersededByPartId: allowed.variants[0].figures[0].partId })]));
  const usages = await pages({ kind: "usages", q: "ALLOWED" }); expect(usages.items).toHaveLength(4);
  const index = await pages({ kind: "usage-index" }); expect(index.items).toHaveLength(3);
  for (const data of [search, usages, index]) expect(JSON.stringify(data)).not.toMatch(/DENIED|listPrice|77\.77|88\.88|999\.99/);
  expect((await pages({ kind: "search", q: "DENIED" })).items).toEqual([]);
  expect((await pages({ kind: "usages", q: "DENIED" })).items).toEqual([]);
  for (const model of [denied.modelId]) await expect(repository.list(ctx, { kind: "variants", id: model })).rejects.toMatchObject({ status: 404 });
  for (const v of [allowed.variants[1], denied.variants[0]]) {
    await expect(repository.list(ctx, { kind: "systems", id: v.id })).rejects.toMatchObject({ status: 404 });
    await expect(repository.readPublishedFigure(ctx, v.figures[0].id)).rejects.toMatchObject({ status: 404 });
    await expect(repository.list(ctx, { kind: "part-usages", id: v.figures[0].partId })).rejects.toMatchObject({ status: 404 });
  }
});

async function replayCatalogQueries(captured: typeof statements) {
  const results = [];
  for (const statement of captured.filter(s => /\b(?:release_|publication_release)/.test(s.query))) {
    // Replay the actual parameterized SELECT against the real fixture. This
    // measures rows returned by PostgreSQL, not a mocked driver's call count.
    const result = await pg.pool.query(statement.query, statement.params);
    results.push({ ...statement, rows: result.rows });
  }
  return results;
}
it.each(["search", "usages", "usage-index"] as const)("%s limit=1 retrieves at most two candidate rows from PostgreSQL and no geometry", async kind => {
  const page = await repository.list(ctx, { kind, q: "ALLOWED", limit: 1 }); expect(page.items).toHaveLength(1); expect(page.nextCursor).not.toBeNull();
  const executed = await replayCatalogQueries(statements.splice(0));
  expect(executed.every(q => q.rows.length <= 2)).toBe(true);
  expect(executed.filter(q => q.query.includes("release_diagram_mapping"))).toHaveLength(0);
});
it("navigation and unknown figures do not transfer unrelated geometry, rows or callouts", async () => {
  await repository.list(ctx, { kind: "models", limit: 1 });
  await expect(repository.readPublishedFigure(ctx, randomUUID())).rejects.toMatchObject({ status: 404 });
  const executed = await replayCatalogQueries(statements.splice(0));
  expect(executed.filter(q => /release_diagram_mapping|release_figure_part|release_callout/.test(q.query))).toHaveLength(0);
});
it("figure detail selects geometry and rows only for the requested same-release figure", async () => {
  const target = allowed.variants[0].figures[1]; const detail = await repository.readPublishedFigure(ctx, target.id);
  expect(detail.figure.id).toBe(target.id); expect(detail.mapping?.document.figureId).toBe(target.id);
  const executed = await replayCatalogQueries(statements.splice(0));
  const geometry = executed.filter(q => q.query.includes("release_diagram_mapping")); expect(geometry).toHaveLength(1);
  expect(geometry[0].rows).toHaveLength(1); expect(geometry[0].rows[0].figure_id).toBe(target.localId);
  for (const query of executed.filter(q => /release_figure_part|release_callout/.test(q.query))) expect(query.rows).toHaveLength(1);
});
it("drawing delivery performs identity-only queries before and after signing", async () => {
  const target = allowed.variants[0].figures[0];
  expect(await repository.drawing(ctx, target.id, allowed.releaseId)).toBe("https://drawing.test/ALLOWED-drawing-0?version=pinned-version");
  const executed = await replayCatalogQueries(statements.splice(0));
  expect(executed.filter(q => /release_diagram_mapping|release_figure_part|release_callout|release_part/.test(q.query))).toHaveLength(0);
  expect(executed.every(q => q.rows.length <= 1)).toBe(true);
});

it("paginates figure summaries inside PostgreSQL without loading drawing bytes or geometry", async () => {
  const systems = await repository.list(ctx, { kind: "systems", id: allowed.variants[0].id });
  const systemId = (systems.items[0] as { id: string }).id; statements.length = 0;
  const page = await repository.list(ctx, { kind: "figures", id: allowed.variants[0].id, systemId, limit: 1 });
  expect(page.items).toHaveLength(1); expect(page.nextCursor).not.toBeNull();
  const executed = await replayCatalogQueries(statements.splice(0));
  expect(executed.every(q => q.rows.length <= 2)).toBe(true);
  expect(executed.filter(q => /release_diagram_mapping|release_figure_part|release_callout/.test(q.query))).toHaveLength(0);
});

it("invalidates mixed-scope pages when current fleet authority changes", async () => {
  const first = await repository.list(ctx, { kind: "search", q: "ALLOWED", limit: 1 }); expect(first.nextCursor).not.toBeNull();
  await pg.pool.query("update user_scope set fleet_mode='all' where user_id=$1", [actorId]);
  try {
    await expect(repository.list(ctx, { kind: "search", q: "ALLOWED", limit: 1, cursor: first.nextCursor! })).rejects.toMatchObject({ status: 409, code: "CATALOG_CURSOR_STALE" });
    const newlyAllowed = await repository.list(ctx, { kind: "search", q: "DENIED_VARIANT" }); expect(newlyAllowed.items).toHaveLength(2);
    expect((await repository.list(ctx, { kind: "search", q: "DENIED_BRAND" })).items).toEqual([]);
  } finally { await pg.pool.query("update user_scope set fleet_mode='subset' where user_id=$1", [actorId]); }
});
