import { randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { Readable } from "node:stream";
import { createServer } from "node:net";
import { createServer as createHttpServer } from "node:http";
import { GenericContainer, Wait, type StartedTestContainer } from "testcontainers";
import { CreateBucketCommand, PutBucketVersioningCommand, S3Client, PutBucketPolicyCommand, DeleteBucketPolicyCommand } from "@aws-sdk/client-s3";
import sharp from "sharp";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createS3DrawingStorage } from "../src/modules/drawings/s3-storage.js";
import { createClamdScanner } from "../src/modules/drawings/scanner.js";
import { validatePng } from "../src/modules/drawings/validation.js";

describe("real private versioned S3 transport", () => {
  let container: StartedTestContainer, client: S3Client;
  let storage: ReturnType<typeof createS3DrawingStorage>;
  const bucket = "private-drawings";
  beforeAll(async () => {
    if (!process.env.DOCKER_HOST) process.env.DOCKER_HOST = execFileSync("docker", ["context", "inspect", "--format", "{{.Endpoints.docker.Host}}"], { encoding: "utf8" }).trim();
    if (process.env.DOCKER_HOST.includes("/.colima/")) process.env.TESTCONTAINERS_DOCKER_SOCKET_OVERRIDE ??= "/var/run/docker.sock";
    container = await new GenericContainer("minio/minio:RELEASE.2025-04-22T22-12-26Z").withEnvironment({ MINIO_ROOT_USER: "local-test-user", MINIO_ROOT_PASSWORD: "local-test-password-only" }).withCommand(["server", "/data"]).withExposedPorts(9000).withWaitStrategy(Wait.forHttp("/minio/health/ready", 9000)).start();
    const config = { provider: "minio" as const, endpoint: `http://${container.getHost()}:${container.getMappedPort(9000)}`, region: "us-east-1", bucket, accessKeyId: "local-test-user", secretAccessKey: "local-test-password-only" };
    client = new S3Client({ ...config, forcePathStyle: true, credentials: config });
    await client.send(new CreateBucketCommand({ Bucket: bucket }));
    await client.send(new PutBucketVersioningCommand({ Bucket: bucket, VersioningConfiguration: { Status: "Enabled" } }));
    storage = createS3DrawingStorage(config);
  }, 180_000);
  afterAll(async () => { client?.destroy(); storage?.close(); await container?.stop(); }, 30_000);
  it("keeps verified bytes pinned after upload URL reuse and rejects anonymous reads", async () => {
    const key = `quarantine/${randomUUID()}/${randomUUID()}.png`;
    const upload = await storage.createUpload(key, 900);
    expect((await fetch(upload.url, { method: "PUT", body: "first", headers: upload.headers })).status).toBe(200);
    const first = await storage.inspect(key); expect(first.versionId).toBeTruthy(); expect(first.versionId).not.toBe("null");
    expect((await fetch(upload.url, { method: "PUT", body: "second", headers: upload.headers })).status).toBe(200);
    expect((await storage.inspect(key)).versionId).not.toBe(first.versionId);
    const url = await storage.createDownload(key, first.versionId, 300);
    expect(await (await fetch(url)).text()).toBe("first");
    expect((await fetch(url.split("?")[0])).status).toBe(403);
    const read: Buffer[] = []; for await (const chunk of storage.read(key, first.versionId)) read.push(Buffer.from(chunk)); expect(Buffer.concat(read).toString()).toBe("first");
    await storage.deleteQuarantine(key); await expect(storage.inspect(key, first.versionId)).rejects.toThrow();
  });
  it("enforces expiry on real signed PUT and GET URLs", async () => {
    const key = `quarantine/${randomUUID()}/${randomUUID()}.png`;
    const put = await storage.createUpload(key, 1);
    expect((await fetch(put.url, { method: "PUT", body: "bytes", headers: put.headers })).status).toBe(200);
    const object = await storage.inspect(key); const read = await storage.createDownload(key, object.versionId, 1);
    await new Promise(resolve => setTimeout(resolve, 2200));
    expect((await fetch(read)).status).toBe(403);
    expect((await fetch(put.url, { method: "PUT", body: "bytes", headers: put.headers })).status).toBe(403);
  });
  it("fails closed when bucket versioning is suspended or a public policy is present", async () => {
    await client.send(new PutBucketVersioningCommand({ Bucket: bucket, VersioningConfiguration: { Status: "Suspended" } }));
    await expect(storage.createUpload(`quarantine/${randomUUID()}/${randomUUID()}.png`, 900)).rejects.toThrow();
    await client.send(new PutBucketVersioningCommand({ Bucket: bucket, VersioningConfiguration: { Status: "Enabled" } }));
    await client.send(new PutBucketPolicyCommand({ Bucket: bucket, Policy: JSON.stringify({ Version: "2012-10-17", Statement: [{ Effect: "Allow", Principal: "*", Action: ["s3:GetObject"], Resource: [`arn:aws:s3:::${bucket}/*`] }] }) }));
    try { await expect(storage.createUpload(`quarantine/${randomUUID()}/${randomUUID()}.png`, 900)).rejects.toThrow(); }
    finally { await client.send(new DeleteBucketPolicyCommand({ Bucket: bucket })); }
  });
});

