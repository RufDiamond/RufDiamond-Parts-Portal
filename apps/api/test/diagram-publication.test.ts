import { createHash, randomBytes, randomUUID } from "node:crypto";
import argon2 from "argon2";
import { afterAll, afterEach, beforeAll, beforeEach, expect, it } from "vitest";
import { buildApp } from "../src/app.js";
import { createDatabase } from "../src/db/client.js";
import { closePostgresPool, startPostgres } from "./helpers/postgres.js";

const origin = "https://portal.example.test";
const passwordOptions = { type: argon2.argon2id, memoryCost: 2048, timeCost: 2, parallelism: 1 } as const;
let pg: Awaited<ReturnType<typeof startPostgres>>;
let connection: ReturnType<typeof createDatabase>;
let app: Awaited<ReturnType<typeof buildApp>>;
let ids: Record<string, string>;
let headers: Record<string, string>;
let onContentRead: (() => Promise<void>) | undefined;
const contentBytes = Buffer.from([137,80,78,71,13,10,26,10]);
const publish = (version = 1, key = randomUUID()) => app.inject({ method: "POST", url: "/api/v1/admin/publication/releases", headers: { ...headers, "idempotency-key": key }, payload: { modelId: ids.model, expectedWorkingVersion: 1, expectedPublicationVersion: version, summary: "Synthetic reviewed release" } });
const get = (path: string) => app.inject({ method: "GET", url: `/api/v1${path}`, headers });
async function approve() {
  const path = `/api/v1/admin/figures/${ids.figure}/diagram-mapping`;
  const current = (await app.inject({ method: "GET", url: path, headers })).json();
  const document = current.document;
  document.catalogueBindingSha256 = current.source.catalogueBindingSha256;
  for (const [index, occurrence] of document.occurrences.entries()) {
    occurrence.labelRegion = { x: 10 + index * 30, y: 10, width: 20, height: 20 };
    occurrence.regions = [{ id: `physical-${index}`, outer: [[40, 40], [80, 40], [80, 80], [40, 80]], holes: [] }];
    occurrence.evidence = "Synthetic fixture physical region independently reviewed.";
  }
  const saved = await app.inject({ method: "PUT", url: path, headers: { ...headers, "if-match": `"${current.version}"`, "idempotency-key": randomUUID() }, payload: { document } });
  expect(saved.statusCode, saved.body).toBe(200);
  const revision = saved.json();
  const approved = await app.inject({ method: "POST", url: `${path}/approve`, headers: { ...headers, "if-match": `"${revision.version}"`, "idempotency-key": randomUUID() }, payload: { revisionId: revision.revisionId, checksum: revision.checksum } });
  expect(approved.statusCode, approved.body).toBe(200);
}
beforeAll(async () => { pg = await startPostgres(); await pg.migrate(); connection = createDatabase(pg.connectionString); }, 120000);
beforeEach(async () => {
  onContentRead = undefined;
  await pg.pool.query("truncate company,product_line,system,part,drawing_file,audit_log,outbox_event cascade");
  ids = Object.fromEntries(["line", "model", "variant", "system", "drawing", "figure", "part", "row", "callout", "second", "company", "actor"].map(k => [k, randomUUID()]));
  await pg.pool.query("insert into product_line(id,name,normalized_name) values($1,'Synthetic','synthetic')", [ids.line]);
  await pg.pool.query("insert into model(id,product_line_id,name) values($1,$2,'Synthetic model')", [ids.model, ids.line]);
  await pg.pool.query("insert into variant(id,model_id,label) values($1,$2,'Synthetic variant')", [ids.variant, ids.model]);
  await pg.pool.query("insert into system(id,name,normalized_name) values($1,'Synthetic system','synthetic system')", [ids.system]);
  await pg.pool.query("insert into model_system(model_id,system_id) values($1,$2)", [ids.model, ids.system]);
  await pg.pool.query("insert into drawing_file(id,object_key,filename,media_type,bytes,sha256,width,height,validation_status,object_version_id) values($1,'private-synthetic','fixture.png','image/png',$2,$3,640,480,'valid','pinned-v1')", [ids.drawing, contentBytes.length, createHash("sha256").update(contentBytes).digest("hex")]);
  await pg.pool.query("insert into figure(id,variant_id,system_id,drawing_file_id,name,source_key) values($1,$2,$3,$4,'Synthetic figure','figure-1')", [ids.figure, ids.variant, ids.system, ids.drawing]);
  await pg.pool.query("insert into diagram_mapping(figure_id) values($1)", [ids.figure]);
  await pg.pool.query("insert into part(id,part_number,normalized_part_number,description,list_price) values($1,'SYN1','SYN1','Synthetic part',99.99)", [ids.part]);
  await pg.pool.query("insert into figure_part(id,figure_id,part_id,source_row_key,qty) values($1,$2,$3,'row-1',2)", [ids.row, ids.figure, ids.part]);
  await pg.pool.query("insert into callout(id,figure_id,figure_part_id,source_key,number) values($1,$2,$3,'one','7'),($4,$2,$3,'two','7')", [ids.callout, ids.figure, ids.row, ids.second]);
  await pg.pool.query("insert into company(id,name,type) values($1,'Synthetic publisher','internal')", [ids.company]);
  await pg.pool.query("insert into app_user(id,company_id,name,login_id,email,password_hash,role_id) select $1,$2,'Named publisher','publisher@test.example','publisher@test.example',$3,id from role where key='catalog_admin'", [ids.actor, ids.company, await argon2.hash("test password", passwordOptions)]);
  await pg.pool.query("insert into user_capability(user_id,capability_key) select $1,key from capability where key in ('publish.execute','publish.rollback','publish.draft.view','catalog.model.view','catalog.figure.view','parts.record.view','catalog.callout.manage','catalog.callout.map') on conflict do nothing", [ids.actor]);
  await pg.pool.query("insert into user_scope(user_id,brand_mode,account_mode,fleet_mode,environment) values($1,'all','all','all','published_and_draft')", [ids.actor]);
  app = await buildApp({ config: { nodeEnv: "test", port: 0, databaseUrl: pg.connectionString, sessionSecret: "publication-test-session-secret-long-enough", webOrigin: origin, allowInsecureLoopbackCookie: false, deliveryEncryption: { activeKeyId: "test", keys: { test: randomBytes(32).toString("base64") } }, s3: { endpoint: "http://localhost:9000", region: "test", bucket: "test", accessKeyId: "test", secretAccessKey: "test" } }, dependencies: { database: connection, passwordOptions, drawingStorage: {
    async createUpload() { throw new Error("not configured"); }, async inspect() { throw new Error("not configured"); }, async createDownload() { throw new Error("not configured"); }, async deleteQuarantine() { throw new Error("not configured"); },
    async *read(key, version) { expect(key).toBe("private-synthetic"); expect(version).toBe("pinned-v1"); yield contentBytes; await onContentRead?.(); },
  } } });
  const login = await app.inject({ method: "POST", url: "/api/v1/auth/sign-in", headers: { origin }, payload: { loginId: "publisher@test.example", password: "test password" } });
  expect(login.statusCode).toBe(200);
  headers = { origin, cookie: String(login.headers["set-cookie"]).split(";")[0], "x-csrf-token": login.json().csrfToken };
});
afterEach(async () => { await app?.close(); });
afterAll(async () => { if (connection) await closePostgresPool(connection.pool); await pg?.stop(); }, 30000);

