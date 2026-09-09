import { createHash, randomBytes, randomUUID } from "node:crypto";
import argon2 from "argon2";
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
} from "vitest";
import { buildApp } from "../../src/app.js";
import { createDatabase } from "../../src/db/client.js";
import { grantLocalRuntime } from "../../src/db/local-runtime-grants.js";
import { startPostgres } from "../helpers/postgres.js";
import { SOURCE_COLUMNS } from "../../src/modules/imports/parser.js";
import type { MappingDraftManifest } from "@rufdiamond/contracts";
import * as schema from "../../src/db/schema/index.js";
import { validateSnapshotReviews } from "../../src/modules/catalog-review/snapshot.js";
import { canonicalJsonHash } from "../../src/modules/outbox/idempotency.js";
const { importMappingDraft } = await import(
  new URL(
    "../../../../tools/callouts/import-mapping-drafts.ts",
    import.meta.url,
  ).href
);

const origin = "https://portal.example.test",
  passwordOptions = {
    type: argon2.argon2id,
    memoryCost: 2048,
    timeCost: 2,
    parallelism: 1,
  } as const;
const base = [
  "1",
  "P-1",
  "Bracket",
  "FT3",
  "Machine",
  "Frame",
  "1.1",
  "Frame plate",
  "2026-01-01",
  "",
  "2",
  "7",
  "0.00",
  "",
  "S",
  "",
];
const csv = (rows = [base]) =>
  Buffer.from(
    [SOURCE_COLUMNS, ...rows]
      .map((row) =>
        row.map((value) => `"${value.replaceAll('"', '""')}"`).join(","),
      )
      .join("\r\n"),
  );
const sha = (bytes: Buffer) => createHash("sha256").update(bytes).digest("hex");

