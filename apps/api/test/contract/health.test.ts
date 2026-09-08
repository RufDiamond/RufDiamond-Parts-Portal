import { afterEach, describe, expect, it } from "vitest";

import { buildApp } from "../../src/app.js";
import { loadConfig } from "../../src/config.js";

const config = {
  nodeEnv: "test" as const,
  port: 0,
  databaseUrl: "postgres://rufdiamond:rufdiamond@localhost:5432/rufdiamond",
  sessionSecret: "a-test-session-secret-that-is-long-enough",
  webOrigin: "http://localhost:3000",
  allowInsecureLoopbackCookie: false,
  deliveryEncryption: { activeKeyId: "test", keys: { test: Buffer.alloc(32, 1).toString("base64") } },
  s3: {
    endpoint: "http://localhost:9000",
    region: "us-east-1",
    bucket: "rufdiamond-test",
    accessKeyId: "test-access-key",
    secretAccessKey: "test-secret-key",
  },
};

const apps: Array<Awaited<ReturnType<typeof buildApp>>> = [];

afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()));
});

describe("GET /health/live", () => {
  it("returns the live status", async () => {
    const app = await buildApp({ config });
    apps.push(app);

    const response = await app.inject({ method: "GET", url: "/health/live" });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: "ok" });
  });
});

describe("configuration", () => {
  it("rejects a non-HTTP web origin", () => {
    expect(() => loadConfig({
      NODE_ENV: "test",
      PORT: "3001",
      DATABASE_URL: "postgres://rufdiamond:rufdiamond@localhost:5432/rufdiamond",
      SESSION_SECRET: "a-test-session-secret-that-is-long-enough",
      WEB_ORIGIN: "ftp://portal.rufdiamond.example",
      S3_ENDPOINT: "http://localhost:9000",
      S3_REGION: "us-east-1",
      S3_BUCKET: "rufdiamond-test",
      S3_ACCESS_KEY_ID: "test-access-key",
      S3_SECRET_ACCESS_KEY: "test-secret-key",
    })).toThrow("WEB_ORIGIN must use the http or https protocol");
  });
});