it("serves pinned snapshot bytes and rechecks current scope after storage I/O", async () => {
  await approve(); const release = (await publish()).json();
  const url = `/api/v1/catalog/figures/${ids.figure}/drawing?releaseId=${release.releaseId}`;
  const read = () => app.inject({ method: "GET", url, headers: { ...headers, accept: "image/png" } });
  const result = await read(); expect(result.statusCode).toBe(200); expect(result.rawPayload).toEqual(contentBytes);
  onContentRead = async () => { await pg.pool.query("update user_scope set fleet_mode='subset' where user_id=$1", [ids.actor]); };
  expect((await read()).statusCode).toBe(404);
});

it("publishes a complete synthetic model and keeps customer geometry immutable after draft edits", async () => {
  await approve(); const result = await publish(); expect(result.statusCode, result.body).toBe(201);
  const before = await get(`/catalog/figures/${ids.figure}`); expect(before.statusCode, before.body).toBe(200);
  expect(before.json().callouts).toHaveLength(2);
  expect(before.json().mapping.document.figureId).toBe(ids.figure);
  expect(before.json().rows[0].part.releasePartId).not.toBe(ids.part);
  const stored = (await pg.pool.query("select document from release_diagram_mapping")).rows[0].document;
  expect(stored.figureId).not.toBe(ids.figure);
  expect(stored.occurrences[0].figurePartId).not.toBe(ids.row);
  await pg.pool.query("update part set description='Unpublished secret',list_price=123.45,version=version+1 where id=$1", [ids.part]);
  await approve();
  expect((await get(`/catalog/figures/${ids.figure}`)).json()).toEqual(before.json());
});
it("rejects incomplete publication and rolls back all activation effects", async () => {
  const result = await publish(); expect(result.statusCode, result.body).toBe(422);
  expect(result.json().issues.some((i: { code: string }) => i.code === "MAPPING_APPROVAL_REQUIRED")).toBe(true);
  expect((await pg.pool.query("select count(*)::int n from publication_release")).rows[0].n).toBe(0);
});
it("consumes the publication coordination version once and replays exact successful publication", async () => {
  await approve(); const key = randomUUID(); const first = await publish(1, key); expect(first.statusCode, first.body).toBe(201);
  expect((await publish(1, key)).json()).toEqual(first.json());
  expect((await publish()).statusCode).toBe(409);
});
it("serializes two same-version publishers into one success and one conflict", async () => {
  await approve(); const results = await Promise.all([publish(), publish()]); expect(results.map(r => r.statusCode).sort()).toEqual([201, 409]);
});
it("serves navigation and usage only from active permitted snapshots", async () => {
  await approve(); expect((await publish()).statusCode).toBe(201);
  for (const path of ["/catalog/product-lines", "/catalog/models", `/catalog/models/${ids.model}/variants`, `/catalog/variants/${ids.variant}/systems`, `/catalog/variants/${ids.variant}/systems/${ids.system}/figures`, "/catalog/parts/search?q=SYN", "/catalog/parts/usages?q=SYN", `/catalog/parts/${ids.part}/usages`]) {
    const result = await get(path); expect(result.statusCode, `${path}: ${result.body}`).toBe(200); expect(result.json().items).toHaveLength(1);
  }
  await pg.pool.query("update user_scope set fleet_mode='subset' where user_id=$1", [ids.actor]);
  for (const path of ["/catalog/product-lines", "/catalog/models", "/catalog/parts/search?q=SYN", "/catalog/parts/usages?q=SYN"]) expect((await get(path)).json().items).toEqual([]);
  expect((await get(`/catalog/figures/${ids.figure}`)).statusCode).toBe(404);
});

