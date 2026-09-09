import { createHash, randomBytes, randomUUID } from "node:crypto";
import argon2 from "argon2";
import sharp from "sharp";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { buildApp } from "../src/app.js";
import { createDatabase } from "../src/db/client.js";
import { closePostgresPool, startPostgres } from "./helpers/postgres.js";
import { cleanupDrawingQuarantine } from "../src/modules/drawings/cleanup.js";
import { GenericContainer, Wait } from "testcontainers";
import { CreateBucketCommand, PutBucketVersioningCommand, S3Client } from "@aws-sdk/client-s3";
import { createS3DrawingStorage } from "../src/modules/drawings/s3-storage.js";
import { createClamdScanner } from "../src/modules/drawings/scanner.js";
import type { DrawingScanner, DrawingStorage } from "../src/modules/drawings/storage.js";

const origin = "https://portal.example.test";
const passwordOptions = { type: argon2.argon2id, memoryCost: 2048, timeCost: 2, parallelism: 1 } as const;
const digest = (bytes: Buffer) => createHash("sha256").update(bytes).digest("hex");
describe("private PNG attachment API", () => {
  let pg: Awaited<ReturnType<typeof startPostgres>>;
  let connection: ReturnType<typeof createDatabase>;
  let app: Awaited<ReturnType<typeof buildApp>>;
  let headers: Record<string, string>;
  let ids: Record<string, string>;
  let png: Buffer;
  let now: Date;
  let verdict: "clean" | "infected" | "unavailable";
  let beforeScan: (() => Promise<void>) | undefined;
  let beforeUploadUrl: (() => Promise<void>) | undefined;
  let realStorage: DrawingStorage | undefined, realScanner: DrawingScanner | undefined;
  const objects = new Map<string, { bytes: Buffer; versionId: string; contentType: string }>();
  // Object adapter isolates fault/race injection; separate S3 tests run the real transport.
  const storage = {
    async createUpload(key: string, seconds: number) { await beforeUploadUrl?.(); if (realStorage) return realStorage.createUpload(key, seconds); return { url: `https://storage.example.test/${key}`, headers: { "Content-Type": "image/png" as const } }; },
    async inspect(key: string, version?: string) { if (realStorage) return realStorage.inspect(key, version); const v = objects.get(key)!; if (!v || (version && version !== v.versionId)) throw new Error("storage offline"); return { bytes: v.bytes.length, versionId: v.versionId, contentType: v.contentType }; },
    async *read(key: string, version?: string) { if (realStorage) { yield* realStorage.read(key, version); return; } const v = objects.get(key)!; if (version !== v.versionId) throw new Error("wrong version"); yield v.bytes; },
    async createDownload(key: string, version: string, seconds: number) { if (realStorage) return realStorage.createDownload(key, version, seconds); return `https://storage.example.test/${key}?versionId=${version}`; },
    async deleteQuarantine(key: string) { objects.delete(key); },
  };
  const path = () => `/api/v1/admin/figures/${ids.figure}`;
  const requestIntent = (body = { filename: "frame.png", bytes: png.length, sha256: digest(png) }, version = 1) => app.inject({ method: "POST", url: `${path()}/drawing-uploads`, headers: { ...headers, "if-match": `"${version}"` }, payload: body });
  async function upload(bytes = png, hash = digest(bytes), version = 1) {
    const r = await requestIntent({ filename: "frame.png", bytes: bytes.length, sha256: hash }, version);
    expect(r.statusCode).toBe(201);
    const row = (await pg.pool.query("select object_key from drawing_upload_intent where id=$1", [r.json().uploadId])).rows[0];
    objects.set(row.object_key, { bytes, versionId: randomUUID(), contentType: "image/png" });
    return { ...r.json(), key: row.object_key } as { uploadId: string; key: string };
  }
  const finalize = (uploadId: string, version = 1) => app.inject({ method: "POST", url: `${path()}/drawing-uploads/${uploadId}/finalize`, headers: { ...headers, "if-match": `"${version}"` }, payload: {} });
  const current = async () => (await pg.pool.query("select drawing_file_id,version from figure where id=$1", [ids.figure])).rows[0];
  beforeAll(async () => { pg = await startPostgres(); await pg.migrate(); connection = createDatabase(pg.connectionString); png = await sharp({ create: { width: 8, height: 6, channels: 4, background: "white" } }).png().toBuffer(); }, 120_000);
  beforeEach(async () => {
    await pg.pool.query("truncate company,product_line,system,drawing_file,audit_log,outbox_event cascade");
    ids = Object.fromEntries(["line", "model", "variant", "system", "drawing", "figure", "company", "actor"].map(k => [k, randomUUID()]));
    now = new Date(); verdict = "clean"; beforeScan = undefined; beforeUploadUrl = undefined; realStorage = undefined; realScanner = undefined; objects.clear();
    await pg.pool.query("insert into product_line(id,name,normalized_name) values($1,'Truck','truck')", [ids.line]);
    await pg.pool.query("insert into model(id,product_line_id,name) values($1,$2,'Truck')", [ids.model, ids.line]);
    await pg.pool.query("insert into variant(id,model_id,label) values($1,$2,'Model')", [ids.variant, ids.model]);
    await pg.pool.query("insert into system(id,name,normalized_name) values($1,'Frame','frame')", [ids.system]);
    await pg.pool.query("insert into drawing_file(id,object_key,filename,media_type,bytes,sha256,width,height,validation_status,object_version_id) values($1,'previous-private','frame.png','image/png',100,repeat('a',64),8,6,'valid','previous-pinned')", [ids.drawing]);
    await pg.pool.query("insert into figure(id,variant_id,system_id,drawing_file_id,name,source_key) values($1,$2,$3,$4,'Frame','one')", [ids.figure, ids.variant, ids.system, ids.drawing]);
    await pg.pool.query("insert into diagram_mapping(figure_id) values($1)", [ids.figure]);
    await pg.pool.query("insert into company(id,name,type) values($1,'Editors','internal')", [ids.company]);
    await pg.pool.query("insert into app_user(id,company_id,name,login_id,email,password_hash,role_id) select $1,$2,'Editor','upload@example.test','upload@example.test',$3,id from role where key='catalog_admin'", [ids.actor, ids.company, await argon2.hash("test password", passwordOptions)]);
    await pg.pool.query("insert into role_capability(role_id,capability_key) select r.id,c.key from role r cross join capability c where r.key='catalog_admin' and c.key in ('publish.draft.view','catalog.figure.view','catalog.figure.edit','catalog.drawing.upload','catalog.callout.manage') on conflict do nothing");
    await pg.pool.query("insert into user_scope(user_id,brand_mode,account_mode,fleet_mode,environment) values($1,'all','all','all','published_and_draft')", [ids.actor]);
    app = await buildApp({ config: { nodeEnv: "test", port: 0, databaseUrl: pg.connectionString, webOrigin: origin, sessionSecret: "drawing-test-session-secret-long-enough", allowInsecureLoopbackCookie: false, deliveryEncryption: { activeKeyId: "test", keys: { test: randomBytes(32).toString("base64") } }, s3: { endpoint: "http://localhost:9000", region: "test", bucket: "test", accessKeyId: "test", secretAccessKey: "test" } }, dependencies: { database: connection, passwordOptions, now: () => now, drawingStorage: storage, drawingScanner: { async scan(bytes) { await beforeScan?.(); return realScanner ? realScanner.scan(bytes) : verdict; } } } });
    const login = await app.inject({ method: "POST", url: "/api/v1/auth/sign-in", headers: { origin }, payload: { loginId: "upload@example.test", password: "test password" } });
    headers = { origin, cookie: String(login.headers["set-cookie"]).split(";")[0], "x-csrf-token": login.json().csrfToken };
  });
  afterEach(async () => { await app?.close(); });
  afterAll(async () => { if (connection) await closePostgresPool(connection.pool); await pg?.stop(); }, 30_000);
  it("requires authenticated CSRF protected intents and figure preconditions", async () => {
    expect((await app.inject({ method: "POST", url: `${path()}/drawing-uploads`, payload: {} })).statusCode).toBe(401);
    expect((await app.inject({ method: "POST", url: `${path()}/drawing-uploads`, headers: { cookie: headers.cookie, origin }, payload: {} })).statusCode).toBe(403);
    expect((await app.inject({ method: "POST", url: `${path()}/drawing-uploads`, headers, payload: { filename: "f.png", bytes: png.length, sha256: digest(png) } })).statusCode).toBe(428);
    expect((await requestIntent(undefined, 2)).statusCode).toBe(412);
    expect((await finalize("------------------------------------")).statusCode).toBe(404);
  });
  it("attaches one immutable verified version, replays, and retains stale saved mapping", async () => {
    const mapping = (await app.inject({ method: "GET", url: `${path()}/diagram-mapping`, headers })).json();
    expect((await app.inject({ method: "PUT", url: `${path()}/diagram-mapping`, headers: { ...headers, "if-match": '"1"', "idempotency-key": randomUUID() }, payload: { document: mapping.document } })).statusCode).toBe(200);
    const u = await upload(); const response = await finalize(u.uploadId);
    expect(response.statusCode).toBe(200); expect(response.json()).toMatchObject({ figureId: ids.figure, figureVersion: 2, width: 8, height: 6, sha256: digest(png) });
    expect((await current()).drawing_file_id).toBe(response.json().drawingFileId);
    expect((await finalize(u.uploadId)).json()).toEqual(response.json());
    expect((await pg.pool.query("select count(*)::int n from drawing_file")).rows[0].n).toBe(2);
    expect((await pg.pool.query("select count(*)::int n from outbox_event where event_type='drawing.attached'")).rows[0].n).toBe(1);
    expect((await pg.pool.query("select count(*)::int n from audit_log where object_type='drawing' ")).rows[0].n).toBe(1);
    expect((await app.inject({ method: "GET", url: `${path()}/diagram-mapping`, headers })).json()).toMatchObject({ sourceConflict: true, document: mapping.document });
    const delivery = await app.inject({ method: "GET", url: `${path()}/drawing`, headers });
    expect(delivery.statusCode).toBe(200); expect(delivery.json()).toMatchObject({ drawingFileId: response.json().drawingFileId, width: 8, height: 6 }); expect(delivery.headers["cache-control"]).toBe("no-store");
  });
  it.each(["hash", "truncated", "mime", "unversioned", "infected", "unavailable"])("keeps prior attachment when %s verification fails", async fault => {
    const u = await upload(fault === "truncated" ? png.subarray(0, png.length - 5) : png, fault === "hash" ? "b".repeat(64) : undefined);
    if (fault === "mime") objects.get(u.key)!.contentType = "text/html";
    if (fault === "unversioned") objects.get(u.key)!.versionId = "null";
    if (fault === "infected" || fault === "unavailable") verdict = fault;
    const r = await finalize(u.uploadId); expect(r.statusCode).toBe(["unavailable", "unversioned"].includes(fault) ? 503 : 422);
    expect(await current()).toEqual({ drawing_file_id: ids.drawing, version: 1 });
    expect(r.body).not.toMatch(/previous-private|stack|object_key/);
  });
  it("rejects oversized intents, extra keys, traversal names and stale/expired uploads", async () => {
    expect((await requestIntent({ filename: "big.png", bytes: 20 * 1024 * 1024 + 1, sha256: digest(png) })).statusCode).toBe(413);
    expect((await requestIntent({ filename: "../f.png", bytes: png.length, sha256: digest(png) })).statusCode).toBe(400);
    expect((await app.inject({ method: "POST", url: `${path()}/drawing-uploads`, headers: { ...headers, "if-match": '"1"' }, payload: { filename: "f.png", bytes: png.length, sha256: digest(png), objectKey: "chosen-by-client" } })).statusCode).toBe(400);
    const u = await upload(); now = new Date(now.getTime() + 900_001);
    expect((await finalize(u.uploadId)).statusCode).toBe(409); expect((await current()).drawing_file_id).toBe(ids.drawing);
  });
  it("rechecks source version and grants after scanning", async () => {
    const u = await upload(); beforeScan = async () => { await pg.pool.query("update figure set version=version+1 where id=$1", [ids.figure]); };
    expect((await finalize(u.uploadId)).statusCode).toBe(412); expect((await current()).drawing_file_id).toBe(ids.drawing);
    beforeScan = undefined;
    const next = await upload(png, digest(png), 2);
    beforeScan = async () => { await pg.pool.query("delete from role_capability where capability_key='catalog.drawing.upload' and role_id=(select role_id from app_user where id=$1)", [ids.actor]); };
    expect((await finalize(next.uploadId, 2)).statusCode).toBe(403); expect((await current()).drawing_file_id).toBe(ids.drawing);
  });
  it("serializes racing finalizations to a single winner and rolls back attachment with outbox", async () => {
    const a = await upload(), b = await upload();
    const results = await Promise.all([finalize(a.uploadId), finalize(b.uploadId)]);
    expect(results.map(r => r.statusCode).sort()).toEqual([200, 412]);
    const previous = await current(); const c = await upload(png, digest(png), 2);
    // A table check triggers reliably across all pooled transaction connections.
    await pg.pool.query("alter table outbox_event add constraint test_reject_drawing check(event_type <> 'drawing.attached') not valid");
    try { expect((await finalize(c.uploadId, 2)).statusCode).toBe(500); expect(await current()).toEqual(previous); expect((await pg.pool.query("select count(*)::int n from drawing_file")).rows[0].n).toBe(2); }
    finally { await pg.pool.query("alter table outbox_event drop constraint test_reject_drawing"); }
  });
  it("returns the same drawing for simultaneous replay and hides another actor's upload intent", async () => {
    const a = await upload();
    const results = await Promise.all([finalize(a.uploadId), finalize(a.uploadId)]);
    expect(results.map(r => r.statusCode)).toEqual([200, 200]); expect(results[0].json()).toEqual(results[1].json());
    const b = await upload(png, digest(png), 2), other = randomUUID();
    await pg.pool.query("insert into app_user(id,company_id,name,login_id,email,password_hash,role_id) select $1,company_id,'Other','other-upload@example.test','other-upload@example.test',password_hash,role_id from app_user where id=$2", [other, ids.actor]);
    await pg.pool.query("insert into user_scope(user_id,brand_mode,account_mode,fleet_mode,environment) values($1,'all','all','all','published_and_draft')", [other]);
    const login = await app.inject({ method: "POST", url: "/api/v1/auth/sign-in", headers: { origin }, payload: { loginId: "other-upload@example.test", password: "test password" } });
    headers = { origin, cookie: String(login.headers["set-cookie"]).split(";")[0], "x-csrf-token": login.json().csrfToken };
    expect((await finalize(b.uploadId, 2)).statusCode).toBe(404);
  });
  it("does not reveal current drawings or allow writes across company fleet scope", async () => {
    await pg.pool.query("update company set type='customer' where id=$1", [ids.company]);
    expect((await app.inject({ method: "GET", url: `${path()}/drawing`, headers })).statusCode).toBe(404);
    expect((await requestIntent()).statusCode).toBe(404);
  });
  it("does not release a signed upload URL after permission loss during signing", async () => {
    beforeUploadUrl = async () => { await pg.pool.query("delete from role_capability where capability_key='catalog.drawing.upload' and role_id=(select role_id from app_user where id=$1)", [ids.actor]); };
    expect((await requestIntent()).statusCode).toBe(403);
  });
  it("cleans only expired intent-owned objects after 24 hours, retaining finalized and referenced files", async () => {
    const old = await upload(), referenced = await upload(), finalized = await upload();
    expect((await finalize(finalized.uploadId)).statusCode).toBe(200);
    await pg.pool.query("insert into drawing_file(object_key,filename,media_type,bytes,sha256,object_version_id) values($1,'reference.png','image/png',100,repeat('c',64),'reference-version')", [referenced.key]);
    now = new Date(now.getTime() + 23 * 3600_000);
    expect(await cleanupDrawingQuarantine(connection.db, storage, () => now)).toEqual({ cleaned: 0 });
    now = new Date(now.getTime() + 65 * 60_000);
    // Twenty-four hours since intent creation is not enough for a late upload.
    expect(await cleanupDrawingQuarantine(connection.db, storage, () => now)).toEqual({ cleaned: 0 });
    now = new Date(now.getTime() + 55 * 60_000);
    const renewed = await app.inject({ method: "POST", url: "/api/v1/auth/sign-in", headers: { origin }, payload: { loginId: "upload@example.test", password: "test password" } });
    headers = { origin, cookie: String(renewed.headers["set-cookie"]).split(";")[0], "x-csrf-token": renewed.json().csrfToken };
    const fresh = await upload(png, digest(png), 2);
    expect(await cleanupDrawingQuarantine(connection.db, storage, () => now)).toEqual({ cleaned: 1 });
    expect(objects.has(old.key)).toBe(false); expect(objects.has(referenced.key)).toBe(true); expect(objects.has(finalized.key)).toBe(true); expect(objects.has(fresh.key)).toBe(true);
    expect((await pg.pool.query("select state from drawing_upload_intent where id=$1", [old.uploadId])).rows[0].state).toBe("cleaned");
    expect((await finalize(old.uploadId)).statusCode).toBe(409);
  });
  it("runs authenticated finalize and delivery through actual MinIO and clamd with a pinned test signature database", async () => {
    const minio = await new GenericContainer("minio/minio:RELEASE.2025-04-22T22-12-26Z").withEnvironment({ MINIO_ROOT_USER: "local-test-user", MINIO_ROOT_PASSWORD: "local-test-password-only" }).withCommand(["server", "/data"]).withExposedPorts(9000).withWaitStrategy(Wait.forHttp("/minio/health/ready", 9000)).start();
    const s3Config = { provider: "minio" as const, endpoint: `http://${minio.getHost()}:${minio.getMappedPort(9000)}`, bucket: "drawing-integration", region: "us-east-1", accessKeyId: "local-test-user", secretAccessKey: "local-test-password-only" };
    const client = new S3Client({ ...s3Config, credentials: s3Config, forcePathStyle: true });
    const adapter = createS3DrawingStorage(s3Config);
    let clamd: Awaited<ReturnType<GenericContainer["start"]>> | undefined;
    try {
      await client.send(new CreateBucketCommand({ Bucket: s3Config.bucket }));
      await client.send(new PutBucketVersioningCommand({ Bucket: s3Config.bucket, VersioningConfiguration: { Status: "Enabled" } }));
      clamd = await new GenericContainer("clamav/clamav:1.4.3_base").withPlatform("linux/amd64").withEntrypoint(["clamd"]).withCommand(["--foreground=true", "--config-file=/tmp/task7-clamd.conf"])
        .withCopyContentToContainer([
          { content: "DatabaseDirectory /tmp/task7-signatures\nTCPSocket 3310\nTCPAddr 0.0.0.0\nForeground yes\nLogTime no\nScanPE no\nScanELF no\nStreamMaxLength 21M\nMaxFileSize 21M\nMaxScanSize 64M\nAlertExceedsMax yes\n", target: "/tmp/task7-clamd.conf" },
          { content: "RufTask7Test:0:*:5255465f5441534b375f494e464543544544\n", target: "/tmp/task7-signatures/task7.ndb" },
        ]).withExposedPorts(3310).withWaitStrategy(Wait.forLogMessage("Self checking every" )).withStartupTimeout(120_000).start();
      realStorage = adapter; realScanner = createClamdScanner({ host: clamd.getHost(), port: clamd.getMappedPort(3310), timeoutMs: 5000 });
      expect(await realScanner.scan(Buffer.from("RUF_TASK7_INFECTED"))).toBe("infected");
      expect(await realScanner.scan(png)).toBe("clean");
      const clientPath = new URL("../../../src/features/diagram-mapping/drawing-api-client.ts", import.meta.url).href;
      const { createDrawingApiClient } = await import(clientPath);
      const browserFetch: typeof fetch = async (url, init) => {
        if (String(url).startsWith("http")) { expect(init?.credentials).toBe("omit"); expect(new Headers(init?.headers).has("x-csrf-token")).toBe(false); return fetch(url, init); }
        expect(String(url).startsWith("/api/v1/")).toBe(true); expect(init?.credentials).toBe("same-origin");
        const r = await app.inject({ method: (init?.method ?? "GET") as "POST" | "GET", url: String(url), headers: { origin, cookie: headers.cookie, ...Object.fromEntries(new Headers(init?.headers)) }, ...(init?.body ? { payload: String(init.body) } : {}) });
        return new Response(r.body, { status: r.statusCode });
      };
      const drawingClient = createDrawingApiClient({ csrfToken: headers["x-csrf-token"], fetch: browserFetch });
      const file = new File([new Uint8Array(png)], "frame.png", { type: "image/png" });
      const browserIntent = await drawingClient.createIntent(ids.figure, 1, file);
      await drawingClient.uploadFile(browserIntent, file);
      // Reuse the browser intent below, exercising its strict success envelopes.
      const attached = await drawingClient.finalize(ids.figure, browserIntent.uploadId, 1);
      const changed = await sharp({ create: { width: 3, height: 4, channels: 3, background: "red" } }).png().toBuffer();
      expect((await fetch(browserIntent.url, { method: "PUT", headers: browserIntent.headers, body: changed })).status).toBe(200);
      const delivered = await drawingClient.loadDrawing(ids.figure);
      const response = await fetch(delivered.url); expect(Buffer.from(await response.arrayBuffer())).toEqual(png);
      expect(response.headers.get("cache-control")).toBe("private, no-store");
      const infected = await sharp(png).withExif({ IFD0: { Copyright: "RUF_TASK7_INFECTED" } }).png().toBuffer();
      const infectedIntent = await requestIntent({ filename: "test.png", bytes: infected.length, sha256: digest(infected) }, 2); expect(infectedIntent.statusCode).toBe(201);
      await fetch(infectedIntent.json().url, { method: "PUT", headers: infectedIntent.json().headers, body: infected });
      expect((await finalize(infectedIntent.json().uploadId, 2)).statusCode).toBe(422);
      expect((await current()).drawing_file_id).toBe(attached.drawingFileId);
      await clamd.stop(); clamd = undefined;
      const next = await requestIntent(undefined, 2); expect(next.statusCode).toBe(201);
      await fetch(next.json().url, { method: "PUT", headers: next.json().headers, body: new Uint8Array(png) });
      expect((await finalize(next.json().uploadId, 2)).statusCode).toBe(503);
      expect((await current()).drawing_file_id).toBe(attached.drawingFileId);
    } finally { realStorage = undefined; realScanner = undefined; adapter.close(); client.destroy(); await clamd?.stop(); await minio.stop(); }
  }, 240_000);
});
