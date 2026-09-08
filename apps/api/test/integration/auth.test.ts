import { randomBytes, randomUUID } from "node:crypto";
import argon2 from "argon2";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { buildApp } from "../../src/app.js";
import { createDatabase } from "../../src/db/client.js";
import { createPasswordService, PRODUCTION_PASSWORD_OPTIONS } from "../../src/modules/identity/passwords.js";
import { createIdentityService, sha256 } from "../../src/modules/identity/service.js";
import {
  createPasswordResetDelivery,
  decryptProtectedDelivery,
  encryptProtectedDelivery,
  ProtectedDeliveryError,
} from "../../src/modules/identity/protected-delivery.js";
import { processOutboxBatch } from "../../src/modules/outbox/worker.js";
import { startPostgres } from "../helpers/postgres.js";

const passwordOptions = { type: argon2.argon2id, memoryCost: 2_048, timeCost: 2, parallelism: 1 } as const;
const webOrigin = "https://portal.example.test:8443";
const deliveryKey = randomBytes(32).toString("base64");
const config = {
  nodeEnv: "test" as const,
  port: 0,
  databaseUrl: "postgres://unused",
  sessionSecret: "a-test-session-secret-that-is-long-enough",
  webOrigin,
  allowInsecureLoopbackCookie: false,
  deliveryEncryption: { activeKeyId: "test-key", keys: { "test-key": deliveryKey } },
  s3: {
    endpoint: "http://localhost:9000",
    region: "us-east-1",
    bucket: "rufdiamond-test",
    accessKeyId: "test-access-key",
    secretAccessKey: "test-secret-key",
  },
};