it("publishes subsequent approved geometry without staling source approvals and rolls back immutable content", async () => {
  await approve(); const first = (await publish()).json();
  const path = `/api/v1/admin/figures/${ids.figure}/diagram-mapping`;
  const current = (await app.inject({ method: "GET", url: path, headers })).json();
  expect(current.sourceConflict).toBe(false); expect(current.revision.approval).not.toBeNull();
  current.document.occurrences[0].labelRegion.x = 100;
  const saved = (await app.inject({ method: "PUT", url: path, headers: { ...headers, "if-match": `"${current.version}"`, "idempotency-key": randomUUID() }, payload: { document: current.document } })).json();
  expect((await app.inject({ method: "POST", url: `${path}/approve`, headers: { ...headers, "if-match": `"${saved.version}"`, "idempotency-key": randomUUID() }, payload: { revisionId: saved.revisionId, checksum: saved.checksum } })).statusCode).toBe(200);
  const second = await publish(2); expect(second.statusCode, second.body).toBe(201);
  const rollback = await app.inject({ method: "POST", url: `/api/v1/admin/publication/releases/${first.releaseId}/rollback`, headers: { ...headers, "idempotency-key": randomUUID() }, payload: { expectedPublicationVersion: 3, expectedActiveReleaseId: second.json().releaseId } });
  expect(rollback.statusCode, rollback.body).toBe(200);
  expect((await get(`/catalog/figures/${ids.figure}`)).json().release.releaseId).toBe(first.releaseId);
  expect((await pg.pool.query("select version,publication_version from model where id=$1", [ids.model])).rows[0]).toEqual({ version: 1, publication_version: 4 });
  await expect(pg.pool.query("update release_diagram_mapping set document='{}'::jsonb where release_id=$1", [first.releaseId])).rejects.toThrow(/immutable/);
});
it.each(["disabled-system", "price", "relationship", "orphan-row", "stale-source"])("derives complete non-geometry blockers for %s", async reason => {
  await approve();
  if (reason === "disabled-system") await pg.pool.query("update model_system set enabled=false where model_id=$1", [ids.model]);
  if (reason === "price") await pg.pool.query("update part set list_price=null where id=$1", [ids.part]);
  if (reason === "relationship") {
    const target = randomUUID(); await pg.pool.query("insert into part(id,part_number,normalized_part_number,description,list_price) values($1,'TARGET','TARGET','Required',2)", [target]);
    await pg.pool.query("insert into part_requires(part_id,required_part_id,qty) values($1,$2,1)", [ids.part, target]);
  }
  if (reason === "orphan-row") await pg.pool.query("insert into figure_part(figure_id,part_id,source_row_key,qty) values($1,$2,'unreviewed-row',1)", [ids.figure, ids.part]);
  if (reason === "stale-source") await pg.pool.query("update figure set version=version+1 where id=$1", [ids.figure]);
  const response = await publish(); expect(response.statusCode, response.body).toBe(422);
  expect((await pg.pool.query("select count(*)::int n from publication_release")).rows[0].n).toBe(0);
});
it("denies a partial model publisher and queue without disclosing unauthorized names or counts", async () => {
  await approve(); const denied = randomUUID();
  await pg.pool.query("insert into variant(id,model_id,label) values($1,$2,'PRIVATE VARIANT')", [denied, ids.model]);
  await pg.pool.query("update user_scope set fleet_mode='subset' where user_id=$1", [ids.actor]);
  await pg.pool.query("insert into user_fleet_scope(user_id,variant_id) values($1,$2)", [ids.actor, ids.variant]);
  const response = await publish(); expect(response.statusCode).toBe(404); expect(response.body).not.toContain("PRIVATE");
  expect((await get("/admin/publication/queue")).json().items).toEqual([]);
});
it("rolls publication back when the transactional outbox write fails", async () => {
  await approve();
  const first = await publish(); expect(first.statusCode).toBe(201);
  await pg.pool.query("create function reject_publication_event() returns trigger language plpgsql as $$ begin if NEW.event_type='publication.published' then raise exception 'fixture outbox failure'; end if; return NEW; end $$; create trigger reject_publication_event before insert on outbox_event for each row execute function reject_publication_event()");
  try {
    expect((await publish(2)).statusCode).toBe(500);
    expect((await pg.pool.query("select id,status from publication_release")).rows).toEqual([{ id: first.json().releaseId, status: "active" }]);
    expect((await pg.pool.query("select publication_version from model where id=$1", [ids.model])).rows[0].publication_version).toBe(2);
  } finally { await pg.pool.query("drop trigger reject_publication_event on outbox_event; drop function reject_publication_event()"); }
});

