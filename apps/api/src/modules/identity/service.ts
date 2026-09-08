import { createHash, createHmac, randomBytes, randomUUID } from "node:crypto";
import type { MeResponse, SessionScopeSummary, SessionUser } from "@rufdiamond/contracts";
import type { HashOptions } from "argon2";

import type { Database, Transaction } from "../../db/client.js";
import { AppError } from "../../plugins/error-handler.js";
import { writeAuditLog } from "../audit/repository.js";
import { enqueueOutboxEvent } from "../outbox/repository.js";
import { createPasswordService, type PasswordService } from "./passwords.js";
import { encryptProtectedDelivery, type DeliveryKeyring } from "./protected-delivery.js";
import {
  findAccountByLoginId,
  findSessionAccount,
  consumePasswordReset,
  insertPasswordReset,
  insertSession,
  revokeAllSessions,
  revokeSession,
  touchSession,
  updatePassword,
  type IdentityAccount,
} from "./repository.js";

const ABSOLUTE_SESSION_MS = 12 * 60 * 60 * 1_000;
const IDLE_SESSION_MS = 30 * 60 * 1_000;
const NIL_UUID = "00000000-0000-0000-0000-000000000000";

export interface AuthorizationResolution {
  capabilities: string[];
  scopes: SessionScopeSummary;
}

export interface AuthorizationResolverInput { userId: string; companyId: string }
export type AuthorizationResolver = (input: AuthorizationResolverInput) => Promise<AuthorizationResolution>;

export const denyAllAuthorization: AuthorizationResolver = async () => ({
  capabilities: [],
  scopes: {
    brandIds: [], accountIds: [], fleet: [], environment: "published",
    priceTier: "", canViewPrices: false,
  },
});

export interface IdentityServiceOptions {
  database: { db: Database; withTransaction<T>(fn: (tx: Transaction) => Promise<T>): Promise<T> };
  sessionSecret: string;
  authorizationResolver?: AuthorizationResolver;
  passwordOptions?: HashOptions;
  passwords?: PasswordService;
  now?: () => Date;
  deliveryEncryption: DeliveryKeyring;
}

export interface AuthenticatedSession {
  user: SessionUser;
  profile: MeResponse;
  rawToken: string;
  csrfToken: string;
}

export interface IdentityService {
  authenticate(loginId: string, password: string): Promise<{ sessionToken: string; csrfToken: string }>;
  authenticateForRequest(loginId: string, password: string, requestId: string): Promise<{ sessionToken: string; csrfToken: string }>;
  readSession(token: string): Promise<SessionUser | null>;
  readSessionDetails(token: string): Promise<AuthenticatedSession | null>;
  signOut(token: string, allSessions?: boolean): Promise<void>;
  revokeForPrivilegeChange(userId: string): Promise<void>;
  requestPasswordReset(loginId: string, requestId: string): Promise<void>;
  completePasswordReset(resetToken: string, newPassword: string, requestId: string): Promise<void>;
}

export function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function stableCsrf(sessionSecret: string, rawToken: string): string {
  return createHmac("sha256", sessionSecret).update(`ruf-csrf-v1\0${rawToken}`).digest("base64url");
}

type ActiveAccount = IdentityAccount & { userStatus: "active"; companyStatus: "active" };

function isActive(account: IdentityAccount | null): account is ActiveAccount {
  return account?.userStatus === "active" && account.companyStatus === "active";
}