describe("first-party authentication", () => {
  let postgres: Awaited<ReturnType<typeof startPostgres>>;
  let connection: ReturnType<typeof createDatabase>;
  const apps: Array<Awaited<ReturnType<typeof buildApp>>> = [];

  beforeAll(async () => {
    postgres = await startPostgres();
    await postgres.migrate();
    connection = createDatabase(postgres.connectionString);
  }, 120_000);

  beforeEach(async () => {
    await postgres.pool.query("truncate table password_reset_token, session, audit_log, outbox_event, app_user, company cascade");
  });

  afterEach(async () => {
    await Promise.all(apps.splice(0).map(app => app.close()));
  });

  afterAll(async () => {
    await connection?.close();
    await postgres?.stop();
  }, 30_000);

  async function account(status: "active" | "suspended" = "active") {
    const companyId = randomUUID();
    const userId = randomUUID();
    const loginId = `buyer-${userId}@example.test`;
    const password = "correct horse battery staple";
    const passwordHash = await argon2.hash(password, passwordOptions);
    await postgres.pool.query(
      "insert into company(id,name,type,status,discount_rate,default_shipping_address) values($1,'Diamond Customer','customer','active',0.1,'100 Diamond Road')",
      [companyId],
    );
    await postgres.pool.query(
      "insert into app_user(id,company_id,name,login_id,email,password_hash,role_id,status) select $1,$2,'Pat Parts',$3,$3,$4,id,$5 from role where key='purchaser'",
      [userId, companyId, loginId, passwordHash, status],
    );
    return { companyId, userId, loginId, password };
  }

  async function appWithAccess(canViewPrices = false) {
    const app = await buildApp({
      config,
      dependencies: {
        database: connection,
        passwordOptions,
        authorizationResolver: async ({ companyId }: { companyId: string }) => ({
          capabilities: ["catalog.figure.view"],
          scopes: {
            brandIds: ["fat-truck"],
            accountIds: [companyId],
            fleet: [],
            environment: "published" as const,
            priceTier: "standard",
            canViewPrices,
          },
        }),
      } as never,
    });
    apps.push(app);
    return app;
  }

  async function signIn(app: Awaited<ReturnType<typeof buildApp>>, loginId: string, password: string) {
    return app.inject({
      method: "POST",
      url: "/api/v1/auth/sign-in",
      headers: { origin: webOrigin },
      payload: { loginId, password },
    });
  }

  it("sets a secure host-only cookie and returns no session token", async () => {
    const identity = await account();
    const app = await appWithAccess();

    const response = await signIn(app, identity.loginId.toUpperCase(), identity.password);

    expect(response.statusCode).toBe(200);
    expect(response.headers["set-cookie"]).toContain("__Host-ruf-session=");
    expect(response.headers["set-cookie"]).toContain("HttpOnly");
    expect(response.headers["set-cookie"]).toContain("Secure");
    expect(response.headers["set-cookie"]).toContain("SameSite=Lax");
    expect(response.headers["set-cookie"]).toContain("Path=/");
    expect(response.headers["set-cookie"]).toContain("Max-Age=43200");
    expect(response.headers["set-cookie"]).not.toContain("Domain=");
    expect(response.json()).toEqual({ csrfToken: expect.any(String) });
    expect(response.body).not.toContain("sessionToken");
    expect(response.body).not.toContain(identity.password);
    const rawCookieToken = String(response.headers["set-cookie"]).match(/__Host-ruf-session=([^;]+)/)?.[1];
    expect(Buffer.from(rawCookieToken ?? "", "base64url")).toHaveLength(32);
    const stored = (await postgres.pool.query("select token_hash,csrf_token_hash,expires_at-created_at as absolute_lifetime,idle_expires_at-created_at as idle_lifetime from session")).rows[0];
    expect(stored.token_hash).toMatch(/^[a-f0-9]{64}$/);
    expect(stored.csrf_token_hash).toMatch(/^[a-f0-9]{64}$/);
    expect(stored.absolute_lifetime.hours).toBe(12);
    expect(stored.idle_lifetime.minutes).toBe(30);
    expect(String(response.headers["set-cookie"])).not.toContain(stored.token_hash);
  });

  it("returns strict own-company identity data with pricing selected by resolved scope", async () => {
    const identity = await account();
    const app = await appWithAccess(true);
    const login = await signIn(app, identity.loginId, identity.password);
    const cookie = String(login.headers["set-cookie"]).split(";")[0];

    const response = await app.inject({ method: "GET", url: "/api/v1/me", headers: { cookie } });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      id: identity.userId,
      companyId: identity.companyId,
      displayName: "Pat Parts",
      capabilities: ["catalog.figure.view"],
      scopes: {
        brandIds: ["fat-truck"], accountIds: [identity.companyId], fleet: [],
        environment: "published", priceTier: "standard", canViewPrices: true,
      },
      company: {
        id: identity.companyId, name: "Diamond Customer", type: "customer",
        defaultShippingAddress: "100 Diamond Road", discountRate: "0.100000",
      },
      csrfToken: login.json().csrfToken,
    });
    expect(response.body).not.toMatch(/password|tokenHash|sessionToken/i);
  });

  it("defaults authorization to deny-all and omits company pricing", async () => {
    const identity = await account();
    const app = await buildApp({ config, dependencies: { database: connection, passwordOptions } as never });
    apps.push(app);
    const login = await signIn(app, identity.loginId, identity.password);
    const response = await app.inject({
      method: "GET", url: "/api/v1/me",
      headers: { cookie: String(login.headers["set-cookie"]).split(";")[0] },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().capabilities).toEqual([]);
    expect(response.json().scopes).toMatchObject({ brandIds: [], accountIds: [], fleet: [], canViewPrices: false });
    expect(response.json().company).not.toHaveProperty("discountRate");
  });

  it("denies suspended accounts and returns the same safe response for wrong or missing accounts", async () => {
    const suspended = await account("suspended");
    const app = await appWithAccess();
    const responses = await Promise.all([
      signIn(app, suspended.loginId, suspended.password),
      signIn(app, suspended.loginId, "wrong password"),
      signIn(app, "missing@example.test", "wrong password"),
    ]);

    for (const response of responses) {
      expect(response.statusCode).toBe(401);
      expect(response.json()).toMatchObject({ code: "INVALID_CREDENTIALS", title: "Unauthorized", status: 401 });
      expect(response.body).not.toMatch(/suspended|missing@example|wrong password/i);
    }
    expect((await postgres.pool.query("select count(*)::int as count from session")).rows[0].count).toBe(0);
  });

  it.each(["absolute", "idle", "revoked", "user-suspended", "company-suspended"])(
    "rejects a session that is %s",
    async state => {
      const identity = await account();
      const app = await appWithAccess();
      const login = await signIn(app, identity.loginId, identity.password);
      const cookie = String(login.headers["set-cookie"]).split(";")[0];
      if (state === "absolute") await postgres.pool.query("update session set created_at=now()-interval '13 hours',expires_at=now()-interval '1 second',idle_expires_at=now()-interval '2 seconds'");
      if (state === "idle") await postgres.pool.query("update session set idle_expires_at=now()-interval '1 second'");
      if (state === "revoked") await postgres.pool.query("update session set revoked_at=now()");
      if (state === "user-suspended") await postgres.pool.query("update app_user set status='suspended' where id=$1", [identity.userId]);
      if (state === "company-suspended") await postgres.pool.query("update company set status='suspended' where id=$1", [identity.companyId]);

      const response = await app.inject({ method: "GET", url: "/api/v1/me", headers: { cookie } });

      expect(response.statusCode).toBe(401);
      expect(response.json()).toMatchObject({ code: "AUTHENTICATION_REQUIRED", title: "Unauthorized" });
      expect(response.body).not.toMatch(/token|suspended|expired/i);
    },
  );

  it("limits sign-in by canonical account and trusted client IP with a safe response", async () => {
    const identity = await account();
    const app = await appWithAccess();
    for (const loginId of [identity.loginId, "missing@example.test"]) {
      const attempts = [];
      for (let index = 0; index < 6; index += 1) {
        attempts.push(await app.inject({
          method: "POST", url: "/api/v1/auth/sign-in",
          remoteAddress: "192.0.2.10",
          headers: { origin: webOrigin, "x-forwarded-for": `198.51.100.${index}` },
          payload: { loginId, password: "wrong password" },
        }));
      }
      expect(attempts.slice(0, 5).map(response => response.statusCode)).toEqual([401, 401, 401, 401, 401]);
      expect(attempts[5].statusCode).toBe(429);
      expect(attempts[5].json()).toMatchObject({ code: "RATE_LIMITED", title: "Too Many Requests", status: 429 });
      expect(attempts[5].body).not.toMatch(/missing@example|password|198\.51\.100/);
    }
  });

  it("returns indistinguishable reset-request responses and stores only an encrypted outbox envelope", async () => {
    const active = await account();
    const suspended = await account("suspended");
    const app = await appWithAccess();
    const bodies: unknown[] = [];
    for (const loginId of [active.loginId, suspended.loginId, "missing@example.test"]) {
      const response = await app.inject({
        method: "POST", url: "/api/v1/auth/password-reset/request",
        headers: { origin: webOrigin }, payload: { loginId },
      });
      expect(response.statusCode).toBe(202);
      bodies.push(response.json());
    }
    expect(bodies).toEqual([{ accepted: true }, { accepted: true }, { accepted: true }]);
    const events = (await postgres.pool.query("select payload,completed_at from outbox_event order by occurred_at")).rows;
    expect(events).toHaveLength(1);
    expect(events[0].payload).toMatchObject({ keyId: "test-key", nonce: expect.any(String), tag: expect.any(String), ciphertext: expect.any(String) });
    expect(events[0].completed_at).toBeNull();
    const serialized = JSON.stringify(events);
    expect(serialized).not.toContain(active.loginId);
    expect(serialized).not.toMatch(/resetToken|correct horse/i);
    const reset = (await postgres.pool.query("select token_hash,expires_at-created_at as lifetime from password_reset_token")).rows[0];
    expect(reset.token_hash).toMatch(/^[a-f0-9]{64}$/);
    expect(reset.lifetime.minutes).toBe(30);
  });

  it("uses Argon2id with unchanged production-strength defaults and verifies real hashes", async () => {
    expect(PRODUCTION_PASSWORD_OPTIONS).toEqual({
      type: argon2.argon2id, memoryCost: 65_536, timeCost: 3, parallelism: 4, hashLength: 32,
    });
    const passwords = createPasswordService(passwordOptions);
    const encoded = await passwords.hash("a real password value");
    expect(encoded).toMatch(/^\$argon2id\$v=19\$m=2048,p=1,t=2\$/);
    await expect(passwords.verify(encoded, "a real password value")).resolves.toBe(true);
    await expect(passwords.verify(encoded, "wrong")).resolves.toBe(false);
    await expect(passwords.verify("not-a-hash", "wrong")).resolves.toBe(false);
  });

  it("delivers a protected reset only after outbox claim and rejects replay after password/session rotation", async () => {
    const identity = await account();
    const app = await appWithAccess();
    const originalSession = await signIn(app, identity.loginId, identity.password);
    const originalCookie = String(originalSession.headers["set-cookie"]).split(";")[0];
    await app.inject({
      method: "POST", url: "/api/v1/auth/password-reset/request",
      headers: { origin: webOrigin }, payload: { loginId: identity.loginId },
    });
    const delivered: Array<{ recipient: string; resetToken: string; expiresAt: string; providerIdempotencyKey: string }> = [];
    const result = await processOutboxBatch({
      transactionRunner: connection,
      deliveries: {
        "identity.password-reset.requested": createPasswordResetDelivery({
          keyring: config.deliveryEncryption,
          port: { deliverPasswordReset: async message => { delivered.push(message); } },
        }),
      },
    });
    expect(result).toEqual({ claimed: 1, completed: 1, failed: 0, terminal: 0 });
    expect(delivered).toHaveLength(1);
    expect(delivered[0]).toMatchObject({ recipient: identity.loginId, resetToken: expect.any(String), providerIdempotencyKey: expect.any(String) });

    const newPassword = "new correct horse battery staple";
    const complete = await app.inject({
      method: "POST", url: "/api/v1/auth/password-reset/complete", headers: { origin: webOrigin },
      payload: { resetToken: delivered[0].resetToken, newPassword },
    });
    expect(complete.statusCode).toBe(200);
    expect(complete.json()).toEqual({ completed: true });
    expect((await app.inject({ method: "GET", url: "/api/v1/me", headers: { cookie: originalCookie } })).statusCode).toBe(401);
    expect((await signIn(app, identity.loginId, identity.password)).statusCode).toBe(401);
    expect((await signIn(app, identity.loginId, newPassword)).statusCode).toBe(200);

    const replay = await app.inject({
      method: "POST", url: "/api/v1/auth/password-reset/complete", headers: { origin: webOrigin },
      payload: { resetToken: delivered[0].resetToken, newPassword: "another safe password" },
    });
    expect(replay.statusCode).toBe(401);
    expect(replay.json()).toMatchObject({ code: "INVALID_RESET_TOKEN", title: "Unauthorized" });
    expect(replay.body).not.toContain(delivered[0].resetToken);
  });

  it("authenticates envelope context and fails closed for tampering, expiry, and missing rotation keys", () => {
    const recordId = randomUUID();
    const targetId = randomUUID();
    const context = {
      purpose: "password_reset" as const,
      targetId,
      recordId,
      payloadVersion: 1 as const,
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
    };
    const envelope = encryptProtectedDelivery(config.deliveryEncryption, context, { resetToken: "only-inside-ciphertext" });
    const expected = { purpose: "password_reset" as const, targetId, recordId, payloadVersion: 1 as const };
    expect(decryptProtectedDelivery(config.deliveryEncryption, envelope, expected, new Date())).toEqual({ resetToken: "only-inside-ciphertext" });

    const tampered = { ...envelope, context: { ...envelope.context, targetId: randomUUID() } };
    expect(() => decryptProtectedDelivery(config.deliveryEncryption, tampered, expected, new Date())).toThrow(ProtectedDeliveryError);
    expect(() => decryptProtectedDelivery(config.deliveryEncryption, envelope, expected, new Date(Date.now() + 120_000))).toThrow(ProtectedDeliveryError);
    expect(() => decryptProtectedDelivery({ activeKeyId: "next", keys: { next: randomBytes(32).toString("base64") } }, envelope, expected, new Date())).toThrow(ProtectedDeliveryError);
    const rotatedKeyring = { activeKeyId: "next", keys: { ...config.deliveryEncryption.keys, next: randomBytes(32).toString("base64") } };
    expect(decryptProtectedDelivery(rotatedKeyring, envelope, expected, new Date())).toEqual({ resetToken: "only-inside-ciphertext" });
    expect(() => decryptProtectedDelivery(config.deliveryEncryption, { ...envelope, context: null } as never, expected, new Date())).toThrow(ProtectedDeliveryError);
    expect(() => decryptProtectedDelivery(config.deliveryEncryption, { ...envelope, nonce: "not-base64" }, expected, new Date())).toThrow(ProtectedDeliveryError);
    expect(JSON.stringify(envelope)).not.toContain("only-inside-ciphertext");
  });

  it("limits reset requests consistently for existing and nonexistent accounts", async () => {
    const identity = await account();
    const app = await appWithAccess();
    for (const loginId of [identity.loginId, "missing@example.test"]) {
      const statuses: number[] = [];
      for (let index = 0; index < 4; index += 1) {
        statuses.push((await app.inject({
          method: "POST", url: "/api/v1/auth/password-reset/request", remoteAddress: "192.0.2.20",
          headers: { origin: webOrigin }, payload: { loginId },
        })).statusCode);
      }
      expect(statuses).toEqual([202, 202, 202, 429]);
    }
  });

  it("keeps authentication audit metadata redacted and does not attribute denied attempts to targets", async () => {
    const identity = await account("suspended");
    const app = await appWithAccess();
    await signIn(app, identity.loginId, identity.password);
    const row = (await postgres.pool.query("select actor_id,effective_company_id,after_patch from audit_log order by occurred_at desc limit 1")).rows[0];
    expect(row.actor_id).toBeNull();
    expect(row.effective_company_id).toBeNull();
    expect(row.after_patch).toMatchObject({ outcome: "denied", targetUserId: identity.userId, loginFingerprint: expect.stringMatching(/^[a-f0-9]{64}$/) });
    expect(JSON.stringify(row)).not.toContain(identity.loginId);
    expect(JSON.stringify(row)).not.toContain(identity.password);
  });

  it("does not issue a stale session when a reset changes the verified password before insertion", async () => {
    const identity = await account();
    const resetToken = randomBytes(32).toString("base64url");
    const issuedAt = new Date();
    await postgres.pool.query(
      "insert into password_reset_token(token_hash,user_id,expires_at,created_at,updated_at) values($1,$2,$3,$4,$4)",
      [sha256(resetToken), identity.userId, new Date(issuedAt.getTime() + 30 * 60_000), issuedAt],
    );
    const realPasswords = createPasswordService(passwordOptions);
    let releaseVerification!: () => void;
    let observedVerification!: () => void;
    const verificationObserved = new Promise<void>(resolve => { observedVerification = resolve; });
    const verificationRelease = new Promise<void>(resolve => { releaseVerification = resolve; });
    let pauseFirstVerification = true;
    const signInService = await createIdentityService({
      database: connection,
      sessionSecret: config.sessionSecret,
      deliveryEncryption: config.deliveryEncryption,
      passwords: {
        hash: password => realPasswords.hash(password),
        async verify(encodedHash, password) {
          const result = await realPasswords.verify(encodedHash, password);
          if (pauseFirstVerification) {
            pauseFirstVerification = false;
            observedVerification();
            await verificationRelease;
          }
          return result;
        },
      },
    });
    const resetService = await createIdentityService({
      database: connection,
      sessionSecret: config.sessionSecret,
      deliveryEncryption: config.deliveryEncryption,
      passwordOptions,
    });

    const staleSignIn = signInService.authenticate(identity.loginId, identity.password);
    await verificationObserved;
    await resetService.completePasswordReset(resetToken, "replacement password value", "reset-request");
    releaseVerification();

    await expect(staleSignIn).rejects.toMatchObject({ code: "INVALID_CREDENTIALS", status: 401 });
    expect((await postgres.pool.query("select count(*)::int as count from session where revoked_at is null")).rows[0].count).toBe(0);
  });

  it("audits direct privilege-change revocation with the supplied actor context", async () => {
    const identity = await account();
    const service = await createIdentityService({
      database: connection,
      sessionSecret: config.sessionSecret,
      deliveryEncryption: config.deliveryEncryption,
      passwordOptions,
    });
    const session = await service.authenticate(identity.loginId, identity.password);
    await service.revokeForPrivilegeChange(identity.userId, {
      actorUserId: identity.userId,
      companyId: identity.companyId,
      capability: "accounts.manage",
      requestId: "privilege-change-request",
    });

    await expect(service.readSession(session.sessionToken)).resolves.toBeNull();
    const audit = (await postgres.pool.query("select actor_id,effective_company_id,capability,object_type,object_id,after_patch,request_id from audit_log where request_id='privilege-change-request'")).rows[0];
    expect(audit).toEqual({
      actor_id: identity.userId,
      effective_company_id: identity.companyId,
      capability: "accounts.manage",
      object_type: "app_user",
      object_id: identity.userId,
      after_patch: { action: "privilege_change", revokedCount: 1 },
      request_id: "privilege-change-request",
    });
  });
});