it("rechecks current capability before replay and protects publication writes with CSRF", async () => {
  await approve(); const key = randomUUID(); expect((await publish(1, key)).statusCode).toBe(201);
  const response = await app.inject({ method: "POST", url: "/api/v1/admin/publication/releases", headers: { ...headers, "x-csrf-token": "wrong", "idempotency-key": key }, payload: { modelId: ids.model, expectedWorkingVersion: 1, expectedPublicationVersion: 1, summary: "Synthetic reviewed release" } });
  expect(response.statusCode).toBe(403);
  await pg.pool.query("delete from user_capability where user_id=$1 and capability_key='publish.execute'", [ids.actor]);
  await pg.pool.query("delete from role_capability where role_id=(select role_id from app_user where id=$1) and capability_key='publish.execute'", [ids.actor]);
  expect((await publish(1, key)).statusCode).toBe(403);
});
it("revalidates a source change committed while publication waits for the model lock", async () => {
  await approve(); const lock = await pg.pool.connect();
  await lock.query("begin"); await lock.query("select id from model where id=$1 for update", [ids.model]);
  const pending = publish();
  try {
    let blocked = false;
    for (let i = 0; i < 100; i++) {
      const result = await pg.pool.query("select count(*)::int n from pg_stat_activity where wait_event_type='Lock' and query like '%model%'");
      if (result.rows[0].n > 0) { blocked = true; break; }
      await new Promise(resolve => setTimeout(resolve, 10));
    }
    expect(blocked).toBe(true);
    await lock.query("update part set version=version+1 where id=$1", [ids.part]); await lock.query("commit");
    const result = await pending; expect(result.statusCode, result.body).toBe(422);
    expect(result.json().issues.some((issue: { code: string }) => issue.code === "MAPPING_SOURCE_CONFLICT")).toBe(true);
  } finally { await lock.query("rollback"); lock.release(); await pending; }
});
it("bounds serializable publication retries to three attempts and leaves no release", async () => {
  await approve();
  await pg.pool.query("create sequence publication_attempts; create function retry_publication_fixture() returns trigger language plpgsql as $$ begin perform nextval('publication_attempts'); raise exception 'fixture serial failure' using errcode='40001'; end $$; create trigger retry_publication_fixture before update of publication_version on model for each row execute function retry_publication_fixture()");
  try {
    const result = await publish(); expect(result.statusCode).toBe(503);
    expect((await pg.pool.query("select last_value::int n from publication_attempts")).rows[0].n).toBe(3);
    expect((await pg.pool.query("select count(*)::int n from publication_release")).rows[0].n).toBe(0);
  } finally { await pg.pool.query("drop trigger retry_publication_fixture on model; drop function retry_publication_fixture(); drop sequence publication_attempts"); }
});
it("hides all prices from technician semantics even with a granted price capability", async () => {
  await approve(); expect((await publish()).statusCode).toBe(201);
  await pg.pool.query("update company set technician_pricing_visible=false where id=$1", [ids.company]);
  await pg.pool.query("delete from role_capability where role_id=(select role_id from app_user where id=$1) and capability_key='orders.submit'", [ids.actor]);
  await pg.pool.query("insert into user_capability(user_id,capability_key) values($1,'orders.list.build'),($1,'pricing.cost.view') on conflict do nothing", [ids.actor]);
  for (const path of [`/catalog/figures/${ids.figure}`, "/catalog/parts/search?q=SYN", "/catalog/parts/usages?q=SYN"]) {
    const response = await get(path); expect(response.statusCode).toBe(200); expect(response.body).not.toMatch(/listPrice|99.99/);
  }
});

