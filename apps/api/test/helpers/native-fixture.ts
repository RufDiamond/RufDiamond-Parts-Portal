import { randomBytes, randomUUID } from "node:crypto";
import argon2 from "argon2";
import sharp from "sharp";
import { GenericContainer, Wait, type StartedTestContainer } from "testcontainers";
import { CreateBucketCommand, PutBucketVersioningCommand, S3Client } from "@aws-sdk/client-s3";
import { startPostgres } from "./postgres.js";
import { grantLocalRuntime } from "../../src/db/local-runtime-grants.js";
import { createDatabase } from "../../src/db/client.js";
import { buildApp } from "../../src/app.js";

/** Each call owns its entire disposable cluster, bucket and scanner. No env file or remote URL. */
export async function startNativeFixture(origin: string, port: number) {
  if (new URL(origin).hostname !== "127.0.0.1") throw new Error("Native integration requires explicit loopback origin.");
  const pg = await startPostgres();
  let minio: StartedTestContainer | undefined, clamd: StartedTestContainer | undefined;
  let runtime: ReturnType<typeof createDatabase> | undefined;
  let app: Awaited<ReturnType<typeof buildApp>> | undefined;
  let client: S3Client | undefined;
  async function stop() { await app?.close(); await runtime?.close(); client?.destroy(); await clamd?.stop(); await minio?.stop(); await pg.stop(); }
  try {
    await pg.migrate();
    const role = `ruf_local_${randomBytes(8).toString("hex")}`, dbPassword = randomBytes(32).toString("hex");
    await pg.pool.query(`CREATE ROLE "${role}" LOGIN PASSWORD '${dbPassword}' NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS`);
    await grantLocalRuntime(pg.pool, role);
    const runtimeUrl = new URL(pg.connectionString); runtimeUrl.username = role; runtimeUrl.password = dbPassword;
    runtime = createDatabase(runtimeUrl.href);
    const ids = Object.fromEntries(["line","model","variant","system","figure","part","row","callout","company","foreignLine","foreignModel","foreignVariant","foreignFigure","publisher","mapper","customer","technician"].map(key => [key, randomUUID()]));
    const password = randomBytes(20).toString("hex");
    const passwordOptions = { type: argon2.argon2id, memoryCost: 2048, timeCost: 2, parallelism: 1 } as const;
    const hash = await argon2.hash(password, passwordOptions);
    await pg.pool.query("insert into product_line(id,name,normalized_name) values($1,'Fat Truck','fat truck'),($2,'Foreign brand','foreign brand')", [ids.line,ids.foreignLine]);
    await pg.pool.query("insert into model(id,product_line_id,name) values($1,$2,'Local synthetic model'),($3,$4,'Foreign model')", [ids.model,ids.line,ids.foreignModel,ids.foreignLine]);
    await pg.pool.query("insert into variant(id,model_id,label) values($1,$2,'Local variant'),($3,$4,'Foreign variant')", [ids.variant,ids.model,ids.foreignVariant,ids.foreignModel]);
    await pg.pool.query("insert into system(id,name,normalized_name) values($1,'Frame','frame')", [ids.system]);
    await pg.pool.query("insert into model_system(model_id,system_id) values($1,$2)", [ids.model,ids.system]);
    await pg.pool.query("insert into figure(id,variant_id,system_id,name,source_key) values($1,$2,$3,'Local synthetic frame','first'),($4,$5,$3,'Foreign figure','foreign')", [ids.figure,ids.variant,ids.system,ids.foreignFigure,ids.foreignVariant]);
    await pg.pool.query("insert into diagram_mapping(figure_id) values($1),($2)", [ids.figure,ids.foreignFigure]);
    await pg.pool.query("insert into part(id,part_number,normalized_part_number,description,list_price) values($1,'LOCAL-P1','LOCAL-P1','Synthetic bracket',12.40)", [ids.part]);
    await pg.pool.query("insert into figure_part(id,figure_id,part_id,source_row_key,qty,remarks) values($1,$2,$3,'row',1,'Literal A* source remark')", [ids.row,ids.figure,ids.part]);
    await pg.pool.query("insert into callout(id,figure_id,figure_part_id,source_key,number) values($1,$2,$3,'one','A*')", [ids.callout,ids.figure,ids.row]);
    await pg.pool.query("insert into company(id,name,type,technician_pricing_visible) values($1,'Local fixture company','customer',false)", [ids.company]);
    await pg.pool.query("insert into company_product_line(company_id,product_line_id) values($1,$2)", [ids.company,ids.line]);
    await pg.pool.query("insert into company_machine(company_id,variant_id,unit_reference) values($1,$2,'LOCAL-1')", [ids.company,ids.variant]);
    const readCaps = ["catalog.model.view","catalog.figure.view","parts.record.view","pricing.cost.view"];
    const mapCaps = [...readCaps,"publish.draft.view","catalog.figure.edit","catalog.drawing.upload","catalog.callout.manage","catalog.callout.map"];
    for (const key of ["publisher","mapper","customer","technician"] as const) {
      const roleId = randomUUID();
      if (key !== "technician") await pg.pool.query("insert into role(id,key,name) values($1,$2,$3)", [roleId,`native_${key}`,`Local ${key}`]);
      await pg.pool.query("insert into app_user(id,company_id,name,login_id,email,password_hash,role_id) values($1,$2,$3,$4,$4,$5,coalesce((select id from role where key=$6),$7::uuid))", [ids[key],ids.company,`Local ${key}`,`${key}@native.test`,hash,key === "technician" ? "technician" : `native_${key}`,roleId]);
      const caps = key === "publisher" ? [...mapCaps,"publish.execute"] : key === "mapper" ? mapCaps : readCaps;
      for (const cap of caps) await pg.pool.query("insert into user_capability(user_id,capability_key) values($1,$2) on conflict do nothing", [ids[key],cap]);
      await pg.pool.query("insert into user_scope(user_id,brand_mode,account_mode,fleet_mode,environment) values($1,'company','own','company',$2)", [ids[key],key === "publisher" || key === "mapper" ? "published_and_draft" : "published"]);
    }
    const accessKeyId = randomBytes(10).toString("hex"), secretAccessKey = randomBytes(32).toString("hex");
    minio = await new GenericContainer("minio/minio:RELEASE.2025-04-22T22-12-26Z").withEnvironment({ MINIO_ROOT_USER: accessKeyId, MINIO_ROOT_PASSWORD: secretAccessKey, MINIO_API_CORS_ALLOW_ORIGIN: origin }).withCommand(["server","/data"]).withExposedPorts(9000).withWaitStrategy(Wait.forHttp("/minio/health/ready",9000)).start();
    const s3 = { provider: "minio" as const, endpoint: `http://${minio.getHost()}:${minio.getMappedPort(9000)}`, region: "us-east-1", bucket: "local-native-drawings", accessKeyId, secretAccessKey };
    client = new S3Client({ ...s3, credentials: s3, forcePathStyle: true });
    await client.send(new CreateBucketCommand({ Bucket: s3.bucket }));
    await client.send(new PutBucketVersioningCommand({ Bucket: s3.bucket, VersioningConfiguration: { Status: "Enabled" } }));
    clamd = await new GenericContainer("clamav/clamav:1.4.3_base").withPlatform("linux/amd64").withEntrypoint(["clamd"]).withCommand(["--foreground=true","--config-file=/tmp/native-clamd.conf"])
      .withCopyContentToContainer([
        { content: "DatabaseDirectory /tmp/native-signatures\nTCPSocket 3310\nTCPAddr 0.0.0.0\nForeground yes\nLogTime no\nStreamMaxLength 21M\nMaxFileSize 21M\nMaxScanSize 64M\nAlertExceedsMax yes\n", target: "/tmp/native-clamd.conf" },
        { content: "RufLocalTest:0:*:5255465f5441534b375f494e464543544544\n", target: "/tmp/native-signatures/test.ndb" },
      ]).withExposedPorts(3310).withWaitStrategy(Wait.forLogMessage("Self checking every")).withStartupTimeout(120000).start();
    app = await buildApp({ config: { nodeEnv: "test", port, databaseUrl: runtimeUrl.href, webOrigin: origin, sessionSecret: randomBytes(32).toString("hex"), allowInsecureLoopbackCookie: true, deliveryEncryption: { activeKeyId: "local", keys: { local: randomBytes(32).toString("base64") } }, s3, drawingScanner: { host: clamd.getHost(), port: clamd.getMappedPort(3310), timeoutMs: 10000 } }, dependencies: { database: runtime, passwordOptions } });
    const failures: string[] = [];
    app.addHook("onError", async (_request, _reply, error) => {
      let cause: unknown = error;
      while (cause instanceof Error) {
        if (/^permission denied for (table|schema) [a-z_]+$/.test(cause.message)) failures.push(cause.message);
        cause = cause.cause;
      }
    });
    await app.listen({ port, host: "127.0.0.1" });
    const png = await sharp({ create: { width: 640, height: 480, channels: 3, background: "#eeeeee" } }).composite([{ input: Buffer.from('<svg width="640" height="480"><rect x="180" y="130" width="260" height="190" fill="#778899"/><text x="60" y="60" font-size="30">A*</text></svg>') }]).png().toBuffer();
    const replacement = await sharp(png).tint("#bbccdd").png().toBuffer();
    return { ids, password, png, replacement, runtime, setup: pg.pool, storageEndpoint: s3.endpoint, failures, stop };
  } catch (error) { await stop(); throw error; }
}
