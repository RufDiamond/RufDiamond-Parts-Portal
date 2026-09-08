import { createHash } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import type { Transaction } from "../../db/client.js";
import { idempotencyRecord } from "../../db/schema/index.js";
import { AppError } from "../../plugins/error-handler.js";
import type { MutationContext } from "../audit/repository.js";

export interface StoredResponse {
  status: number;
  body: unknown;
}

export class IdempotencyConflictError extends AppError {
  constructor() {
    super("IDEMPOTENCY_KEY_REUSED", 409, "The idempotency key was already used for a different request context");
    this.name = "IdempotencyConflictError";
  }
}

export class IdempotencyInProgressError extends AppError {
  constructor() {
    super("IDEMPOTENCY_REQUEST_IN_PROGRESS", 409, "The request associated with this idempotency key is still in progress");
    this.name = "IdempotencyInProgressError";
  }
}

function canonicalize(value: unknown, ancestors: Set<object>): string {
  if (value === null) return "null";
  if (typeof value === "string" || typeof value === "boolean") return JSON.stringify(value);
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new TypeError("JSON numbers must be finite");
    return JSON.stringify(value);
  }
  if (typeof value !== "object") throw new TypeError(`Unsupported JSON value: ${typeof value}`);
  if (ancestors.has(value)) throw new TypeError("Unsupported cyclic JSON value");
  ancestors.add(value);
  try {
    if (Array.isArray(value)) {
      const items: string[] = [];
      for (let index = 0; index < value.length; index += 1) {
        if (!Object.hasOwn(value, index)) throw new TypeError("Unsupported sparse JSON array");
        items.push(canonicalize(value[index], ancestors));
      }
      return `[${items.join(",")}]`;
    }
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) throw new TypeError("Unsupported non-plain JSON object");
    return `{${Object.keys(value as Record<string, unknown>).sort().map(key => (
      `${JSON.stringify(key)}:${canonicalize((value as Record<string, unknown>)[key], ancestors)}`
    )).join(",")}}`;
  } finally {
    ancestors.delete(value);
  }
}

export function canonicalJson(value: unknown): string {
  return canonicalize(value, new Set());
}

export function canonicalJsonHash(value: unknown): string {
  return createHash("sha256").update(canonicalJson(value)).digest("hex");
}

function contextualRequestHash(companyId: string, requestHash: string): string {
  if (!/^[a-f0-9]{64}$/.test(requestHash)) throw new TypeError("requestHash must be a lowercase SHA-256 digest");
  return canonicalJsonHash({ bodyHash: requestHash, effectiveCompanyId: companyId, version: 1 });
}

function validateStoredResponse(response: StoredResponse): void {
  if (!Number.isInteger(response.status) || response.status < 100 || response.status > 599) {
    throw new TypeError("Stored response status must be an integer from 100 through 599");
  }
  canonicalJson(response.body);
}

export async function withIdempotency(
  tx: Transaction,
  ctx: MutationContext,
  operation: string,
  key: string,
  requestHash: string,
  execute: () => Promise<StoredResponse>,
): Promise<StoredResponse> {
  if (operation.length === 0) throw new TypeError("operation must not be empty");
  if (key.length < 1 || key.length > 255) throw new TypeError("key must contain between 1 and 255 characters");
  const storedHash = contextualRequestHash(ctx.companyId, requestHash);
  const [inserted] = await tx.insert(idempotencyRecord).values({
    actorId: ctx.actorUserId,
    operation,
    key,
    requestHash: storedHash,
    expiresAt: null,
  }).onConflictDoNothing().returning({ actorId: idempotencyRecord.actorId });

  const [record] = await tx.select({
    requestHash: idempotencyRecord.requestHash,
    status: idempotencyRecord.status,
    response: idempotencyRecord.response,
    responseStatus: idempotencyRecord.responseStatus,
  }).from(idempotencyRecord).where(and(
    eq(idempotencyRecord.actorId, ctx.actorUserId),
    eq(idempotencyRecord.operation, operation),
    eq(idempotencyRecord.key, key),
  )).for("update");

  if (!record) throw new Error("Idempotency record disappeared while locked");
  if (record.requestHash !== storedHash) throw new IdempotencyConflictError();
  if (!inserted) {
    if (record.status !== "completed" || record.responseStatus === null) {
      throw new IdempotencyInProgressError();
    }
    return { status: record.responseStatus, body: record.response };
  }

  const response = await execute();
  validateStoredResponse(response);
  await tx.update(idempotencyRecord).set({
    status: "completed",
    response: response.body === null ? sql`'null'::jsonb` : response.body,
    responseStatus: response.status,
    version: sql`${idempotencyRecord.version} + 1`,
  }).where(and(
    eq(idempotencyRecord.actorId, ctx.actorUserId),
    eq(idempotencyRecord.operation, operation),
    eq(idempotencyRecord.key, key),
  ));
  return response;
}
