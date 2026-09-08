import { randomUUID } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import type { Transaction } from "../../db/client.js";
import { outboxEvent } from "../../db/schema/index.js";
import { isSensitiveMaterialKey, writeAuditLog, type MutationContext } from "../audit/repository.js";

export interface EnqueueOutboxEvent {
  eventType: string;
  aggregateType: string;
  aggregateId: string;
  payload: unknown;
  payloadVersion?: number;
  availableAt?: Date;
  deduplicationKey?: string;
}

export interface ClaimedOutboxEvent {
  id: string;
  eventType: string;
  aggregateType: string;
  aggregateId: string;
  payloadVersion: number;
  payload: unknown;
  occurredAt: Date;
  attempts: number;
  deduplicationKey: string | null;
  leaseToken: string;
}

export interface FailedOutboxEvent {
  updated: boolean;
  terminal: boolean;
  attempts: number | null;
}

function containsSensitiveMaterial(value: unknown): boolean {
  if (Array.isArray(value)) return value.some(containsSensitiveMaterial);
  if (value === null || typeof value !== "object") return false;
  return Object.entries(value).some(([key, nested]) => isSensitiveMaterialKey(key) || containsSensitiveMaterial(nested));
}

export async function enqueueOutboxEvent(tx: Transaction, event: EnqueueOutboxEvent): Promise<string> {
  if (containsSensitiveMaterial(event.payload)) throw new TypeError("Generic outbox payloads cannot contain credential or authentication material");
  const [stored] = await tx.insert(outboxEvent).values({
    eventType: event.eventType,
    aggregateType: event.aggregateType,
    aggregateId: event.aggregateId,
    payload: event.payload,
    payloadVersion: event.payloadVersion,
    availableAt: event.availableAt,
    deduplicationKey: event.deduplicationKey,
  }).returning({ id: outboxEvent.id });
  return stored.id;
}

export async function claimOutboxEvents(tx: Transaction): Promise<ClaimedOutboxEvent[]> {
  const leaseToken = randomUUID();
  const claimed = await tx.execute(sql`
    WITH claimable AS (
      SELECT id FROM outbox_event
      WHERE completed_at IS NULL AND attempts < 12 AND available_at <= now()
        AND (locked_at IS NULL OR locked_at < now() - interval '5 minutes')
      ORDER BY available_at, id FOR UPDATE SKIP LOCKED LIMIT 20
    )
    UPDATE outbox_event AS event
    SET locked_at = now(), locked_by = ${leaseToken}, version = event.version + 1
    FROM claimable
    WHERE event.id = claimable.id
    RETURNING event.id, event.event_type, event.aggregate_type, event.aggregate_id,
      event.payload_version, event.payload, event.occurred_at, event.attempts,
      event.deduplication_key
  `);
  return (claimed.rows as Array<Record<string, unknown>>).map(row => ({
    id: row.id as string,
    eventType: row.event_type as string,
    aggregateType: row.aggregate_type as string,
    aggregateId: row.aggregate_id as string,
    payloadVersion: row.payload_version as number,
    payload: row.payload,
    occurredAt: row.occurred_at as Date,
    attempts: row.attempts as number,
    deduplicationKey: row.deduplication_key as string | null,
    leaseToken,
  }));
}

export async function completeOutboxEvent(tx: Transaction, id: string, leaseToken: string): Promise<boolean> {
  const completed = await tx.update(outboxEvent).set({
    completedAt: sql`now()`,
    lockedAt: null,
    lockedBy: null,
    lastError: null,
    version: sql`${outboxEvent.version} + 1`,
  }).where(and(
    eq(outboxEvent.id, id),
    eq(outboxEvent.lockedBy, leaseToken),
    sql`${outboxEvent.completedAt} IS NULL`,
  )).returning({ id: outboxEvent.id });
  return completed.length === 1;
}

function safeErrorCode(error: unknown): string {
  if (typeof error === "object" && error !== null) {
    const candidate = error as { name?: unknown; code?: unknown };
    const name = typeof candidate.name === "string" && /^[A-Za-z][A-Za-z0-9_.-]{0,63}$/.test(candidate.name) ? candidate.name : "DeliveryError";
    const code = typeof candidate.code === "string" && /^[A-Z][A-Z0-9_]{0,63}$/.test(candidate.code) ? candidate.code : undefined;
    return code ? `${name}:${code}` : name;
  }
  return "DeliveryError";
}

export async function failOutboxEvent(tx: Transaction, id: string, leaseToken: string, error: unknown): Promise<FailedOutboxEvent> {
  const failed = await tx.execute(sql`
    UPDATE outbox_event
    SET attempts = attempts + 1,
        available_at = now() + least(interval '1 hour', interval '5 seconds' * power(2, attempts)),
        locked_at = NULL,
        locked_by = NULL,
        last_error = ${safeErrorCode(error)},
        version = version + 1
    WHERE id = ${id} AND locked_by = ${leaseToken} AND completed_at IS NULL
    RETURNING attempts
  `);
  const row = failed.rows[0] as { attempts: number } | undefined;
  return row
    ? { updated: true, terminal: row.attempts >= 12, attempts: row.attempts }
    : { updated: false, terminal: false, attempts: null };
}

export async function retryOutboxEvent(tx: Transaction, ctx: MutationContext, id: string): Promise<boolean> {
  const reset = await tx.update(outboxEvent).set({
    attempts: 0,
    availableAt: sql`now()`,
    lockedAt: null,
    lockedBy: null,
    lastError: null,
    version: sql`${outboxEvent.version} + 1`,
  }).where(and(
    eq(outboxEvent.id, id),
    sql`${outboxEvent.completedAt} IS NULL`,
    sql`${outboxEvent.attempts} >= 12`,
  )).returning({ id: outboxEvent.id });
  if (reset.length === 0) return false;
  await writeAuditLog(tx, ctx, {
    objectType: "outbox_event",
    objectId: id,
    after: { action: "retry_requested" },
  });
  return true;
}
