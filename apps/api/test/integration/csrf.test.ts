import { randomBytes, randomUUID } from "node:crypto";
import argon2 from "argon2";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { buildApp } from "../../src/app.js";
import { loadConfig } from "../../src/config.js";
import { createDatabase } from "../../src/db/client.js";
import { startServer } from "../../src/server.js";
import { startPostgres } from "../helpers/postgres.js";

const passwordOptions = { type: argon2.argon2id, memoryCost: 2_048, timeCost: 2, parallelism: 1 } as const;
const webOrigin = "https://portal.example.test:8443";
const config = {
  nodeEnv: "test" as const,
  port: 0,
  databaseUrl: "postgres://unused",
  sessionSecret: "a-test-session-secret-that-is-long-enough",
  webOrigin,
  allowInsecureLoopbackCookie: false,
  deliveryEncryption: { activeKeyId: "test-key", keys: { "test-key": randomBytes(32).toString("base64") } },
  s3: { endpoint: "http://localhost:9000", region: "us-east-1", bucket: "test", accessKeyId: "test", secretAccessKey: "test" },
};

describe("origin and CSRF protection", () => {
  let postgres: Awaited<ReturnType<typeof startPostgres>>;
  let connection: ReturnType<typeof createDatabase>;
  const apps: Array<Awaited<ReturnType<typeof buildApp>>> = [];

  beforeAll(async () => {
    postgres = await startPostgres();
    await postgres.migrate();
    connection = createDatabase(postgres.connectionString);
  }, 120_000);
  beforeEach(async () => postgres.pool.query("truncate table session, audit_log, app_user, company cascade"));
  afterEach(async () => Promise.all(apps.splice(0).map(app => app.close())));
  afterAll(async () => { await connection?.close(); await postgres?.stop(); }, 30_000);

  async function fixture() {
    const companyId = randomUUID();
    const userId = randomUUID();
    const loginId = `${userId}@example.test`;
    const password = "correct horse battery staple";
    const passwordHash = await argon2.hash(password, passwordOptions);
    await postgres.pool.query("insert into company(id,name) values($1,'Customer')", [companyId]);
    await postgres.pool.query(
      "insert into app_user(id,company_id,name,login_id,email,password_hash,role_id) select $1,$2,'Buyer',$3,$3,$4,id from role where key='purchaser'",
      [userId, companyId, loginId, passwordHash],
    );
    const app = await buildApp({ config, dependencies: { database: connection, passwordOptions } as never });
    apps.push(app);
    return { app, loginId, password };
  }

  async function login(app: Awaited<ReturnType<typeof buildApp>>, loginId: string, password: string) {
    const response = await app.inject({ method: "POST", url: "/api/v1/auth/sign-in", headers: { origin: webOrigin }, payload: { loginId, password } });
    return { response, cookie: String(response.headers["set-cookie"]).split(";")[0], csrf: response.json().csrfToken as string };
  }

  it("requires the exact configured origin for sign-in and rejects malicious extra credential fields", async () => {
    const { app, loginId, password } = await fixture();
    for (const origin of [undefined, "https://evil.example", `${webOrigin}/path`]) {
      const response = await app.inject({
        method: "POST", url: "/api/v1/auth/sign-in",
        headers: origin ? { origin } : {}, payload: { loginId, password },
      });
      expect(response.statusCode).toBe(403);
      expect(response.json()).toMatchObject({ code: "ORIGIN_REJECTED", title: "Forbidden" });
    }
    const extra = await app.inject({
      method: "POST", url: "/api/v1/auth/sign-in", headers: { origin: webOrigin },
      payload: { loginId, password, capability: "publish.block.override" },
    });
    expect(extra.statusCode).toBe(400);
    expect(extra.body).not.toContain("publish.block.override");
  });

  it("rejects missing, mismatched, and forged-origin CSRF without revoking the valid session", async () => {
    const { app, loginId, password } = await fixture();
    const signedIn = await login(app, loginId, password);
    const headers = { cookie: signedIn.cookie, origin: webOrigin };
    const attempts = [
      await app.inject({ method: "POST", url: "/api/v1/auth/sign-out", headers, payload: {} }),
      await app.inject({ method: "POST", url: "/api/v1/auth/sign-out", headers: { ...headers, "x-csrf-token": "forged" }, payload: {} }),
      await app.inject({ method: "POST", url: "/api/v1/auth/sign-out", headers: { ...headers, origin: "https://evil.example", "x-csrf-token": signedIn.csrf }, payload: {} }),
      await app.inject({ method: "POST", url: "/api/v1/auth/sign-out", headers: { ...headers, referer: "https://evil.example/path", "x-csrf-token": signedIn.csrf }, payload: {} }),
    ];
    expect(attempts.map(response => response.statusCode)).toEqual([403, 403, 403, 403]);
    expect(await app.inject({ method: "GET", url: "/api/v1/me", headers: { cookie: signedIn.cookie } })).toMatchObject({ statusCode: 200 });
  });

  it("returns a safe authentication error before CSRF checks when no session exists", async () => {
    const { app } = await fixture();
    const response = await app.inject({
      method: "POST", url: "/api/v1/auth/sign-out",
      headers: { origin: webOrigin, "x-csrf-token": "attacker-value" }, payload: {},
    });
    expect(response.statusCode).toBe(401);
    expect(response.json()).toMatchObject({ code: "AUTHENTICATION_REQUIRED", title: "Unauthorized" });
    expect(response.body).not.toContain("attacker-value");
  });

  it("keeps a stable CSRF token across tabs, supports current-session logout, and protects logout-all", async () => {
    const { app, loginId, password } = await fixture();
    const first = await login(app, loginId, password);
    const second = await login(app, loginId, password);
    const [tabA, tabB] = await Promise.all([
      app.inject({ method: "GET", url: "/api/v1/me", headers: { cookie: first.cookie } }),
      app.inject({ method: "GET", url: "/api/v1/me", headers: { cookie: first.cookie } }),
    ]);
    expect(tabA.json().csrfToken).toBe(first.csrf);
    expect(tabB.json().csrfToken).toBe(first.csrf);

    const current = await app.inject({
      method: "POST", url: "/api/v1/auth/sign-out",
      headers: { cookie: first.cookie, origin: webOrigin, referer: `${webOrigin}/account`, "x-csrf-token": first.csrf },
      payload: {},
    });
    expect(current.statusCode).toBe(200);
    expect(String(current.headers["set-cookie"])).toContain("Expires=Thu, 01 Jan 1970 00:00:00 GMT");
    expect((await app.inject({ method: "GET", url: "/api/v1/me", headers: { cookie: first.cookie } })).statusCode).toBe(401);
    expect((await app.inject({ method: "GET", url: "/api/v1/me", headers: { cookie: second.cookie } })).statusCode).toBe(200);

    const all = await app.inject({
      method: "POST", url: "/api/v1/auth/sign-out",
      headers: { cookie: second.cookie, origin: webOrigin, "x-csrf-token": second.csrf },
      payload: { allSessions: true },
    });
    expect(all.statusCode).toBe(200);
    expect((await app.inject({ method: "GET", url: "/api/v1/me", headers: { cookie: second.cookie } })).statusCode).toBe(401);
    expect((await postgres.pool.query("select count(*)::int as count from session where revoked_at is null")).rows[0].count).toBe(0);
  });

  it("accepts only an exact web origin and a canonical 32-byte delivery keyring", () => {
    const environment = {
      NODE_ENV: "production", PORT: "3001", DATABASE_URL: "postgres://localhost/rufdiamond",
      SESSION_SECRET: "a-production-session-secret-that-is-long-enough", WEB_ORIGIN: "https://portal.example.test:8443",
      DELIVERY_ENCRYPTION_KEY_ID: "current", DELIVERY_ENCRYPTION_KEYS_JSON: JSON.stringify({ current: randomBytes(32).toString("base64") }),
      S3_ENDPOINT: "https://s3.example.test", S3_REGION: "ca-central-1", S3_BUCKET: "parts",
      S3_ACCESS_KEY_ID: "access", S3_SECRET_ACCESS_KEY: "secret",
    };
    expect(loadConfig(environment).webOrigin).toBe(environment.WEB_ORIGIN);
    for (const badOrigin of ["https://portal.example.test/path", "https://portal.example.test?query=1", "https://user:pass@portal.example.test", "https://*.example.test"]) {
      expect(() => loadConfig({ ...environment, WEB_ORIGIN: badOrigin })).toThrow("WEB_ORIGIN must be an exact origin");
    }
    expect(() => loadConfig({ ...environment, DELIVERY_ENCRYPTION_KEYS_JSON: JSON.stringify({ current: "short" }) })).toThrow("32-byte");
    expect(() => loadConfig({ ...environment, DELIVERY_ENCRYPTION_KEY_ID: "missing" })).toThrow("configured key");
    expect(() => loadConfig({ ...environment, NODE_ENV: "production", ALLOW_INSECURE_LOOPBACK_COOKIE: "true", WEB_ORIGIN: "http://127.0.0.1:3000" })).toThrow("Insecure cookies require");
    expect(() => loadConfig({ ...environment, NODE_ENV: "development", ALLOW_INSECURE_LOOPBACK_COOKIE: "true", WEB_ORIGIN: "http://portal.example.test" })).toThrow("Insecure cookies require");
  });

  it("allows a separately named insecure cookie only for explicit loopback development", async () => {
    const { app: existingApp, loginId, password } = await fixture();
    await existingApp.close();
    apps.splice(apps.indexOf(existingApp), 1);
    const devConfig = { ...config, nodeEnv: "development" as const, webOrigin: "http://127.0.0.1:3000", allowInsecureLoopbackCookie: true };
    const app = await buildApp({ config: devConfig, dependencies: { database: connection, passwordOptions } as never });
    apps.push(app);
    const response = await app.inject({
      method: "POST", url: "/api/v1/auth/sign-in", headers: { origin: devConfig.webOrigin }, payload: { loginId, password },
    });
    expect(response.statusCode).toBe(200);
    expect(response.headers["set-cookie"]).toContain("ruf-session-dev=");
    expect(response.headers["set-cookie"]).not.toContain("__Host-ruf-session");
    expect(response.headers["set-cookie"]).not.toContain("Secure");
  });

  it("removes both server signal hooks during graceful shutdown", async () => {
    const beforeTerm = process.listenerCount("SIGTERM");
    const beforeInt = process.listenerCount("SIGINT");
    const server = await startServer({ config: { ...config, port: 0 }, dependencies: { database: connection, passwordOptions } });
    expect(process.listenerCount("SIGTERM")).toBe(beforeTerm + 1);
    expect(process.listenerCount("SIGINT")).toBe(beforeInt + 1);
    await server.close();
    expect(process.listenerCount("SIGTERM")).toBe(beforeTerm);
    expect(process.listenerCount("SIGINT")).toBe(beforeInt);
  });
});
