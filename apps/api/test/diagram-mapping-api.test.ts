import { randomBytes, randomUUID } from "node:crypto";
import argon2 from "argon2";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { Value } from "@sinclair/typebox/value";
import { MappingEditorDocumentSchema, type DiagramMappingDocument } from "@rufdiamond/contracts";
import { buildApp } from "../src/app.js";
import { createDatabase } from "../src/db/client.js";
import { closePostgresPool, startPostgres } from "./helpers/postgres.js";

const passwordOptions = { type: argon2.argon2id, memoryCost: 2048, timeCost: 2, parallelism: 1 } as const;
const origin = "https://portal.example.test";
const config = {
  nodeEnv: "test" as const, port: 0, databaseUrl: "postgres://unused",
  sessionSecret: "mapping-test-session-secret-long-enough", webOrigin: origin,
  allowInsecureLoopbackCookie: false,
  deliveryEncryption: { activeKeyId: "test", keys: { test: randomBytes(32).toString("base64") } },
  s3: { endpoint: "http://localhost:9000", region: "test", bucket: "test", accessKeyId: "test", secretAccessKey: "test" },
};

describe("scoped diagram mapping API", () => {
  let pg: Awaited<ReturnType<typeof startPostgres>>;
  let connection: ReturnType<typeof createDatabase>;
  let app: Awaited<ReturnType<typeof buildApp>>;
  let ids: Record<"line" | "model" | "variant" | "system" | "drawing" | "figure" | "otherFigure" | "part" | "row" | "otherRow" | "callout" | "company" | "actor", string>;
  let headers: Record<string, string>;
  const path = () => `/api/v1/admin/figures/${ids.figure}/diagram-mapping`;
  const read = () => app.inject({ method: "GET", url: path(), headers });
  const save = (document: DiagramMappingDocument, version = 1, key = randomUUID()) => app.inject({ method: "PUT", url: path(), headers: { ...headers, "if-match": `"${version}"`, "idempotency-key": key }, payload: { document } });
  const approve = (revision: { revisionId: string; checksum: string; version: number }, key = randomUUID()) => app.inject({ method: "POST", url: `${path()}/approve`, headers: { ...headers, "if-match": `"${revision.version}"`, "idempotency-key": key }, payload: { revisionId: revision.revisionId, checksum: revision.checksum } });
  async function document() {
    const result = await read();
    expect(result.statusCode).toBe(200);
    return result.json().document as DiagramMappingDocument;
  }
  async function completeDocument() {
    const d = await document();
    d.occurrences[0].labelRegion = { x: 10, y: 10, width: 20, height: 20 };
    d.occurrences[0].regions = [{ id: "component-1", outer: [[40, 40], [80, 40], [80, 80], [40, 80]], holes: [] }];
    d.occurrences[0].evidence = "Source PNG checked against established row.";
    return d;
  }
  async function revoke(capability: string) {
    await pg.pool.query("delete from role_capability where role_id=(select role_id from app_user where id=$1) and capability_key=$2", [ids.actor, capability]);
    await pg.pool.query("delete from user_capability where user_id=$1 and capability_key=$2", [ids.actor, capability]);
  }
  beforeAll(async () => {
    pg = await startPostgres(); await pg.migrate(); connection = createDatabase(pg.connectionString);
  }, 120_000);
  beforeEach(async () => {
    await pg.pool.query("truncate company,product_line,system,part,drawing_file,audit_log,outbox_event cascade");
    ids = Object.fromEntries(["line", "model", "variant", "system", "drawing", "figure", "otherFigure", "part", "row", "otherRow", "callout", "company", "actor"].map(k => [k, randomUUID()])) as typeof ids;
    await pg.pool.query("insert into product_line(id,name,normalized_name) values($1,'truck','truck')", [ids.line]);
    await pg.pool.query("insert into model(id,product_line_id,name) values($1,$2,'FT3')", [ids.model, ids.line]);
    await pg.pool.query("insert into variant(id,model_id,label) values($1,$2,'Machine')", [ids.variant, ids.model]);
    await pg.pool.query("insert into system(id,name,normalized_name) values($1,'Frame','frame')", [ids.system]);
    await pg.pool.query("insert into drawing_file(id,object_key,filename,media_type,bytes,sha256,width,height,validation_status,object_version_id) values($1,'private-secret-object','frame.png','image/png',100,repeat('a',64),640,480,'valid','pinned-1')", [ids.drawing]);
    await pg.pool.query("insert into figure(id,variant_id,system_id,drawing_file_id,name,source_key) values($1,$2,$3,$4,'Frame','one'),($5,$2,$3,$4,'Other','two')", [ids.figure, ids.variant, ids.system, ids.drawing, ids.otherFigure]);
    await pg.pool.query("insert into diagram_mapping(figure_id) values($1),($2)", [ids.figure, ids.otherFigure]);
    await pg.pool.query("insert into part(id,part_number,normalized_part_number,description,list_price) values($1,'P1','P1','Frame bracket',999.99)", [ids.part]);
    await pg.pool.query("insert into figure_part(id,figure_id,part_id,source_row_key,qty) values($1,$2,$3,'row-1',2),($4,$5,$3,'row-1',1)", [ids.row, ids.figure, ids.part, ids.otherRow, ids.otherFigure]);
    await pg.pool.query("insert into callout(id,figure_id,figure_part_id,source_key,number,mask_path) values($1,$2,$3,'callout-1','7','M 1 1 L 2 2')", [ids.callout, ids.figure, ids.row]);
    await pg.pool.query("insert into company(id,name,type) values($1,'Mapping team','internal')", [ids.company]);
    await pg.pool.query("insert into app_user(id,company_id,name,login_id,email,password_hash,role_id) select $1,$2,'Mapper','mapper@example.test','mapper@example.test',$3,id from role where key='catalog_admin'", [ids.actor, ids.company, await argon2.hash("test password", passwordOptions)]);
    await pg.pool.query("insert into role_capability(role_id,capability_key) select r.id,c.key from role r cross join capability c where r.key='catalog_admin' and c.key in ('publish.draft.view','catalog.figure.view','catalog.callout.manage','catalog.callout.map') on conflict do nothing");
    await pg.pool.query("insert into user_capability(user_id,capability_key) values($1,'publish.execute')", [ids.actor]);
    await pg.pool.query("insert into user_scope(user_id,brand_mode,account_mode,fleet_mode,environment) values($1,'all','all','all','published_and_draft')", [ids.actor]);
    app = await buildApp({ config, dependencies: { database: connection, passwordOptions } });
    const login = await app.inject({ method: "POST", url: "/api/v1/auth/sign-in", headers: { origin }, payload: { loginId: "mapper@example.test", password: "test password" } });
    expect(login.statusCode).toBe(200);
    headers = { origin, cookie: String(login.headers["set-cookie"]).split(";")[0], "x-csrf-token": login.json().csrfToken };
  });
  afterEach(async () => { await app?.close(); });
  afterAll(async () => { if (connection) await closePostgresPool(connection.pool); await pg?.stop(); }, 30_000);

  it.each(["GET", "PUT", "POST"] as const)("requires authentication for %s", async method => {
    const response = await app.inject({ method, url: `${path()}${method === "POST" ? "/approve" : ""}`, ...(method === "GET" ? {} : { payload: {} }) });
    expect(response.statusCode).toBe(401);
    expect(response.headers["content-type"]).toContain("application/problem+json");
  });
  it("returns safe initial graph context without private keys or pricing", async () => {
    const response = await read();
    expect(response.statusCode).toBe(200);
    expect(Value.Check(MappingEditorDocumentSchema, response.json())).toBe(true);
    expect(response.json()).toMatchObject({ version: 1, revision: null, sourceConflict: false, source: { figure: { id: ids.figure, name: "Frame", version: 1 }, rows: [{ id: ids.row, partId: ids.part, qty: 2, partNumber: "P1", refLabels: ["7"] }] }, document: { figureId: ids.figure, imageWidth: 640, occurrences: [{ calloutId: ids.callout, figurePartId: ids.row, labelRegion: null, regions: [] }] } });
    expect(response.body).not.toMatch(/private-secret|objectKey|999.99|listPrice|password|signedUrl/);
  });
  it("denies current read capability and draft environment before figure lookup", async () => {
    await revoke("catalog.figure.view");
    expect((await read()).statusCode).toBe(403);
    expect((await app.inject({ method: "GET", url: path().replace(ids.figure, randomUUID()), headers })).statusCode).toBe(403);
  });
  it("hides figures outside current brand or variant scope", async () => {
    await pg.pool.query("update user_scope set brand_mode='subset' where user_id=$1", [ids.actor]);
    expect((await read()).statusCode).toBe(404);
    await pg.pool.query("update user_scope set brand_mode='all',fleet_mode='subset' where user_id=$1", [ids.actor]);
    expect((await read()).statusCode).toBe(404);
  });
  it("requires CSRF, exact origin and write preconditions", async () => {
    const d = await document();
    const base = { method: "PUT" as const, url: path(), payload: { document: d } };
    expect((await app.inject({ ...base, headers: { ...headers, "x-csrf-token": "wrong" } })).statusCode).toBe(403);
    expect((await app.inject({ ...base, headers: { ...headers, origin: "https://evil.test" } })).statusCode).toBe(403);
    const missing = await app.inject({ ...base, headers });
    expect(missing.statusCode).toBe(428); expect(missing.json().title).toBe("Precondition Required");
    expect((await app.inject({ ...base, headers: { ...headers, "if-match": 'W/"1"', "idempotency-key": "key" } })).statusCode).toBe(400);
  });
  it("saves, reloads, replays before stale version rejection and rejects altered key context", async () => {
    const d = await completeDocument(); const key = randomUUID();
    const first = await save(d, 1, key);
    expect(first.statusCode).toBe(200); expect(first.json()).toMatchObject({ version: 2, approval: null, document: d });
    expect((await read()).json().revision).toEqual(first.json());
    expect((await save(d, 1, key)).json()).toEqual(first.json());
    expect((await save(d, 2, key)).statusCode).toBe(409);
    expect((await save({ ...d, occurrences: [] }, 1, key)).statusCode).toBe(409);
    const stale = await save(d); expect(stale.statusCode).toBe(412); expect(stale.json().title).toBe("Precondition Failed");
    expect((await pg.pool.query("select count(*)::int n from diagram_mapping_revision")).rows[0].n).toBe(1);
    expect((await pg.pool.query("select count(*)::int n from outbox_event where aggregate_type='diagram_mapping'")).rows[0].n).toBe(1);
  });
  it("commits exactly one concurrent writer for one head version", async () => {
    const d = await completeDocument();
    const results = await Promise.all([save(d), save(d)]);
    expect(results.map(r => r.statusCode).sort()).toEqual([200, 412]);
    expect((await pg.pool.query("select count(*)::int n from diagram_mapping_revision")).rows[0].n).toBe(1);
  });
  it("rejects invalid geometry with occurrence and region identifiers, and strict bodies", async () => {
    const d = await completeDocument(); d.occurrences[0].regions[0].outer = [[40, 40], [80, 80], [80, 40], [40, 80]];
    const response = await save(d); expect(response.statusCode).toBe(422);
    expect(response.json().issues[0].path).toContain(ids.callout); expect(response.json().issues[0].path).toContain("component-1");
    d.imageWidth = "640" as never;
    expect((await save(d)).statusCode).toBe(400);
    expect((await app.inject({ method: "PUT", url: path(), headers: { ...headers, "if-match": '"1"', "idempotency-key": "strict" }, payload: { document: await document(), approval: { reviewerId: ids.actor } } })).statusCode).toBe(400);
  });
  it("returns 413 for oversized bodies while malformed JSON remains 400", async () => {
    const response = await app.inject({ method: "PUT", url: path(), headers, payload: { text: "x".repeat(1024 * 1024) } });
    expect(response.statusCode).toBe(413); expect(response.json().title).toBe("Payload Too Large");
    expect((await app.inject({ method: "PUT", url: path(), headers: { ...headers, "content-type": "application/json" }, payload: "{" })).statusCode).toBe(400);
  });
  it("rejects source changes and preserves stale saved work explicitly", async () => {
    const d = await completeDocument(); const revision = (await save(d)).json();
    const replacement = randomUUID();
    await pg.pool.query("insert into drawing_file(id,object_key,filename,media_type,bytes,sha256,width,height,validation_status,object_version_id,file_version) values($1,'replacement-private','replacement.png','image/png',100,repeat('b',64),640,480,'valid','pinned-2',2)", [replacement]);
    await pg.pool.query("update figure set drawing_file_id=$1,version=version+1 where id=$2", [replacement, ids.figure]);
    const current = await read(); expect(current.statusCode).toBe(200);
    expect(current.json()).toMatchObject({ sourceConflict: true, document: d, revision });
    expect((await save(d, 2)).statusCode).toBe(409); expect((await approve(revision)).statusCode).toBe(409);
  });
  it("rejects row binding changes and cross-figure identities", async () => {
    const d = await completeDocument();
    const wrong = structuredClone(d); wrong.occurrences[0].figurePartId = ids.otherRow;
    expect((await save(wrong)).statusCode).toBe(422);
    await pg.pool.query("update figure_part set qty=3,version=version+1 where id=$1", [ids.row]);
    expect((await save(d)).statusCode).toBe(409);
  });
  it("separates map from manage, updates explicit associations and guards replay after revocation", async () => {
    const d = await completeDocument(); const key = randomUUID(); d.occurrences[0].figurePartId = null;
    await revoke("catalog.callout.map"); expect((await save(d, 1, key)).statusCode).toBe(403);
    const unchanged = await completeDocument(); expect((await save(unchanged)).statusCode).toBe(200);
    await pg.pool.query("insert into user_capability(user_id,capability_key) values($1,'catalog.callout.map')", [ids.actor]);
    const changed = await save(d, 2, key); expect(changed.statusCode).toBe(200);
    expect(changed.json().document.catalogueBindingSha256).not.toBe(d.catalogueBindingSha256);
    expect((await pg.pool.query("select figure_part_id,version,mask_path from callout where id=$1", [ids.callout])).rows[0]).toEqual({ figure_part_id: null, version: 2, mask_path: "M 1 1 L 2 2" });
    await revoke("catalog.callout.map"); expect((await save(d, 2, key)).statusCode).toBe(403);
    await revoke("catalog.callout.manage"); expect((await save(changed.json().document, 3)).statusCode).toBe(403);
  });
  it("requires complete current revision and named publisher; new saves have no prior approval", async () => {
    const incomplete = (await save(await document())).json(); expect((await approve(incomplete)).statusCode).toBe(422);
    const full = (await save(await completeDocument(), 2)).json();
    await revoke("publish.execute"); expect((await approve(full)).statusCode).toBe(403);
    await pg.pool.query("insert into user_capability(user_id,capability_key) values($1,'publish.execute')", [ids.actor]);
    const key = randomUUID(); const reviewed = await approve(full, key); expect(reviewed.statusCode).toBe(200); expect(reviewed.json().approval.reviewerId).toBe(ids.actor);
    expect((await approve(full, key)).json()).toEqual(reviewed.json());
    const next = await save(full.document, 3); expect(next.statusCode).toBe(200); expect(next.json().approval).toBeNull();
    expect((await approve({ ...full, version: 4 })).statusCode).toBe(409);
    expect((await approve(full, key)).json()).toEqual(reviewed.json());
  });
  it("denies disabled sessions on reads, writes and replay", async () => {
    const d = await completeDocument(); const key = randomUUID(); expect((await save(d, 1, key)).statusCode).toBe(200);
    await pg.pool.query("update app_user set status='suspended' where id=$1", [ids.actor]);
    expect((await read()).statusCode).toBe(401); expect((await save(d, 1, key)).statusCode).toBe(401);
  });
  it("rolls back association, revision, head, audit and idempotency when outbox fails", async () => {
    const d = await completeDocument(); d.occurrences[0].figurePartId = null;
    await pg.pool.query("create function mapping_test_failure() returns trigger language plpgsql as $$ begin if NEW.aggregate_type='diagram_mapping' then raise exception 'private SQL error'; end if; return NEW; end $$; create trigger mapping_test_failure before insert on outbox_event for each row execute function mapping_test_failure()");
    try {
      const result = await save(d); expect(result.statusCode).toBe(500); expect(result.body).not.toContain("private SQL");
      expect((await pg.pool.query("select count(*)::int n from diagram_mapping_revision")).rows[0].n).toBe(0);
      expect((await pg.pool.query("select count(*)::int n from idempotency_record")).rows[0].n).toBe(0);
      expect((await pg.pool.query("select count(*)::int n from audit_log where object_type='diagram_mapping'")).rows[0].n).toBe(0);
      expect((await pg.pool.query("select figure_part_id,version from callout where id=$1", [ids.callout])).rows[0]).toEqual({ figure_part_id: ids.row, version: 1 });
      expect((await read()).json().version).toBe(1);
    } finally { await pg.pool.query("drop trigger mapping_test_failure on outbox_event; drop function mapping_test_failure()"); }
  });

  it.each(["PUT", "POST"] as const)("checks %s current capability and scope before replay", async method => {
    const d = await completeDocument(); const key = randomUUID(); const revision = (await save(d, 1, key)).json();
    const approvalKey = randomUUID(); expect((await approve(revision, approvalKey)).statusCode).toBe(200);
    await pg.pool.query("update user_scope set brand_mode='subset' where user_id=$1", [ids.actor]);
    const attempt = () => method === "PUT" ? save(d, 1, key) : approve(revision, approvalKey);
    expect((await attempt()).statusCode).toBe(404);
    await revoke(method === "PUT" ? "catalog.callout.manage" : "catalog.callout.map");
    expect((await attempt()).statusCode).toBe(403);
  });
  it("denies draft environment even with explicit capabilities", async () => {
    const d = await completeDocument();
    await pg.pool.query("update user_scope set environment='published' where user_id=$1", [ids.actor]);
    expect((await read()).statusCode).toBe(403); expect((await save(d)).statusCode).toBe(403);
  });
  it("rejects substituted occurrence, reference, figure and drawing identities", async () => {
    const d = await completeDocument();
    for (const change of ["callout", "ref", "figure", "drawing"]) {
      const wrong = structuredClone(d);
      if (change === "callout") wrong.occurrences[0].calloutId = randomUUID();
      if (change === "ref") wrong.occurrences[0].refNo = "another reference";
      if (change === "figure") wrong.figureId = ids.otherFigure;
      if (change === "drawing") wrong.drawingFileId = randomUUID();
      expect((await save(wrong)).statusCode).toBe(change === "callout" || change === "ref" ? 422 : 409);
    }
  });
  it("omitting an occurrence preserves its authoritative association but blocks approval", async () => {
    const d = await completeDocument(); d.occurrences = [];
    const result = await save(d); expect(result.statusCode).toBe(200);
    expect((await pg.pool.query("select figure_part_id,version from callout where id=$1", [ids.callout])).rows[0]).toEqual({ figure_part_id: ids.row, version: 1 });
    const review = await approve(result.json()); expect(review.statusCode).toBe(422);
    expect(review.json().issues).toContainEqual({ path: `occurrences["${ids.callout}"]`, code: "missing_occurrence", message: "Every source occurrence must be reviewed." });
  });
  it.each(["label", "regions", "evidence", "row"])("requires %s for approval", async missing => {
    const d = await completeDocument();
    if (missing === "label") d.occurrences[0].labelRegion = null;
    if (missing === "regions") d.occurrences[0].regions = [];
    if (missing === "evidence") d.occurrences[0].evidence = "   ";
    if (missing === "row") d.occurrences[0].figurePartId = null;
    const result = await save(d); expect(result.statusCode).toBe(200);
    expect((await approve(result.json())).statusCode).toBe(422);
  });
  it.each(["absent", "unvalidated", "non-png", "dimensions"])("does not invent initial geometry when the drawing is %s", async state => {
    const replacement = randomUUID();
    if (state !== "absent") await pg.pool.query("insert into drawing_file(id,object_key,filename,media_type,bytes,sha256,width,height,validation_status) values($1::uuid,$1::text,'replacement.png',$2,100,repeat('b',64),$3,480,$4)", [replacement, state === "non-png" ? "image/jpeg" : "image/png", state === "dimensions" ? null : 640, state === "unvalidated" ? "pending" : "valid"]);
    await pg.pool.query("update figure set drawing_file_id=$1,version=version+1 where id=$2", [state === "absent" ? null : replacement, ids.figure]);
    const response = await read(); expect(response.statusCode).toBe(409); expect(response.json().code).toBe("SOURCE_UNAVAILABLE");
  });
  it("preserves approved historical work if the current drawing becomes unavailable", async () => {
    const saved = (await save(await completeDocument())).json();
    const reviewed = (await approve(saved)).json();
    await pg.pool.query("update figure set drawing_file_id=null,version=version+1 where id=$1", [ids.figure]);
    const response = await read(); expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ sourceConflict: true, source: { drawing: null }, revision: reviewed, document: saved.document });
    expect(Value.Check(MappingEditorDocumentSchema, response.json())).toBe(true);
    expect((await approve(saved)).statusCode).toBe(409);
  });
  it("scopes the idempotency hash to the route figure", async () => {
    const d = await completeDocument(); const key = randomUUID(); expect((await save(d, 1, key)).statusCode).toBe(200);
    const other = await app.inject({ method: "GET", url: path().replace(ids.figure, ids.otherFigure), headers });
    const response = await app.inject({ method: "PUT", url: path().replace(ids.figure, ids.otherFigure), headers: { ...headers, "if-match": '"1"', "idempotency-key": key }, payload: { document: other.json().document } });
    expect(response.statusCode).toBe(409);
  });
  it("rolls back approval and audit when its outbox write fails", async () => {
    const saved = (await save(await completeDocument())).json();
    await pg.pool.query("create function mapping_approval_failure() returns trigger language plpgsql as $$ begin if NEW.event_type='diagram_mapping.approved' then raise exception 'private approval error'; end if; return NEW; end $$; create trigger mapping_approval_failure before insert on outbox_event for each row execute function mapping_approval_failure()");
    try {
      expect((await approve(saved)).statusCode).toBe(500);
      expect((await pg.pool.query("select count(*)::int n from diagram_mapping_approval")).rows[0].n).toBe(0);
      expect((await pg.pool.query("select count(*)::int n from audit_log where object_type='diagram_mapping'")).rows[0].n).toBe(1);
      expect((await read()).json().revision.approval).toBeNull();
    } finally { await pg.pool.query("drop trigger mapping_approval_failure on outbox_event; drop function mapping_approval_failure()"); }
  });
  it("bounds real serialization retries and reports transient PostgreSQL failures safely", async () => {
    const d = await completeDocument();
    await pg.pool.query("create sequence mapping_retry_count; create function mapping_retry_failure() returns trigger language plpgsql as $$ begin perform nextval('mapping_retry_count'); raise exception using errcode='40001',message='private SQL details'; end $$; create trigger mapping_retry_failure before insert on diagram_mapping_revision for each row execute function mapping_retry_failure()");
    try {
      const response = await save(d); expect(response.statusCode).toBe(503); expect(response.body).not.toContain("private SQL");
      expect((await pg.pool.query("select last_value from mapping_retry_count")).rows[0].last_value).toBe("3");
      expect((await pg.pool.query("select count(*)::int n from diagram_mapping_revision")).rows[0].n).toBe(0);
    } finally { await pg.pool.query("drop trigger mapping_retry_failure on diagram_mapping_revision; drop function mapping_retry_failure(); drop sequence mapping_retry_count"); }
  });
  it("rechecks source changes committed while a writer waits for the model lock", async () => {
    const d = await completeDocument(); const blocker = await pg.pool.connect(); let pending: ReturnType<typeof save> | undefined;
    try {
      await blocker.query("begin"); await blocker.query("select id from model where id=$1 for update", [ids.model]);
      pending = save(d);
      let waiting = false;
      for (let i = 0; i < 100 && !waiting; i += 1) {
        waiting = (await pg.pool.query("select exists(select 1 from pg_stat_activity where wait_event_type='Lock' and query like '%from \"model\"%' and query like '%for update%') waiting")).rows[0].waiting;
        if (!waiting) await new Promise(resolve => setTimeout(resolve, 10));
      }
      expect(waiting).toBe(true);
      await blocker.query("update figure_part set qty=3,version=version+1 where id=$1", [ids.row]);
      await blocker.query("commit");
      expect((await pending).statusCode).toBe(409);
      expect((await pg.pool.query("select count(*)::int n from diagram_mapping_revision")).rows[0].n).toBe(0);
    } finally { await blocker.query("rollback"); blocker.release(); await pending; }
  });

  it("rejects empty mapping approval without inventing a table-only exemption", async () => {
    const otherPath = path().replace(ids.figure, ids.otherFigure);
    const initial = await app.inject({ method: "GET", url: otherPath, headers });
    expect(initial.statusCode).toBe(200);
    const saved = await app.inject({ method: "PUT", url: otherPath, headers: { ...headers, "if-match": '"1"', "idempotency-key": randomUUID() }, payload: { document: initial.json().document } });
    expect(saved.statusCode).toBe(200);
    const review = await app.inject({ method: "POST", url: `${otherPath}/approve`, headers: { ...headers, "if-match": '"2"', "idempotency-key": randomUUID() }, payload: { revisionId: saved.json().revisionId, checksum: saved.json().checksum } });
    expect(review.statusCode).toBe(422); expect(review.json().code).toBe("EMPTY_MAPPING");
    expect((await pg.pool.query("select count(*)::int n from diagram_mapping_approval")).rows[0].n).toBe(0);
    expect((await pg.pool.query("select count(*)::int n from audit_log where object_type='diagram_mapping'")).rows[0].n).toBe(1);
    expect((await pg.pool.query("select count(*)::int n from outbox_event where aggregate_type='diagram_mapping'")).rows[0].n).toBe(1);
  });
});