it("returns a bounded permitted usage summary index and supports search modes", async () => {
  await approve(); expect((await publish()).statusCode).toBe(201);
  const index = await get("/catalog/parts/usage-index?limit=1"); expect(index.statusCode, index.body).toBe(200);
  expect(index.json().items).toEqual([{ partId: ids.part, summary: { productLineName: "Synthetic", modelName: "Synthetic model", serial: "Synthetic variant", systemName: "Synthetic system", groupNo: null, assemblyName: "Synthetic figure", figureId: ids.figure } }]);
  expect((await get("/catalog/parts/usages?q=S-Y-N1&mode=part")).json().items).toHaveLength(1);
  expect((await get("/catalog/parts/usages?q=SYN1&mode=description")).json().items).toHaveLength(0);
  expect((await get("/catalog/parts/search?q=")).json().items).toHaveLength(0);
});

it("checks the specific navigation/search capability and rejects cursors after publication changes", async () => {
  await approve(); expect((await publish()).statusCode).toBe(201);
  const extra = randomUUID(); await pg.pool.query("insert into system(id,name,normalized_name) values($1,'Second system','second system')", [extra]);
  await pg.pool.query("insert into model_system(model_id,system_id) values($1,$2)", [ids.model, extra]);
  expect((await publish(2)).statusCode).toBe(201);
  const page = await get(`/catalog/variants/${ids.variant}/systems?limit=1`); expect(page.json().nextCursor).toBeTypeOf("string");
  expect((await publish(3)).statusCode).toBe(201);
  expect((await get(`/catalog/variants/${ids.variant}/systems?limit=1&cursor=${page.json().nextCursor}`)).statusCode).toBe(409);
  await pg.pool.query("delete from role_capability where role_id=(select role_id from app_user where id=$1) and capability_key='parts.record.view'", [ids.actor]);
  await pg.pool.query("delete from user_capability where user_id=$1 and capability_key='parts.record.view'", [ids.actor]);
  const denied = await get("/catalog/parts/search?q=SYN"); expect(denied.statusCode).toBe(403);
});