export async function createIdentityService(options: IdentityServiceOptions): Promise<IdentityService> {
  const passwords = options.passwords ?? createPasswordService(options.passwordOptions);
  const resolveAuthorization = options.authorizationResolver ?? denyAllAuthorization;
  const now = options.now ?? (() => new Date());
  const dummyHash = await passwords.hash(`dummy-${randomBytes(32).toString("base64url")}`);

  async function authenticateForRequest(loginId: string, password: string, requestId: string) {
    const canonicalLoginId = loginId.trim().toLowerCase();
    const account = await findAccountByLoginId(options.database.db, canonicalLoginId);
    const matches = await passwords.verify(account?.passwordHash ?? dummyHash, password);
    if (!matches || !isActive(account)) {
      await options.database.withTransaction(tx => writeAuditLog(tx, {
        actorUserId: null,
        companyId: null,
        capability: "identity.sign-in",
        requestId,
      }, {
        objectType: "app_user",
        objectId: account?.userId ?? NIL_UUID,
        after: { outcome: "denied", targetUserId: account?.userId ?? null, loginFingerprint: sha256(canonicalLoginId) },
      }));
      throw new AppError("INVALID_CREDENTIALS", 401, "The supplied credentials are invalid.");
    }

    const sessionToken = randomBytes(32).toString("base64url");
    const csrfToken = stableCsrf(options.sessionSecret, sessionToken);
    const issuedAt = now();
    await options.database.withTransaction(async tx => {
      const sessionId = await insertSession(tx, {
        tokenHash: sha256(sessionToken),
        csrfTokenHash: sha256(csrfToken),
        userId: account.userId,
        expiresAt: new Date(issuedAt.getTime() + ABSOLUTE_SESSION_MS),
        idleExpiresAt: new Date(issuedAt.getTime() + IDLE_SESSION_MS),
        now: issuedAt,
      });
      await writeAuditLog(tx, {
        actorUserId: account.userId,
        companyId: account.companyId,
        capability: "identity.sign-in",
        requestId,
      }, { objectType: "session", objectId: sessionId, after: { outcome: "created" } });
    });
    return { sessionToken, csrfToken };
  }

  async function readSessionDetails(token: string): Promise<AuthenticatedSession | null> {
    if (!token) return null;
    const current = now();
    const account = await findSessionAccount(options.database.db, sha256(token));
    if (!account || account.revokedAt || !isActive(account)
      || account.expiresAt.getTime() <= current.getTime()
      || account.idleExpiresAt.getTime() <= current.getTime()) return null;
    const csrfToken = stableCsrf(options.sessionSecret, token);
    if (sha256(csrfToken) !== account.csrfTokenHash) return null;
    const nextIdle = new Date(Math.min(account.expiresAt.getTime(), current.getTime() + IDLE_SESSION_MS));
    if (!await touchSession(options.database.db, account.sessionId, nextIdle, current)) return null;
    const authorization = await resolveAuthorization({ userId: account.userId, companyId: account.companyId });
    const user: SessionUser = {
      id: account.userId,
      companyId: account.companyId,
      capabilities: authorization.capabilities,
      scopes: authorization.scopes,
    };
    const common = {
      ...user,
      displayName: account.displayName,
      csrfToken,
    };
    const company = {
      id: account.companyId,
      name: account.companyName,
      type: account.companyType,
      defaultShippingAddress: account.defaultShippingAddress,
    };
    const profile = authorization.scopes.canViewPrices
      ? { ...common, scopes: { ...authorization.scopes, canViewPrices: true as const }, company: { ...company, discountRate: account.discountRate } }
      : { ...common, scopes: { ...authorization.scopes, canViewPrices: false as const }, company };
    return { user, profile, rawToken: token, csrfToken };
  }

  return {
    authenticate: (loginId, password) => authenticateForRequest(loginId, password, "authentication"),
    authenticateForRequest,
    readSession: async token => (await readSessionDetails(token))?.user ?? null,
    readSessionDetails,
    async signOut(token, allSessions = false) {
      const details = await readSessionDetails(token);
      if (!details) return;
      const current = now();
      await options.database.withTransaction(tx => allSessions
        ? revokeAllSessions(tx, details.user.id, current).then(() => undefined)
        : revokeSession(tx, sha256(token), current).then(() => undefined));
    },
    async revokeForPrivilegeChange(userId) {
      await options.database.withTransaction(tx => revokeAllSessions(tx, userId, now()).then(() => undefined));
    },
    async requestPasswordReset(loginId, requestId) {
      const canonicalLoginId = loginId.trim().toLowerCase();
      const account = await findAccountByLoginId(options.database.db, canonicalLoginId);
      const targetId = account?.userId ?? NIL_UUID;
      if (!isActive(account)) {
        await options.database.withTransaction(tx => writeAuditLog(tx, {
          actorUserId: null, companyId: null, capability: "identity.password-reset.request", requestId,
        }, { objectType: "app_user", objectId: targetId, after: { outcome: "accepted", targetUserId: account?.userId ?? null } }));
        return;
      }
      const resetToken = randomBytes(32).toString("base64url");
      const recordId = randomUUID();
      const issuedAt = now();
      const expiresAt = new Date(issuedAt.getTime() + 30 * 60 * 1_000);
      const envelope = encryptProtectedDelivery(options.deliveryEncryption, {
        purpose: "password_reset", targetId: account.userId, recordId, payloadVersion: 1, expiresAt: expiresAt.toISOString(),
      }, { recipient: account.email, resetToken, targetId: account.userId });
      await options.database.withTransaction(async tx => {
        await insertPasswordReset(tx, { id: recordId, tokenHash: sha256(resetToken), userId: account.userId, expiresAt, now: issuedAt });
        await enqueueOutboxEvent(tx, {
          eventType: "identity.password-reset.requested", aggregateType: "password_reset_token", aggregateId: recordId,
          payload: envelope, payloadVersion: 1, deduplicationKey: `password-reset:${recordId}`,
        });
        await writeAuditLog(tx, {
          actorUserId: null, companyId: null, capability: "identity.password-reset.request", requestId,
        }, { objectType: "password_reset_token", objectId: recordId, after: { outcome: "created", targetUserId: account.userId, expiresAt: expiresAt.toISOString() } });
      });
    },
    async completePasswordReset(resetToken, newPassword, requestId) {
      const passwordHash = await passwords.hash(newPassword);
      const current = now();
      await options.database.withTransaction(async tx => {
        const reset = await consumePasswordReset(tx, sha256(resetToken), current);
        if (!reset) throw new AppError("INVALID_RESET_TOKEN", 401, "The password reset request is invalid or expired.");
        await updatePassword(tx, reset.userId, passwordHash, current);
        await revokeAllSessions(tx, reset.userId, current);
        await writeAuditLog(tx, {
          actorUserId: null, companyId: null, capability: "identity.password-reset.complete", requestId,
        }, { objectType: "password_reset_token", objectId: reset.id, after: { outcome: "consumed", targetUserId: reset.userId } });
      });
    },
  };
}
