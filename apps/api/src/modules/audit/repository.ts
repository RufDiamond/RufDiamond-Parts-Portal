import type { Transaction } from "../../db/client.js";
import { auditLog } from "../../db/schema/index.js";

export interface MutationContext {
  actorUserId: string;
  companyId: string;
  capability: string;
  requestId: string;
}

export interface AuditEntry {
  objectType: string;
  objectId: string;
  before?: unknown;
  after?: unknown;
  correlationId?: string;
}

const REDACTED = "[REDACTED]";

export function isSensitiveMaterialKey(key: string): boolean {
  const normalized = key.toLowerCase().replace(/[^a-z0-9]/g, "");
  return normalized.includes("password")
    || normalized.includes("credential")
    || normalized.includes("session")
    || normalized.includes("resettoken")
    || normalized.includes("mfasecret")
    || normalized.includes("secret")
    || normalized === "token"
    || normalized === "authorization"
    || normalized === "cookie"
    || normalized.endsWith("cookie")
    || normalized.endsWith("apikey")
    || normalized.endsWith("accesstoken")
    || normalized.endsWith("refreshtoken");
}

export function redactAuditValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redactAuditValue);
  if (value === null || typeof value !== "object") return value;
  return Object.fromEntries(Object.entries(value).map(([key, nested]) => [
    key,
    isSensitiveMaterialKey(key) ? REDACTED : redactAuditValue(nested),
  ]));
}

export async function writeAuditLog(tx: Transaction, ctx: MutationContext, entry: AuditEntry): Promise<string> {
  const [stored] = await tx.insert(auditLog).values({
    actorId: ctx.actorUserId,
    effectiveCompanyId: ctx.companyId,
    capability: ctx.capability,
    objectType: entry.objectType,
    objectId: entry.objectId,
    beforePatch: entry.before === undefined ? null : redactAuditValue(entry.before),
    afterPatch: entry.after === undefined ? null : redactAuditValue(entry.after),
    requestId: ctx.requestId,
    correlationId: entry.correlationId,
  }).returning({ id: auditLog.id });
  return stored.id;
}