it("rejects activation of an incomplete sealed snapshot and preserves the current release", async () => {
  await approve(); const first = (await publish()).json(); const incomplete = randomUUID();
  await pg.pool.query("insert into publication_release(id,model_id,revision,source_checksum) values($1,$2,2,repeat('a',64))", [incomplete, ids.model]);
  const releaseModel = randomUUID();
  await pg.pool.query("insert into release_model(release_id,id,working_id,product_line_id,product_line_name,name,status) values($1,$2,$3,$4,'Synthetic','Incomplete','active')", [incomplete, releaseModel, ids.model, ids.line]);
  await pg.pool.query("insert into release_variant(release_id,working_id,model_id,label) values($1,$2,$3,'Incomplete')", [incomplete, ids.variant, releaseModel]);
  await pg.pool.query("update publication_release set status='inactive',published_at=now() where id=$1", [incomplete]);
  const response = await app.inject({ method: "POST", url: `/api/v1/admin/publication/releases/${incomplete}/activate`, headers: { ...headers, "idempotency-key": randomUUID() }, payload: { expectedPublicationVersion: 2, expectedActiveReleaseId: first.releaseId } });
  expect(response.statusCode, response.body).toBe(422);
  expect((await get(`/catalog/figures/${ids.figure}`)).json().release.releaseId).toBe(first.releaseId);
});
it("bounds the scoped publication queue with shared pagination and input validation", async () => {
  const response = await get("/admin/publication/queue?limit=1"); expect(response.statusCode).toBe(200);
  expect(response.json()).toMatchObject({ items: [{ modelId: ids.model, workingVersion: 1, publicationVersion: 1 }], nextCursor: null });
  expect((await get("/admin/publication/queue?limit=101")).statusCode).toBe(400);
});

it("copies required-part closure to same-release identities and searches permitted unpictured dependencies", async () => {
  await approve(); const target = randomUUID();
  await pg.pool.query("insert into part(id,part_number,normalized_part_number,description,list_price) values($1,'TARGET','TARGET','Required dependency',5)", [target]);
  await pg.pool.query("insert into part_requires(part_id,required_part_id,qty,review_state,reviewed_by_user_id,reviewed_at) values($1,$2,2,'approved',$3,now())", [ids.part, target, ids.actor]);
  expect((await publish()).statusCode).toBe(201);
  const detail = (await get(`/catalog/figures/${ids.figure}`)).json();
  expect(detail.rows[0].part.requires).toEqual([{ partId: target, qty: 2 }]);
  const stored = (await pg.pool.query("select part_id,required_part_id from release_part_requires")).rows[0];
  expect(stored.part_id).not.toBe(ids.part); expect(stored.required_part_id).not.toBe(target);
  const result = await get("/catalog/parts/search?q=TARGET"); expect(result.json().items).toHaveLength(1);
  expect(result.json().items[0].releasePartId).toBe(stored.required_part_id);
  expect((await get("/catalog/parts/usages?q=TARGET")).json().items[0]).toMatchObject({ figureId: null, part: { id: target } });
});