describe("bounded PNG decode and scanner transport", () => {
  it.each([
    ['<Grantee xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:type="CanonicalUser"><ID>owner</ID></Grantee>', true],
    ['<Grantee xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:type="CanonicalUser"><ID>foreign</ID></Grantee>', false],
    ['<Grantee xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:type="Group"><URI>http://acs.amazonaws.com/groups/global/AllUsers</URI></Grantee>', false],
    ['<Grantee xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:type="CanonicalUser"></Grantee>', false],
  ] as const)("requires the explicit AWS owner ACL and rejects other grants: %s", async (grant, allowed) => {
    const server = createHttpServer((request, response) => {
      request.resume(); response.setHeader("Content-Type", "application/xml");
      if (request.url?.includes("versioning")) response.end('<VersioningConfiguration xmlns="http://s3.amazonaws.com/doc/2006-03-01/"><Status>Enabled</Status></VersioningConfiguration>');
      else if (request.url?.includes("acl")) response.end(`<AccessControlPolicy><Owner><ID>owner</ID></Owner><AccessControlList><Grant>${grant}<Permission>FULL_CONTROL</Permission></Grant></AccessControlList></AccessControlPolicy>`);
      else { response.statusCode = 404; response.end("<Error><Code>NoSuchBucketPolicy</Code></Error>"); }
    });
    await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
    const address = server.address(); if (!address || typeof address === "string") throw new Error("port unavailable");
    const storage = createS3DrawingStorage({ endpoint: `http://127.0.0.1:${address.port}`, region: "test", bucket: "test", accessKeyId: "test", secretAccessKey: "test" });
    try {
      const result = storage.createUpload(`quarantine/${randomUUID()}/${randomUUID()}.png`, 900);
      if (allowed) await expect(result).resolves.toHaveProperty("url"); else await expect(result).rejects.toThrow("private bucket ACL");
    } finally { storage.close(); server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); }
  });
  it("stops an oversized stream without requesting the following chunk", async () => {
    let continued = false;
    async function* malicious() { yield Buffer.alloc(20 * 1024 * 1024 + 1); continued = true; throw new Error("must never read"); }
    await expect(validatePng(malicious(), { bytes: 20 * 1024 * 1024, sha256: "a".repeat(64) }, { scan: async () => "clean" })).rejects.toMatchObject({ status: 413 });
    expect(continued).toBe(false);
  });
  it("rejects decompression dimensions and PNG CRC corruption before scanner", async () => {
    const huge = await sharp({ create: { width: 16385, height: 1, channels: 3, background: "white" } }).png().toBuffer();
    const { createHash } = await import("node:crypto");
    const check = (bytes: Buffer) => validatePng(Readable.from([bytes]), { bytes: bytes.length, sha256: createHash("sha256").update(bytes).digest("hex") }, { scan: async () => { throw new Error("scanner should not accept invalid pixels"); } });
    await expect(check(huge)).rejects.toMatchObject({ status: 413 });
    const excessivePixels = Buffer.from(huge); excessivePixels.writeUInt32BE(8000, 16); excessivePixels.writeUInt32BE(6000, 20);
    let crc = 0xffffffff; for (const byte of excessivePixels.subarray(12, 29)) { crc ^= byte; for (let bit = 0; bit < 8; bit++) crc = crc & 1 ? 0xedb88320 ^ (crc >>> 1) : crc >>> 1; }
    excessivePixels.writeUInt32BE((crc ^ 0xffffffff) >>> 0, 29);
    await expect(check(excessivePixels)).rejects.toMatchObject({ status: 413 });
    const bad = await sharp({ create: { width: 2, height: 2, channels: 3, background: "white" } }).png().toBuffer(); bad[bad.length - 1] ^= 1;
    await expect(check(bad)).rejects.toMatchObject({ status: 422 });
  });
  it.each(["stream: OK\0", "stream: Test FOUND\0", "stream: size limit exceeded ERROR\0", "garbage\0"])("accepts only exact clamd verdict frames: %s", async reply => {
    const received: Buffer[] = [];
    const server = createServer(socket => { socket.on("data", data => { received.push(data); if (Buffer.concat(received).subarray(-4).equals(Buffer.alloc(4))) socket.end(reply); }); });
    await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
    const address = server.address(); if (!address || typeof address === "string") throw new Error("port unavailable");
    try {
      const scanner = createClamdScanner({ host: "127.0.0.1", port: address.port, timeoutMs: 1000 });
      expect(await scanner.scan(Buffer.from("png-bytes"))).toBe(reply === "stream: OK\0" ? "clean" : reply.includes("FOUND") ? "infected" : "unavailable");
      expect(Buffer.concat(received)).toEqual(Buffer.concat([Buffer.from("zINSTREAM\0"), Buffer.from([0, 0, 0, 9]), Buffer.from("png-bytes"), Buffer.alloc(4)]));
    } finally { await new Promise<void>(resolve => server.close(() => resolve())); }
  });
  it("fails closed without scanner configuration", async () => { expect(await createClamdScanner(undefined).scan(Buffer.from("file"))).toBe("unavailable"); });
});