describe("scoped canonical staged imports with non-owner runtime", () => {
  let pg: Awaited<ReturnType<typeof startPostgres>>,
    runtime: ReturnType<typeof createDatabase>,
    app: Awaited<ReturnType<typeof buildApp>>;
  let ids: Record<string, string>,
    headers: Record<string, string>,
    scan: "clean" | "infected" | "unavailable",
    writes: Map<string, Buffer>;
  const config = {
    nodeEnv: "test" as const,
    port: 0,
    databaseUrl: "postgres://unused",
    sessionSecret: "import-test-session-secret-long-enough",
    webOrigin: origin,
    allowInsecureLoopbackCookie: false,
    deliveryEncryption: {
      activeKeyId: "test",
      keys: { test: randomBytes(32).toString("base64") },
    },
    s3: {
      endpoint: "http://localhost:9000",
      region: "test",
      bucket: "test",
      accessKeyId: "test",
      secretAccessKey: "test",
    },
  };
  const stage = (
    bytes = csv(),
    overrides: Record<string, string> = {},
    version = 1,
    key = randomUUID(),
  ) =>
    app.inject({
      method: "POST",
      url: `/api/v1/admin/imports?${new URLSearchParams({ modelId: ids.model, variantId: ids.variant, filename: "synthetic.csv", format: "csv", sourceKind: "synthetic", lineageKey: "test-catalogue", sha256: sha(bytes), ...overrides })}`,
      headers: {
        ...headers,
        "content-type": "text/csv",
        "if-match": `"${version}"`,
        "idempotency-key": key,
      },
      payload: bytes,
    });
  const write = (
    id: string,
    operation: string,
    version: number,
    body = {},
    key = randomUUID(),
  ) =>
    app.inject({
      method: "POST",
      url: `/api/v1/admin/imports/${id}/${operation}`,
      headers: {
        ...headers,
        "if-match": `"${version}"`,
        "idempotency-key": key,
      },
      payload: body,
    });
  async function staged(bytes = csv(), version = 1) {
    const r = await stage(bytes, {}, version);
    expect(r.statusCode, r.body).toBe(201);
    return r.json();
  }
  async function applied(bytes = csv(), version = 1) {
    const job = await staged(bytes, version);
    const v = await write(job.id, "validate", job.version);
    expect(v.statusCode, v.body).toBe(200);
    const a = await write(job.id, "apply", v.json().version);
    expect(a.statusCode, a.body).toBe(200);
    return a.json();
  }
  beforeAll(async () => {
    pg = await startPostgres();
    await pg.migrate();
    const role = `ruf_local_${randomBytes(8).toString("hex")}`,
      password = randomBytes(32).toString("hex");
    await pg.pool.query(
      `CREATE ROLE "${role}" LOGIN PASSWORD '${password}' NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS`,
    );
    await grantLocalRuntime(pg.pool, role);
    const url = new URL(pg.connectionString);
    url.username = role;
    url.password = password;
    runtime = createDatabase(url.toString());
  }, 120000);
  beforeEach(async () => {
    await pg.pool.query(
      "truncate company,product_line,system,part,drawing_file,audit_log,outbox_event cascade",
    );
    ids = Object.fromEntries(
      ["line", "model", "variant", "company", "actor"].map((k) => [
        k,
        randomUUID(),
      ]),
    );
    scan = "clean";
    writes = new Map();
    await pg.pool.query(
      "insert into product_line(id,name,normalized_name) values($1,'truck','truck')",
      [ids.line],
    );
    await pg.pool.query(
      "insert into model(id,product_line_id,name) values($1,$2,'FT3')",
      [ids.model, ids.line],
    );
    await pg.pool.query(
      "insert into variant(id,model_id,label) values($1,$2,'Machine')",
      [ids.variant, ids.model],
    );
    await pg.pool.query(
      "insert into company(id,name,type) values($1,'Import team','internal')",
      [ids.company],
    );
    await pg.pool.query(
      "insert into app_user(id,company_id,name,login_id,email,password_hash,role_id) select $1,$2,'Importer','importer@example.test','importer@example.test',$3,id from role where key='catalog_admin'",
      [
        ids.actor,
        ids.company,
        await argon2.hash("test password", passwordOptions),
      ],
    );
    await pg.pool.query(
      "insert into user_capability(user_id,capability_key) values($1,'parts.import'),($1,'publish.draft.view') on conflict do nothing",
      [ids.actor],
    );
    await pg.pool.query(
      "insert into user_scope(user_id,brand_mode,account_mode,fleet_mode,environment) values($1,'all','all','all','published_and_draft')",
      [ids.actor],
    );
    app = await buildApp({
      config,
      dependencies: {
        database: runtime,
        passwordOptions,
        importScanner: { scan: async () => scan },
        importStorage: {
          async put(key, bytes) {
            writes.set(key, bytes);
            return { versionId: "version-1" };
          },
          async read(key) {
            const bytes = writes.get(key);
            if (!bytes) throw new Error("Missing source");
            return bytes;
          },
          async remove(key) {
            writes.delete(key);
          },
        },
      },
    });
    const login = await app.inject({
      method: "POST",
      url: "/api/v1/auth/sign-in",
      headers: { origin },
      payload: { loginId: "importer@example.test", password: "test password" },
    });
    expect(login.statusCode).toBe(200);
    headers = {
      origin,
      cookie: String(login.headers["set-cookie"]).split(";")[0],
      "x-csrf-token": login.json().csrfToken,
    };
  });
  afterEach(async () => {
    await app?.close();
  });
  afterAll(async () => {
    await runtime?.close();
    await pg?.stop();
  }, 30000);
  it("reviews a staged assembly reference explicitly before apply while preserving raw zero and invalid normalization", async () => {
    await pg.pool.query(
      "insert into user_capability(user_id,capability_key) values($1,'publish.execute'),($1,'catalog.figure.view'),($1,'catalog.callout.manage'),($1,'catalog.callout.map') on conflict do nothing",
      [ids.actor],
    );
    const raw = [...base];
    raw[1] = "ASSEMBLY-1";
    raw[2] = "Assembly reference";
    raw[10] = "0";
    raw[11] = "-";
    raw[15] = "Includes parts 1–18";
    const job = await staged(csv([raw]));
    const validated = await write(job.id, "validate", job.version);
    const url = `/api/v1/admin/catalog-review/imports/${job.id}`;
    const source = await app.inject({ method: "GET", url, headers });
    expect(source.statusCode, source.body).toBe(200);
    const review = source.json();
    const input = {
      decision: "assembly-reference-unspecified",
      confirmed: true,
      sourceBindingSha256: review.sourceBindingSha256,
      stagingRowId: review.rows[0].stagingRowId,
      stagingRowVersion: 1,
      issueId: review.issues[0].id,
      issueVersion: review.issues[0].version,
      evidence:
        "Synthetic manufacturer page 23: informational assembly, installed quantity unspecified, not a physical depiction.",
    };
    const key = randomUUID();
    const request = {
      method: "POST" as const,
      url: `${url}/quantity-decisions`,
      headers: {
        ...headers,
        "if-match": `"${validated.json().version}"`,
        "idempotency-key": key,
      },
      payload: input,
    };
    const decision = await app.inject(request);
    expect(decision.statusCode, decision.body).toBe(200);
    const replay = await app.inject(request);
    expect(replay.statusCode, replay.body).toBe(200);
    expect(replay.json()).toEqual(decision.json());
    expect(
      (
        await app.inject({
          ...request,
          payload: {
            ...input,
            evidence: "Changed decision evidence must not replay.",
          },
        })
      ).statusCode,
    ).toBe(409);
    const applied = await write(job.id, "apply", decision.json().version);
    expect(applied.statusCode, applied.body).toBe(200);
    const stored = (
      await pg.pool.query(
        "select source_payload, normalized_fields from import_staging_row where job_id=$1",
        [job.id],
      )
    ).rows[0];
    expect(stored.source_payload.QTY).toBe("0");
    expect(stored.normalized_fields).toMatchObject({
      normalizationState: "invalid",
      fields: null,
    });
    expect(
      (
        await pg.pool.query(
          "select qty,quantity_semantics,remarks from figure_part",
        )
      ).rows,
    ).toEqual([
      {
        qty: null,
        quantity_semantics: "unspecified-installed",
        remarks: "Includes parts 1–18",
      },
    ]);
    expect(applied.json().aliases[0]).toMatchObject({
      partNumber: "ASSEMBLY-1",
      refNo: "-",
      calloutId: null,
    });
    expect(
      (
        await pg.pool.query(
          "select actor_id,reviewer_name from import_quantity_review",
        )
      ).rows,
    ).toEqual([{ actor_id: ids.actor, reviewer_name: "Importer" }]);
    expect(
      (
        await pg.pool.query(
          "select count(*)::int n from outbox_event where event_type='catalog_source.quantity_reviewed'",
        )
      ).rows[0].n,
    ).toBe(1);
    await expect(
      runtime.pool.query(
        "update import_quantity_review set evidence='not allowed'",
      ),
    ).rejects.toMatchObject({ code: "42501" });
    await expect(
      pg.pool.query("update import_quantity_review set evidence='not allowed'"),
    ).rejects.toMatchObject({ code: "23514" });
    const canonical = await app.inject({
      method: "GET",
      url: `/api/v1/admin/catalog-review/figures/${applied.json().aliases[0].figureId}`,
      headers,
    });
    expect(canonical.statusCode, canonical.body).toBe(200);
    expect(canonical.json().approvals).toEqual([
      expect.objectContaining({
        mode: "assembly-reference-unspecified",
        reviewerId: ids.actor,
        current: true,
      }),
    ]);
  });
  it("publishes only exact reviewed table-only rows with retained printed references and immutable source provenance", async () => {
    await pg.pool.query(
      "insert into user_capability(user_id,capability_key) values($1,'publish.execute'),($1,'publish.rollback') on conflict do nothing",
      [ids.actor],
    );
    const first = [...base];
    first[11] = "1";
    first[3] = "ft3";
    first[4] = "machine";
    first[5] = "FRAME";
    const second = [...base];
    second[0] = "2";
    second[1] = "P-2";
    second[11] = "3";
    const job = await applied(csv([first, second]));
    const figureId = job.aliases[0].figureId,
      url = `/api/v1/admin/catalog-review/figures/${figureId}`;
    const current = await app.inject({ method: "GET", url, headers });
    expect(current.statusCode, current.body).toBe(200);
    const source = current.json(),
      payload = {
        mode: "table-only",
        sourceBindingSha256: source.sourceBindingSha256,
        rowIds: source.rows.map(
          (r: { figurePartId: string }) => r.figurePartId,
        ),
        evidence:
          "Synthetic manufacturer page 31 confirms exactly these table-only rows.",
        confirmed: true,
      };
    const partial = await app.inject({
      method: "POST",
      url: `${url}/decisions`,
      headers: {
        ...headers,
        "if-match": `"${source.version}"`,
        "idempotency-key": randomUUID(),
      },
      payload: { ...payload, rowIds: payload.rowIds.slice(0, 1) },
    });
    expect(partial.statusCode, partial.body).toBe(422);
    const decision = await app.inject({
      method: "POST",
      url: `${url}/decisions`,
      headers: {
        ...headers,
        "if-match": `"${source.version}"`,
        "idempotency-key": randomUUID(),
      },
      payload,
    });
    expect(decision.statusCode, decision.body).toBe(200);
    const publication = await app.inject({
      method: "POST",
      url: "/api/v1/admin/publication/releases",
      headers: { ...headers, "idempotency-key": randomUUID() },
      payload: {
        modelId: ids.model,
        expectedWorkingVersion: 2,
        expectedPublicationVersion: 1,
        summary: "Synthetic table-only release",
      },
    });
    expect(publication.statusCode, publication.body).toBe(201);
    const customer = await app.inject({
      method: "GET",
      url: `/api/v1/catalog/figures/${figureId}`,
      headers,
    });
    expect(customer.statusCode, customer.body).toBe(200);
    expect(customer.json()).toMatchObject({
      figure: { depictionMode: "table-only", drawingFileId: null },
      drawing: null,
      mapping: null,
      callouts: [],
    });
    expect(
      customer
        .json()
        .rows.flatMap((r: { calloutNumbers: string[] }) => r.calloutNumbers)
        .sort(),
    ).toEqual(["1", "3"]);
    const navigation = await app.inject({
      method: "GET",
      url: `/api/v1/catalog/variants/${ids.variant}/systems/${(await pg.pool.query("select system_id from figure where id=$1", [figureId])).rows[0].system_id}/figures`,
      headers,
    });
    expect(navigation.statusCode, navigation.body).toBe(200);
    expect(navigation.json().items[0]).toMatchObject({
      id: figureId,
      depictionMode: "table-only",
      drawingFileId: null,
    });
    const sealed = (
      await pg.pool.query("select provenance from release_depiction_review")
    ).rows;
    expect(sealed).toHaveLength(1);
    expect(sealed[0].provenance).toMatchObject({
      reviewerId: ids.actor,
      reviewerName: "Importer",
      evidence: payload.evidence,
    });
    const snapshotFigures = await runtime.db
        .select()
        .from(schema.releaseFigure),
      snapshotRows = await runtime.db.select().from(schema.releaseFigurePart),
      snapshotReviews = await runtime.db
        .select()
        .from(schema.releaseDepictionReview),
      snapshotRefs = await runtime.db
        .select()
        .from(schema.releaseSourceReference);
    expect(() =>
      validateSnapshotReviews(
        snapshotFigures,
        snapshotRows,
        snapshotReviews,
        snapshotRefs,
      ),
    ).not.toThrow();
    expect(() =>
      validateSnapshotReviews(snapshotFigures, snapshotRows, [], snapshotRefs),
    ).toThrow();
    expect(() =>
      validateSnapshotReviews(
        snapshotFigures,
        snapshotRows,
        snapshotReviews,
        snapshotRefs.slice(1),
      ),
    ).toThrow();
    const forged = structuredClone(snapshotReviews);
    forged[0].provenance.rowIds = [];
    forged[0].checksum = canonicalJsonHash({
      provenance: forged[0].provenance,
      rowIds: forged[0].rowIds,
    });
    expect(() =>
      validateSnapshotReviews(
        snapshotFigures,
        snapshotRows,
        forged,
        snapshotRefs,
      ),
    ).toThrow();
    const secondRelease = await app.inject({
      method: "POST",
      url: "/api/v1/admin/publication/releases",
      headers: { ...headers, "idempotency-key": randomUUID() },
      payload: {
        modelId: ids.model,
        expectedWorkingVersion: 2,
        expectedPublicationVersion: 2,
        summary: "Synthetic second release",
      },
    });
    expect(secondRelease.statusCode, secondRelease.body).toBe(201);
    const rollback = await app.inject({
      method: "POST",
      url: `/api/v1/admin/publication/releases/${publication.json().releaseId}/rollback`,
      headers: { ...headers, "idempotency-key": randomUUID() },
      payload: {
        expectedPublicationVersion: 3,
        expectedActiveReleaseId: secondRelease.json().releaseId,
      },
    });
    expect(rollback.statusCode, rollback.body).toBe(200);
    expect(
      (
        await app.inject({
          method: "GET",
          url: `/api/v1/catalog/figures/${figureId}`,
          headers,
        })
      ).json(),
    ).toEqual(customer.json());
    await pg.pool.query(
      "update figure_part set remarks='Later draft change',version=version+1",
    );
    expect(
      (
        await app.inject({
          method: "GET",
          url: `/api/v1/catalog/figures/${figureId}`,
          headers,
        })
      ).json(),
    ).toEqual(customer.json());
    await expect(
      runtime.pool.query("delete from release_depiction_review"),
    ).rejects.toMatchObject({ code: "42501" });
    await expect(
      pg.pool.query("update release_depiction_review set provenance='{}'"),
    ).rejects.toMatchObject({ code: "23514" });
  });
  it("stales an assembly decision on first drawing attachment and requires exact combined re-review before mapping publication", async () => {
    await pg.pool.query(
      "insert into user_capability(user_id,capability_key) values($1,'publish.execute') on conflict do nothing",
      [ids.actor],
    );
    const raw = [...base];
    raw[1] = "ASSEMBLY-1";
    raw[2] = "Informational assembly";
    raw[10] = "0";
    raw[11] = "-";
    raw[15] = "Includes parts 1–18";
    const notShown = [...base];
    notShown[1] = "P-NOT-SHOWN";
    notShown[11] = "34";
    notShown[15] = "NOT SHOWN";
    const job = await staged(csv([raw, base, notShown]));
    await write(job.id, "validate", job.version);
    const qurl = `/api/v1/admin/catalog-review/imports/${job.id}`,
      qr = (await app.inject({ method: "GET", url: qurl, headers })).json(),
      qrow = qr.rows.find(
        (r: { partNumber: string }) => r.partNumber === "ASSEMBLY-1",
      ),
      qissue = qr.issues.find(
        (i: { stagingRowId: string }) => i.stagingRowId === qrow.stagingRowId,
      );
    const approved = await app.inject({
      method: "POST",
      url: `${qurl}/quantity-decisions`,
      headers: {
        ...headers,
        "if-match": `"${qr.version}"`,
        "idempotency-key": randomUUID(),
      },
      payload: {
        decision: "assembly-reference-unspecified",
        confirmed: true,
        sourceBindingSha256: qr.sourceBindingSha256,
        stagingRowId: qrow.stagingRowId,
        stagingRowVersion: 1,
        issueId: qissue.id,
        issueVersion: qissue.version,
        evidence:
          "Synthetic assembly row is informational, not depicted, and installed quantity is unspecified.",
      },
    });
    expect(approved.statusCode, approved.body).toBe(200);
    const appliedJob = await write(job.id, "apply", approved.json().version);
    expect(appliedJob.statusCode, appliedJob.body).toBe(200);
    const aliases = appliedJob.json().aliases,
      figureId = aliases[0].figureId,
      assemblyId = aliases.find(
        (a: { partNumber: string }) => a.partNumber === "ASSEMBLY-1",
      ).figurePartId,
      url = `/api/v1/admin/catalog-review/figures/${figureId}`;
    const drawing = randomUUID();
    await pg.pool.query(
      "insert into drawing_file(id,object_key,filename,media_type,bytes,sha256,width,height,object_version_id,validation_status) values($1,$2,'synthetic.png','image/png',100,$3,100,100,'v1','valid')",
      [drawing, `synthetic/${drawing}`, "a".repeat(64)],
    );
    await pg.pool.query(
      "update figure set drawing_file_id=$1,version=version+1 where id=$2",
      [drawing, figureId],
    );
    const current = (await app.inject({ method: "GET", url, headers })).json();
    expect(current.sourceConflict).toBe(true);
    expect(current.approvals[0].current).toBe(false);
    const publish = () =>
      app.inject({
        method: "POST",
        url: "/api/v1/admin/publication/releases",
        headers: { ...headers, "idempotency-key": randomUUID() },
        payload: {
          modelId: ids.model,
          expectedWorkingVersion: 2,
          expectedPublicationVersion: 1,
          summary: "Synthetic physical and nondepicted rows",
        },
      });
    expect((await publish()).statusCode).toBe(422);
    const decisionId = approved.json().approvals[0].decisionId;
    const body = {
      mode: "assembly-reference-unspecified",
      confirmed: true,
      rowIds: [assemblyId],
      quantityDecisionId: decisionId,
      sourceBindingSha256: current.sourceBindingSha256,
      evidence:
        "Synthetic first drawing reviewed: same assembly reference has unspecified installed quantity and is not depicted.",
    };
    const req = {
      method: "POST" as const,
      url: `${url}/decisions`,
      headers: {
        ...headers,
        "if-match": `"${current.version}"`,
        "idempotency-key": randomUUID(),
      },
      payload: body,
    };
    const foreign = await app.inject({
      ...req,
      payload: { ...body, quantityDecisionId: randomUUID() },
    });
    expect(foreign.statusCode, foreign.body).toBe(422);
    const ordinary = await app.inject({
      ...req,
      headers: { ...req.headers, "idempotency-key": randomUUID() },
      payload: {
        ...body,
        rowIds: [
          aliases.find((a: { partNumber: string }) => a.partNumber === "P-1")
            .figurePartId,
        ],
      },
    });
    expect(ordinary.statusCode, ordinary.body).toBe(422);
    await pg.pool.query(
      "update import_issue set version=version+1 where id=$1",
      [qissue.id],
    );
    expect(
      (
        await app.inject({
          ...req,
          headers: { ...req.headers, "idempotency-key": randomUUID() },
        })
      ).statusCode,
    ).toBe(422);
    await pg.pool.query(
      "update import_issue set version=version-1 where id=$1",
      [qissue.id],
    );
    const reapproved = await app.inject({
      ...req,
      headers: { ...req.headers, "idempotency-key": randomUUID() },
    });
    expect(reapproved.statusCode, reapproved.body).toBe(200);
    const notDepicted = await app.inject({
      ...req,
      headers: {
        ...headers,
        "if-match": `"${reapproved.json().version}"`,
        "idempotency-key": randomUUID(),
      },
      payload: {
        mode: "not-depicted",
        confirmed: true,
        rowIds: [
          aliases.find(
            (a: { partNumber: string }) => a.partNumber === "P-NOT-SHOWN",
          ).figurePartId,
        ],
        sourceBindingSha256: current.sourceBindingSha256,
        evidence:
          "Synthetic manufacturer explicitly marks reference34 NOT SHOWN.",
      },
    });
    expect(notDepicted.statusCode, notDepicted.body).toBe(200);
    const murl = `/api/v1/admin/figures/${figureId}/diagram-mapping`,
      mapping = await app.inject({ method: "GET", url: murl, headers });
    expect(mapping.statusCode, mapping.body).toBe(200);
    const document = mapping.json().document;
    expect(document.occurrences.map((o: { refNo: string }) => o.refNo)).toEqual(
      ["7"],
    );
    document.occurrences[0] = {
      ...document.occurrences[0],
      labelRegion: { x: 1, y: 1, width: 4, height: 4 },
      regions: [
        {
          id: "physical",
          outer: [
            [10, 10],
            [30, 10],
            [30, 30],
          ],
          holes: [],
        },
      ],
      evidence: "Synthetic visible bracket exact source",
    };
    const saved = await app.inject({
      method: "PUT",
      url: murl,
      headers: {
        ...headers,
        "if-match": '"1"',
        "idempotency-key": randomUUID(),
      },
      payload: { document },
    });
    expect(saved.statusCode, saved.body).toBe(200);
    const approvedMapping = await app.inject({
      method: "POST",
      url: `${murl}/approve`,
      headers: {
        ...headers,
        "if-match": `"${saved.json().version}"`,
        "idempotency-key": randomUUID(),
      },
      payload: {
        revisionId: saved.json().revisionId,
        checksum: saved.json().checksum,
      },
    });
    expect(approvedMapping.statusCode, approvedMapping.body).toBe(200);
    const published = await publish();
    expect(published.statusCode, published.body).toBe(201);
    const customer = await app.inject({
      method: "GET",
      url: `/api/v1/catalog/figures/${figureId}`,
      headers,
    });
    expect(customer.statusCode, customer.body).toBe(200);
    expect(
      customer.json().callouts.map((c: { number: string }) => c.number),
    ).toEqual(["7"]);
    expect(
      customer
        .json()
        .sourceReferences.map((r: { number: string }) => r.number)
        .sort(),
    ).toEqual(["-", "34"]);
    expect(
      customer
        .json()
        .rows.find(
          (r: { figurePart: { id: string } }) => r.figurePart.id === assemblyId,
        ).figurePart,
    ).toMatchObject({ qty: null, quantitySemantics: "unspecified-installed" });
  });
  it.each(["description", "row-identity", "reference", "missing-alias"])(
    "does not use a fresh depiction decision to waive changed canonical source fields: %s",
    async (kind) => {
      await pg.pool.query(
        "insert into user_capability(user_id,capability_key) values($1,'publish.execute') on conflict do nothing",
        [ids.actor],
      );
      const job = await applied(),
        figureId = job.aliases[0].figureId;
      if (kind === "description")
        await pg.pool.query(
          "update part set description='Conflicting draft identity',version=version+1",
        );
      if (kind === "row-identity")
        await pg.pool.query(
          "update figure_part set source_row_key='foreign-key',version=version+1",
        );
      if (kind === "reference")
        await pg.pool.query("update callout set number='99',version=version+1");
      if (kind === "missing-alias")
        await pg.pool.query(
          "update import_job set state='validated' where id=$1",
          [job.id],
        );
      const url = `/api/v1/admin/catalog-review/figures/${figureId}`,
        source = (await app.inject({ method: "GET", url, headers })).json();
      const result = await app.inject({
        method: "POST",
        url: `${url}/decisions`,
        headers: {
          ...headers,
          "if-match": `"${source.version}"`,
          "idempotency-key": randomUUID(),
        },
        payload: {
          mode: "table-only",
          confirmed: true,
          sourceBindingSha256: source.sourceBindingSha256,
          rowIds: [job.aliases[0].figurePartId],
          evidence:
            "Synthetic depiction claim cannot reconcile conflicting canonical source fields.",
        },
      });
      expect(result.statusCode, result.body).toBe(422);
    },
  );
  it("does not exempt unresolved source-only observations with a table-only decision", async () => {
    await pg.pool.query(
      "insert into user_capability(user_id,capability_key) values($1,'publish.execute') on conflict do nothing",
      [ids.actor],
    );
    const job = await applied(),
      figureId = job.aliases[0].figureId;
    await pg.pool.query(
      "insert into callout(figure_id,source_key,number) values($1,'unresolved','99')",
      [figureId],
    );
    const url = `/api/v1/admin/catalog-review/figures/${figureId}`,
      source = (await app.inject({ method: "GET", url, headers })).json();
    expect(source).toMatchObject({
      sourceConflict: true,
      issues: [
        {
          code: "SOURCE_OBSERVATION_UNRESOLVED",
          message: expect.stringContaining("99"),
        },
      ],
    });
    const result = await app.inject({
      method: "POST",
      url: `${url}/decisions`,
      headers: {
        ...headers,
        "if-match": `"${source.version}"`,
        "idempotency-key": randomUUID(),
      },
      payload: {
        mode: "table-only",
        confirmed: true,
        sourceBindingSha256: source.sourceBindingSha256,
        rowIds: source.rows.map(
          (r: { figurePartId: string }) => r.figurePartId,
        ),
        evidence:
          "Synthetic table-only claim cannot discard unresolved source99.",
      },
    });
    expect(result.statusCode, result.body).toBe(422);
    expect(
      (
        await pg.pool.query(
          "select count(*)::int n from catalog_depiction_review",
        )
      ).rows[0].n,
    ).toBe(0);
  });
  it("enforces source review preconditions, reviewer authority, exact source and one-writer concurrency", async () => {
    const job = await applied(),
      figureId = job.aliases[0].figureId,
      url = `/api/v1/admin/catalog-review/figures/${figureId}`;
    const source = (await app.inject({ method: "GET", url, headers })).json();
    expect(source.canReview).toBe(false);
    const payload = {
      mode: "table-only",
      confirmed: true,
      sourceBindingSha256: source.sourceBindingSha256,
      rowIds: source.rows.map((r: { figurePartId: string }) => r.figurePartId),
      evidence: "Synthetic exact table-only source rows reviewed.",
    };
    const req = {
      method: "POST" as const,
      url: `${url}/decisions`,
      headers: {
        ...headers,
        "if-match": `"${source.version}"`,
        "idempotency-key": randomUUID(),
      },
      payload,
    };
    expect((await app.inject(req)).statusCode).toBe(403);
    await pg.pool.query(
      "insert into user_capability(user_id,capability_key) values($1,'publish.execute')",
      [ids.actor],
    );
    expect(
      (
        await app.inject({
          ...req,
          headers: { ...headers, "idempotency-key": randomUUID() },
        })
      ).statusCode,
    ).toBe(428);
    expect(
      (
        await app.inject({
          ...req,
          payload: { ...payload, reviewerId: ids.actor },
        })
      ).statusCode,
    ).toBe(400);
    expect(
      (
        await app.inject({
          ...req,
          payload: { ...payload, sourceBindingSha256: "b".repeat(64) },
        })
      ).statusCode,
    ).toBe(409);
    await pg.pool.query("update app_user set name='' where id=$1", [ids.actor]);
    expect((await app.inject(req)).statusCode).toBe(403);
    await pg.pool.query("update app_user set name='Importer' where id=$1", [
      ids.actor,
    ]);
    const results = await Promise.all([
      app.inject(req),
      app.inject({
        ...req,
        headers: { ...req.headers, "idempotency-key": randomUUID() },
      }),
    ]);
    expect(results.map((r) => r.statusCode).sort()).toEqual([200, 412]);
    expect(
      (
        await pg.pool.query(
          "select count(*)::int n from catalog_depiction_review",
        )
      ).rows[0].n,
    ).toBe(1);
    expect(
      (
        await pg.pool.query(
          "select count(*)::int n from outbox_event where event_type='catalog_source.depiction_reviewed'",
        )
      ).rows[0].n,
    ).toBe(1);
    await pg.pool.query(
      "delete from user_capability where user_id=$1 and capability_key='publish.execute'",
      [ids.actor],
    );
    const revoked = (await app.inject({ method: "GET", url, headers })).json();
    expect(revoked.approvals[0].current).toBe(false);
    await pg.pool.query(
      "update user_scope set brand_mode='subset' where user_id=$1",
      [ids.actor],
    );
    expect((await app.inject({ method: "GET", url, headers })).statusCode).toBe(
      404,
    );
  }, 15000);
  it.each(["ordinary-zero", "other-invalid-field", "global-conflict"])(
    "does not interpret %s as an assembly exemption",
    async (kind) => {
      await pg.pool.query(
        "insert into user_capability(user_id,capability_key) values($1,'publish.execute') on conflict do nothing",
        [ids.actor],
      );
      const raw = [...base];
      raw[10] = "0";
      raw[11] = kind === "ordinary-zero" ? "7" : "-";
      if (kind === "other-invalid-field") raw[14] = "?";
      const second = [...base];
      second[2] = "Conflicting global part description";
      const job = await staged(
        csv(kind === "global-conflict" ? [raw, second] : [raw]),
      );
      await write(job.id, "validate", job.version);
      const url = `/api/v1/admin/catalog-review/imports/${job.id}`,
        current = (await app.inject({ method: "GET", url, headers })).json();
      const row = current.rows[0],
        issue = current.issues.find(
          (i: { stagingRowId: string; field: string }) =>
            i.stagingRowId === row.stagingRowId && i.field === "QTY",
        );
      const result = await app.inject({
        method: "POST",
        url: `${url}/quantity-decisions`,
        headers: {
          ...headers,
          "if-match": `"${current.version}"`,
          "idempotency-key": randomUUID(),
        },
        payload: {
          decision: "assembly-reference-unspecified",
          confirmed: true,
          sourceBindingSha256: current.sourceBindingSha256,
          stagingRowId: row.stagingRowId,
          stagingRowVersion: row.stagingRowVersion,
          issueId: issue.id,
          issueVersion: issue.version,
          evidence:
            "Synthetic claim must never mask other invalid source fields or identities.",
        },
      });
      expect(result.statusCode, result.body).toBe(422);
      expect(
        (
          await pg.pool.query(
            "select count(*)::int n from import_quantity_review",
          )
        ).rows[0].n,
      ).toBe(0);
    },
  );
  it("checks stale quantity issues and rolls reviewed apply back atomically on outbox failure", async () => {
    await pg.pool.query(
      "insert into user_capability(user_id,capability_key) values($1,'publish.execute') on conflict do nothing",
      [ids.actor],
    );
    const raw = [...base];
    raw[10] = "0";
    raw[11] = "-";
    const job = await staged(csv([raw]));
    await write(job.id, "validate", job.version);
    const url = `/api/v1/admin/catalog-review/imports/${job.id}`,
      current = (await app.inject({ method: "GET", url, headers })).json(),
      row = current.rows[0],
      issue = current.issues[0];
    const request = {
      method: "POST" as const,
      url: `${url}/quantity-decisions`,
      headers: {
        ...headers,
        "if-match": `"${current.version}"`,
        "idempotency-key": randomUUID(),
      },
      payload: {
        decision: "assembly-reference-unspecified",
        confirmed: true,
        sourceBindingSha256: current.sourceBindingSha256,
        stagingRowId: row.stagingRowId,
        stagingRowVersion: row.stagingRowVersion,
        issueId: issue.id,
        issueVersion: issue.version,
        evidence:
          "Synthetic informational assembly: not depicted, installed quantity unspecified.",
      },
    };
    expect(
      (
        await app.inject({
          ...request,
          payload: { ...request.payload, issueVersion: issue.version + 1 },
        })
      ).statusCode,
    ).toBe(412);
    const approved = await app.inject(request);
    expect(approved.statusCode, approved.body).toBe(200);
    const [storageKey, originalBytes] = [...writes.entries()][0];
    writes.set(storageKey, Buffer.from("changed private source bytes"));
    expect(
      (await write(job.id, "apply", approved.json().version)).statusCode,
    ).toBe(409);
    writes.set(storageKey, originalBytes);
    const counts = await pg.pool.query(
      "select (select count(*) from audit_log)::int audits,(select count(*) from outbox_event)::int events",
    );
    await pg.pool.query(
      "create function fail_source_apply() returns trigger language plpgsql as $$ begin if NEW.event_type='import.applied' then raise exception 'synthetic apply failure'; end if; return NEW; end $$",
    );
    await pg.pool.query(
      "create trigger fail_source_apply before insert on outbox_event for each row execute function fail_source_apply()",
    );
    try {
      const result = await write(job.id, "apply", approved.json().version);
      expect(result.statusCode).toBe(500);
      expect(
        (await pg.pool.query("select count(*)::int n from figure_part")).rows[0]
          .n,
      ).toBe(0);
      expect(
        (
          await pg.pool.query(
            "select count(*)::int n from catalog_depiction_review",
          )
        ).rows[0].n,
      ).toBe(0);
      expect(
        (
          await pg.pool.query(
            "select state,version from import_job where id=$1",
            [job.id],
          )
        ).rows[0],
      ).toEqual({ state: "validated", version: approved.json().version });
      expect(
        (
          await pg.pool.query(
            "select (select count(*) from audit_log)::int audits,(select count(*) from outbox_event)::int events",
          )
        ).rows,
      ).toEqual(counts.rows);
    } finally {
      await pg.pool.query("drop trigger fail_source_apply on outbox_event");
      await pg.pool.query("drop function fail_source_apply()");
    }
    expect(
      (await write(job.id, "apply", approved.json().version)).statusCode,
    ).toBe(200);
  }, 15000);
  it("stages exact immutable raw bytes and applies a draft graph with null coordinates and heads", async () => {
    const job = await applied();
    expect(job).toMatchObject({ state: "applied", blockingIssueCount: 0 });
    const rows = (
      await pg.pool.query(
        "select fp.qty,c.x,c.y,p.list_price,dm.version from figure_part fp join part p on p.id=fp.part_id join callout c on c.figure_part_id=fp.id join diagram_mapping dm on dm.figure_id=fp.figure_id",
      )
    ).rows;
    expect(rows).toEqual([
      { qty: 2, x: null, y: null, list_price: "0.00", version: 1 },
    ]);
    const stored = (
      await pg.pool.query("select source_payload from import_staging_row")
    ).rows[0].source_payload;
    expect(stored["No."]).toBe("1");
    expect(stored["S/NS"]).toBe("S");
    expect(
      (await pg.pool.query("select count(*)::int n from import_source_alias"))
        .rows[0].n,
    ).toBe(1);
    expect(
      (await pg.pool.query("select count(*)::int n from publication_release"))
        .rows[0].n,
    ).toBe(0);
    expect(writes.size).toBe(1);
  });
  it("makes identical stage/apply replay idempotent and rejects changed metadata", async () => {
    const key = randomUUID(),
      first = await stage(csv(), {}, 1, key);
    expect(first.statusCode).toBe(201);
    const second = await stage(csv(), {}, 1, key);
    expect(second.json()).toEqual(first.json());
    expect(
      (await stage(csv(), { sourceKind: "workbook" }, 1, key)).statusCode,
    ).toBe(409);
    const v = await write(first.json().id, "validate", 1);
    expect(v.statusCode, v.body).toBe(200);
    const applyKey = randomUUID();
    const a = await write(
      first.json().id,
      "apply",
      v.json().version,
      {},
      applyKey,
    );
    expect(a.statusCode, a.body).toBe(200);
    expect(
      (
        await write(first.json().id, "apply", v.json().version, {}, applyKey)
      ).json(),
    ).toEqual(a.json());
    expect(
      (await pg.pool.query("select count(*)::int n from figure_part")).rows[0]
        .n,
    ).toBe(1);
  });
  it("has one writer for stale simultaneous validation and rejects stale issue review", async () => {
    const job = await staged(csv([base, base]));
    const results = await Promise.all([
      write(job.id, "validate", 1),
      write(job.id, "validate", 1),
    ]);
    expect(results.map((r) => r.statusCode).sort()).toEqual([200, 412]);
    const read = await app.inject({
      url: `/api/v1/admin/imports/${job.id}`,
      headers,
    });
    const issue = read.json().issues[0];
    const review = (version: number) =>
      app.inject({
        method: "PATCH",
        url: `/api/v1/admin/imports/${job.id}/issues/${issue.id}`,
        headers: {
          ...headers,
          "if-match": `"${version}"`,
          "idempotency-key": randomUUID(),
        },
        payload: {
          decision: "source-correction-required",
          evidence:
            "Duplicate source occurrences require source author clarification.",
        },
      });
    expect((await review(issue.version)).statusCode).toBe(200);
    expect((await review(issue.version)).statusCode).toBe(412);
    const current = await app.inject({
      url: `/api/v1/admin/imports/${job.id}`,
      headers,
    });
    expect(current.json().blockingIssueCount).toBe(2);
    expect(
      (await write(job.id, "apply", current.json().version)).statusCode,
    ).toBe(409);
  });
  it("preserves all duplicate observations with blockers and does not last-row-win global descriptions", async () => {
    const bytes = csv([
      base,
      base.map((x, i) => (i === 0 ? "2" : i === 2 ? "Conflicting bracket" : x)),
    ]);
    const job = await staged(bytes);
    const validation = await write(job.id, "validate", job.version);
    expect(validation.statusCode, validation.body).toBe(200);
    expect(validation.json().blockingIssueCount).toBeGreaterThan(0);
    expect(
      (await pg.pool.query("select count(*)::int n from import_staging_row"))
        .rows[0].n,
    ).toBe(2);
    expect(
      (await write(job.id, "apply", validation.json().version)).statusCode,
    ).toBe(409);
  });
  it("retains invalid raw zero quantity in PostgreSQL without a plausible normalized fallback", async () => {
    const job = await staged(csv([base.map((x, i) => (i === 10 ? "0" : x))]));
    expect(job).toMatchObject({
      rowCount: 1,
      validRowCount: 0,
      blockingIssueCount: 1,
    });
    const stored = (
      await pg.pool.query(
        "select source_payload,normalized_fields from import_staging_row",
      )
    ).rows[0];
    expect(stored.source_payload.QTY).toBe("0");
    expect(stored.normalized_fields).toMatchObject({
      normalizationState: "invalid",
      fields: null,
    });
    await expect(
      pg.pool.query("update import_staging_row set normalized_fields='{}'"),
    ).rejects.toMatchObject({ code: "23514" });
    await expect(
      pg.pool.query(
        "update import_job set source_kind=null,lineage_key=null,format=null,source_bytes=null",
      ),
    ).rejects.toMatchObject({ code: "23514" });
  });
  it("rejects source hash mismatch, scanner outage/infection, foreign target and wrong model labels", async () => {
    expect((await stage(csv(), { sha256: "a".repeat(64) })).statusCode).toBe(
      422,
    );
    scan = "unavailable";
    expect((await stage()).statusCode).toBe(503);
    scan = "infected";
    expect((await stage()).statusCode).toBe(422);
    scan = "clean";
    expect((await stage(csv(), { variantId: randomUUID() })).statusCode).toBe(
      404,
    );
    const wrong = await staged(
      csv([base.map((x, i) => (i === 3 ? "Unknown model" : x))]),
    );
    const v = await write(wrong.id, "validate", 1);
    expect(v.json().blockingIssueCount).toBeGreaterThan(0);
    expect(writes.size).toBe(1);
  });
  it("denies sensitive reads and uploads after scope revocation with no source storage access", async () => {
    const job = await staged();
    await pg.pool.query(
      "update user_scope set fleet_mode='subset',version=version+1 where user_id=$1",
      [ids.actor],
    );
    expect(
      (await app.inject({ url: `/api/v1/admin/imports/${job.id}`, headers }))
        .statusCode,
    ).toBe(404);
    expect((await stage()).statusCode).toBe(404);
    expect(writes.size).toBe(1);
  });
  it("requires authentication, CSRF, exact metadata and preconditions", async () => {
    expect(
      (
        await app.inject({
          method: "POST",
          url: "/api/v1/admin/imports",
          payload: "secret",
        })
      ).statusCode,
    ).toBe(401);
    const original = headers;
    headers = { ...headers, "x-csrf-token": "wrong" };
    expect((await stage()).statusCode).toBe(403);
    headers = original;
    expect((await stage(csv(), { unexpected: "value" })).statusCode).toBe(400);
    expect((await stage(csv(), {}, 99)).statusCode).toBe(412);
    expect(writes.size).toBe(0);
  });
  it("rejects a new lineage colliding with existing figure identity and reports raw group/name collisions", async () => {
    await applied();
    const bytes = csv([base.map((x, i) => (i === 0 ? "2" : x))]);
    const stageResponse = await stage(
      bytes,
      { lineageKey: "different-lineage" },
      2,
    );
    expect(stageResponse.statusCode).toBe(201);
    const job = stageResponse.json();
    const v = await write(job.id, "validate", 1);
    expect(
      v
        .json()
        .issues.some(
          (i: { code: string }) => i.code === "FIGURE_LINEAGE_CONFLICT",
        ),
    ).toBe(true);
    const collision = await staged(
      csv([
        base,
        base.map((x, i) => (i === 1 ? "P-2" : i === 7 ? "Different plate" : x)),
      ]),
      2,
    );
    const result = await write(collision.id, "validate", 1);
    expect(
      result
        .json()
        .issues.filter(
          (i: { code: string }) => i.code === "GROUP_LABEL_CONFLICT",
        ),
    ).toHaveLength(2);
  });
  it("has one apply writer and preserves pending required-part hints without global overwrite", async () => {
    const job = await staged(
      csv([
        base.map((x, i) => (i === 15 ? "Requires P-2 (QTY 3)" : x)),
        base.map((x, i) =>
          i === 0
            ? "2"
            : i === 11
              ? "8"
              : i === 15
                ? "Requires P-2 (QTY 3)"
                : x,
        ),
        base.map((x, i) =>
          i === 0 ? "3" : i === 1 ? "P-2" : i === 11 ? "9" : x,
        ),
      ]),
    );
    const v = await write(job.id, "validate", 1);
    expect(v.json().blockingIssueCount).toBe(0);
    const responses = await Promise.all([
      write(job.id, "apply", v.json().version),
      write(job.id, "apply", v.json().version),
    ]);
    expect(responses.map((r) => r.statusCode).sort()).toEqual([200, 412]);
    expect(
      (
        await pg.pool.query(
          "select qty,review_state,reviewed_by_user_id from part_requires",
        )
      ).rows,
    ).toEqual([{ qty: 3, review_state: "pending", reviewed_by_user_id: null }]);
  });
  it.each([
    [3, 4],
    [4, 3],
  ])(
    "blocks conflicting new required-edge quantities %i then %i without losing either source hint",
    async (firstQty, secondQty) => {
      const job = await staged(
        csv([
          base.map((x, i) => (i === 15 ? `Requires P-2 (QTY ${firstQty})` : x)),
          base.map((x, i) =>
            i === 0
              ? "2"
              : i === 11
                ? "8"
                : i === 15
                  ? `Requires P-2 (QTY ${secondQty})`
                  : x,
          ),
          base.map((x, i) =>
            i === 0 ? "3" : i === 1 ? "P-2" : i === 11 ? "9" : x,
          ),
        ]),
      );
      expect(job).toMatchObject({
        rowCount: 3,
        validRowCount: 3,
        blockingIssueCount: 0,
      });
      const validation = await write(job.id, "validate", job.version);
      expect(validation.statusCode, validation.body).toBe(200);
      expect
        .soft(
          validation
            .json()
            .issues.filter(
              (issue: { code: string }) =>
                issue.code === "GLOBAL_RELATIONSHIP_CONFLICT",
            ),
        )
        .toHaveLength(2);
      expect
        .soft(
          (await write(job.id, "apply", validation.json().version)).statusCode,
        )
        .toBe(409);
      expect
        .soft(
          (await pg.pool.query("select count(*)::int n from part_requires"))
            .rows[0].n,
        )
        .toBe(0);
      expect
        .soft(
          (await pg.pool.query("select count(*)::int n from figure_part"))
            .rows[0].n,
        )
        .toBe(0);
      const retained = (
        await pg.pool.query(
          "select source_payload,normalized_fields from import_staging_row order by row_number",
        )
      ).rows;
      expect(
        retained.slice(0, 2).map((row) => row.source_payload.REMARKS),
      ).toEqual([
        `Requires P-2 (QTY ${firstQty})`,
        `Requires P-2 (QTY ${secondQty})`,
      ]);
      expect(
        retained.slice(0, 2).map((row) => row.normalized_fields.hints[0].qty),
      ).toEqual([firstQty, secondQty]);
    },
  );
  it("retains stable rows and existing coordinates for unchanged reordered source and invalidates changed source bindings", async () => {
    await applied();
    const original = (
      await pg.pool.query(
        "select fp.id,fp.version,c.id as callout_id from figure_part fp join callout c on c.figure_part_id=fp.id",
      )
    ).rows[0];
    await pg.pool.query("update callout set x=10,y=20 where id=$1", [
      original.callout_id,
    ]);
    await applied(csv([base.map((x, i) => (i === 0 ? "99" : x))]), 2);
    const unchanged = (
      await pg.pool.query(
        "select fp.id,fp.version,c.x,c.y from figure_part fp join callout c on c.figure_part_id=fp.id",
      )
    ).rows[0];
    expect(unchanged).toEqual({
      id: original.id,
      version: original.version,
      x: "10.0000",
      y: "20.0000",
    });
    await applied(csv([base.map((x, i) => (i === 10 ? "3" : x))]), 2);
    expect(
      (await pg.pool.query("select id,version,qty from figure_part")).rows[0],
    ).toEqual({ id: original.id, version: 2, qty: 3 });
  });
  it("blocks missing or changed ambiguous identities and preserves history", async () => {
    await applied();
    const job = await staged(
      csv([base.map((x, i) => (i === 1 ? "P-NEW" : x))]),
      2,
    );
    const v = await write(job.id, "validate", 1);
    expect(v.json().blockingIssueCount).toBeGreaterThan(0);
    expect((await write(job.id, "apply", v.json().version)).statusCode).toBe(
      409,
    );
    expect(
      (await pg.pool.query("select count(*)::int n from figure_part")).rows[0]
        .n,
    ).toBe(1);
  });
  it("rolls back graph, job state, lineage, audit and idempotency together on a crash", async () => {
    const job = await staged();
    const v = await write(job.id, "validate", 1);
    await pg.pool.query(
      "CREATE FUNCTION test_import_crash() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.event_type='import.applied' THEN RAISE EXCEPTION 'synthetic crash'; END IF; RETURN NEW; END; $$; CREATE TRIGGER test_import_crash BEFORE INSERT ON outbox_event FOR EACH ROW EXECUTE FUNCTION test_import_crash()",
    );
    try {
      expect((await write(job.id, "apply", v.json().version)).statusCode).toBe(
        500,
      );
      expect(
        (await pg.pool.query("select count(*)::int n from figure_part")).rows[0]
          .n,
      ).toBe(0);
      expect(
        (await pg.pool.query("select state from import_job")).rows[0].state,
      ).toBe("validated");
    } finally {
      await pg.pool.query(
        "DROP TRIGGER test_import_crash ON outbox_event; DROP FUNCTION test_import_crash()",
      );
    }
    expect((await write(job.id, "apply", v.json().version)).statusCode).toBe(
      200,
    );
  });
  it("refuses applying bytes changed in storage and runtime cannot mutate immutable source/history or grant authority", async () => {
    const job = await staged();
    const v = await write(job.id, "validate", 1);
    for (const key of writes.keys()) writes.set(key, Buffer.from("tampered"));
    expect((await write(job.id, "apply", v.json().version)).statusCode).toBe(
      409,
    );
    for (const query of [
      "update import_staging_row set source_payload='{}'",
      "delete from import_job",
      "update import_source_alias set identity_key='bad'",
      "select * from public.order",
      "create table unsafe(id int)",
      "alter role current_user superuser",
    ])
      await expect(runtime.pool.query(query)).rejects.toThrow();
  });
  it("imports the identical unapproved mapping twice with one revision and rejects changed idempotency context", async () => {
    const job = await applied(),
      alias = job.aliases[0],
      drawing = randomUUID();
    await pg.pool.query(
      "insert into drawing_file(id,object_key,filename,media_type,bytes,sha256,width,height,validation_status,object_version_id) values($1,'private-synthetic.png','synthetic.png','image/png',100,repeat('c',64),200,100,'valid','pinned')",
      [drawing],
    );
    await pg.pool.query(
      "update figure set drawing_file_id=$1,version=version+1 where id=$2",
      [drawing, alias.figureId],
    );
    const transport = {
      operatorId: ids.actor,
      async request(
        method: "GET" | "POST" | "PUT",
        url: string,
        body?: unknown,
        extra?: Record<string, string>,
      ) {
        const r = await app.inject({
          method,
          url,
          headers: { ...headers, ...extra },
          ...(body === undefined ? {} : { payload: body as object }),
        });
        if (r.statusCode >= 400) throw new Error(`HTTP ${r.statusCode}`);
        return r.json();
      },
    };
    const editor = await transport.request(
      "GET",
      `/api/v1/admin/figures/${alias.figureId}/diagram-mapping`,
    );
    const legacy = Buffer.from(
      JSON.stringify({
        figures: [{ id: "legacy-figure", name: "Frame plate" }],
        parts: [{ id: "legacy-part", partNumber: "P-1" }],
        figureParts: [
          {
            id: "legacy-row",
            figureId: "legacy-figure",
            partId: "legacy-part",
          },
        ],
        callouts: [
          {
            id: "legacy-callout",
            figureId: "legacy-figure",
            figurePartId: "legacy-row",
            number: 7,
          },
        ],
      }),
    );
    const manifest: MappingDraftManifest = {
      schemaVersion: 1,
      status: "NOT_FOR_CUSTOMER_USE",
      operatorId: ids.actor,
      jobId: job.id,
      modelId: ids.model,
      variantId: ids.variant,
      figureId: alias.figureId,
      legacyFigureId: "legacy-figure",
      sourceChecksum: sha(csv()),
      legacySourceChecksum: sha(legacy),
      catalogueBindingSha256: editor.source.catalogueBindingSha256,
      drawingSha256: "c".repeat(64),
      imageWidth: 200,
      imageHeight: 100,
      expectedMappingVersion: 1,
      idempotencyKey: "mapping-draft-replay",
      proposals: [
        {
          sourceRowKey: alias.sourceRowKey,
          legacyCalloutId: "legacy-callout",
          legacyFigurePartId: "legacy-row",
          refNo: "7",
          labelRegion: { x: 1, y: 1, width: 3, height: 3 },
          regions: [
            {
              id: "component",
              outer: [
                [10, 10],
                [20, 10],
                [20, 20],
                [10, 20],
              ],
              holes: [],
            },
          ],
          evidence: "Synthetic original source checked",
          legacyMaskPath: null,
        },
      ],
    };
    expect(
      (await importMappingDraft(transport, manifest, csv(), legacy)).mode,
    ).toBe("dry-run");
    expect(
      (
        await pg.pool.query(
          "select count(*)::int n from diagram_mapping_revision",
        )
      ).rows[0].n,
    ).toBe(0);
    const first = await importMappingDraft(
        transport,
        manifest,
        csv(),
        legacy,
        true,
      ),
      second = await importMappingDraft(
        transport,
        manifest,
        csv(),
        legacy,
        true,
      );
    expect(second).toEqual(first);
    expect(first.revision.approval).toBeNull();
    expect(
      (
        await pg.pool.query(
          "select count(*)::int n from diagram_mapping_revision",
        )
      ).rows[0].n,
    ).toBe(1);
    await expect(
      importMappingDraft(
        transport,
        { ...manifest, expectedMappingVersion: 2 },
        csv(),
        legacy,
        true,
      ),
    ).rejects.toThrow("HTTP 409");
    await applied(csv([base.map((x, i) => (i === 10 ? "3" : x))]), 2);
    const stale = await transport.request(
      "GET",
      `/api/v1/admin/figures/${alias.figureId}/diagram-mapping`,
    );
    expect(stale.sourceConflict).toBe(true);
    expect(stale.document).toEqual(first.revision.document);
  });
});