async function cloneSealedFixture(sourceReleaseId: string, defect: "empty-variant" | "unmapped-row" | "legacy") {
  const releaseId = randomUUID();
  await pg.pool.query("insert into publication_release(id,model_id,revision,source_checksum) values($1,$2,2,repeat('a',64))", [releaseId, ids.model]);
  for (const table of ["release_drawing", "release_model", "release_variant", "release_system", "release_part", "release_part_requires", "release_figure", "release_figure_part", "release_callout"]) {
    const columns = (await pg.pool.query("select column_name from information_schema.columns where table_schema='public' and table_name=$1 order by ordinal_position", [table])).rows.map(r => r.column_name as string);
    await pg.pool.query(`insert into ${table} (${columns.map(c => `"${c}"`).join(",")}) select ${columns.map(c => c === "release_id" ? "$1" : `"${c}"`).join(",")} from ${table} where release_id=$2`, [releaseId, sourceReleaseId]);
  }
  // All three historical fixtures intentionally lack numeric mapping. The
  // exception for legacy geometry must not exempt their hierarchy or rows.
  if (defect === "empty-variant") await pg.pool.query("insert into release_variant(release_id,working_id,model_id,label) select $1,$2,id,'Empty historical variant' from release_model where release_id=$1", [releaseId, randomUUID()]);
  if (defect === "unmapped-row") await pg.pool.query("insert into release_figure_part(release_id,working_id,figure_id,part_id,source_row_key,qty) select $1,$2,figure_id,part_id,'unmapped-historical-row',1 from release_figure_part where release_id=$1 limit 1", [releaseId, randomUUID()]);
  await pg.pool.query("update publication_release set status='inactive',published_at=now() where id=$1", [releaseId]);
  return releaseId;
}

it.each(["activate", "rollback"] as const)("%s rejects an empty historical variant despite another complete figure", async action => {
  await approve(); const first = (await publish()).json(); const historical = await cloneSealedFixture(first.releaseId, "empty-variant");
  const active = action === "rollback" ? (await publish(2)).json() : first;
  const response = await app.inject({ method: "POST", url: `/api/v1/admin/publication/releases/${historical}/${action}`, headers: { ...headers, "idempotency-key": randomUUID() }, payload: { expectedPublicationVersion: action === "rollback" ? 3 : 2, expectedActiveReleaseId: active.releaseId } });
  expect(response.statusCode, response.body).toBe(422);
  expect((await get(`/catalog/figures/${ids.figure}`)).json().release.releaseId).toBe(active.releaseId);
});

it.each(["activate", "rollback"] as const)("%s rejects a historical figure's extra unmapped row", async action => {
  await approve(); const first = (await publish()).json(); const historical = await cloneSealedFixture(first.releaseId, "unmapped-row");
  const active = action === "rollback" ? (await publish(2)).json() : first;
  const response = await app.inject({ method: "POST", url: `/api/v1/admin/publication/releases/${historical}/${action}`, headers: { ...headers, "idempotency-key": randomUUID() }, payload: { expectedPublicationVersion: action === "rollback" ? 3 : 2, expectedActiveReleaseId: active.releaseId } });
  expect(response.statusCode, response.body).toBe(422);
});
it.each(["activate", "rollback"] as const)("%s accepts complete historical hierarchy with legacy masks and no numeric mapping", async action => {
  await approve(); const first = (await publish()).json(); const historical = await cloneSealedFixture(first.releaseId, "legacy");
  const active = action === "rollback" ? (await publish(2)).json() : first;
  const response = await app.inject({ method: "POST", url: `/api/v1/admin/publication/releases/${historical}/${action}`, headers: { ...headers, "idempotency-key": randomUUID() }, payload: { expectedPublicationVersion: action === "rollback" ? 3 : 2, expectedActiveReleaseId: active.releaseId } });
  expect(response.statusCode, response.body).toBe(200);
  expect((await get(`/catalog/figures/${ids.figure}`)).json().mapping).toBeNull();
});
