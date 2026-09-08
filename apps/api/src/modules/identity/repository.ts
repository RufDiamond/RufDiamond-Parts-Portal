import { and, eq, isNull, sql } from "drizzle-orm";

import type { Database, Transaction } from "../../db/client.js";
import { appUser, company, passwordResetToken, session } from "../../db/schema/index.js";

export interface IdentityAccount {
  userId: string;
  companyId: string;
  displayName: string;
  loginId: string;
  email: string;
  passwordHash: string;
  userStatus: "active" | "suspended" | "invited" | "disabled";
  companyStatus: "active" | "suspended" | "inactive";
  companyName: string;
  companyType: "customer" | "dealer" | "internal";
  discountRate: string;
  defaultShippingAddress: string | null;
}

const accountSelection = {
  userId: appUser.id,
  companyId: appUser.companyId,
  displayName: appUser.name,
  loginId: appUser.loginId,
  email: appUser.email,
  passwordHash: appUser.passwordHash,
  userStatus: appUser.status,
  companyStatus: company.status,
  companyName: company.name,
  companyType: company.type,
  discountRate: company.discountRate,
  defaultShippingAddress: company.defaultShippingAddress,
};

export async function findAccountByLoginId(db: Database, loginId: string): Promise<IdentityAccount | null> {
  const [row] = await db.select(accountSelection).from(appUser)
    .innerJoin(company, eq(company.id, appUser.companyId))
    .where(eq(appUser.loginId, loginId)).limit(1);
  return row ?? null;
}

export async function findAccountByLoginIdForUpdate(tx: Transaction, loginId: string): Promise<IdentityAccount | null> {
  const [row] = await tx.select(accountSelection).from(appUser)
    .innerJoin(company, eq(company.id, appUser.companyId))
    .where(eq(appUser.loginId, loginId)).limit(1)
    .for("update", { of: appUser });
  return row ?? null;
}

export async function findSessionAccount(db: Database, tokenHash: string) {
  const [row] = await db.select({
    sessionId: session.id,
    csrfTokenHash: session.csrfTokenHash,
    expiresAt: session.expiresAt,
    idleExpiresAt: session.idleExpiresAt,
    revokedAt: session.revokedAt,
    ...accountSelection,
  }).from(session)
    .innerJoin(appUser, eq(appUser.id, session.userId))
    .innerJoin(company, eq(company.id, appUser.companyId))
    .where(eq(session.tokenHash, tokenHash)).limit(1);
  return row ?? null;
}

export async function insertSession(tx: Transaction, values: {
  tokenHash: string;
  csrfTokenHash: string;
  userId: string;
  expiresAt: Date;
  idleExpiresAt: Date;
  now: Date;
}): Promise<string> {
  const [created] = await tx.insert(session).values({
    tokenHash: values.tokenHash,
    csrfTokenHash: values.csrfTokenHash,
    userId: values.userId,
    expiresAt: values.expiresAt,
    idleExpiresAt: values.idleExpiresAt,
    lastUsedAt: values.now,
    createdAt: values.now,
    updatedAt: values.now,
  }).returning({ id: session.id });
  return created.id;
}

export async function touchSession(db: Database, sessionId: string, idleExpiresAt: Date, now: Date): Promise<boolean> {
  const updated = await db.update(session).set({
    idleExpiresAt,
    lastUsedAt: now,
    updatedAt: now,
    version: sql`${session.version} + 1`,
  }).where(and(eq(session.id, sessionId), isNull(session.revokedAt))).returning({ id: session.id });
  return updated.length === 1;
}

export async function revokeSession(tx: Transaction, tokenHash: string, now: Date): Promise<number> {
  return (await tx.update(session).set({
    revokedAt: now,
    updatedAt: now,
    version: sql`${session.version} + 1`,
  }).where(and(eq(session.tokenHash, tokenHash), isNull(session.revokedAt))).returning({ id: session.id })).length;
}

export async function revokeAllSessions(tx: Transaction, userId: string, now: Date): Promise<number> {
  return (await tx.update(session).set({
    revokedAt: now,
    updatedAt: now,
    version: sql`${session.version} + 1`,
  }).where(and(eq(session.userId, userId), isNull(session.revokedAt))).returning({ id: session.id })).length;
}

export async function insertPasswordReset(tx: Transaction, values: {
  id: string;
  tokenHash: string;
  userId: string;
  expiresAt: Date;
  now: Date;
}): Promise<void> {
  await tx.insert(passwordResetToken).values({ ...values, createdAt: values.now, updatedAt: values.now });
}

export async function consumePasswordReset(tx: Transaction, tokenHash: string, now: Date) {
  const rows = await tx.execute(sql`
    SELECT pr.id, pr.user_id, pr.expires_at
    FROM password_reset_token pr
    JOIN app_user u ON u.id = pr.user_id
    JOIN company c ON c.id = u.company_id
    WHERE pr.token_hash = ${tokenHash}
      AND pr.consumed_at IS NULL
      AND pr.expires_at > ${now}
      AND u.status = 'active'
      AND c.status = 'active'
    FOR UPDATE OF pr, u
  `);
  const row = rows.rows[0] as { id: string; user_id: string; expires_at: Date } | undefined;
  if (!row) return null;
  await tx.update(passwordResetToken).set({ consumedAt: now, updatedAt: now, version: sql`${passwordResetToken.version} + 1` })
    .where(and(eq(passwordResetToken.id, row.id), isNull(passwordResetToken.consumedAt)));
  return { id: row.id, userId: row.user_id, expiresAt: row.expires_at };
}

export async function updatePassword(tx: Transaction, userId: string, passwordHash: string, now: Date): Promise<void> {
  await tx.update(appUser).set({ passwordHash, updatedAt: now, version: sql`${appUser.version} + 1` }).where(eq(appUser.id, userId));
}
