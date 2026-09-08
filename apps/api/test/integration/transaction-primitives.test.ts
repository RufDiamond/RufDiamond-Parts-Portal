import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createDatabase, type Transaction } from "../../src/db/client.js";
import * as schema from "../../src/db/schema/index.js";
import { redactAuditValue, writeAuditLog } from "../../src/modules/audit/repository.js";
import {
  claimOutboxEvents,
  completeOutboxEvent,
  enqueueOutboxEvent,
  failOutboxEvent,
  retryOutboxEvent,
} from "../../src/modules/outbox/repository.js";
import {
  canonicalJsonHash,
  IdempotencyConflictError,
  withIdempotency,
} from "../../src/modules/outbox/idempotency.js";
import { processOutboxBatch } from "../../src/modules/outbox/worker.js";
import { startPostgres } from "../helpers/postgres.js";

describe("transactional mutation primitives", () => {
  let postgres: Awaited<ReturnType<typeof startPostgres>>;
  let connection: ReturnType<typeof createDatabase>;

  beforeAll(async () => {
    postgres = await startPostgres();
    await postgres.migrate();
    connection = createDatabase(postgres.connectionString);
  }, 120_000);

  beforeEach(async () => {
    await postgres.pool.query('truncate table "order", audit_log, outbox_event, idempotency_record cascade');
  });

  afterAll(async () => {
    await connection?.close();
    await postgres?.stop();
  }, 30_000);

  async function account() {
    const companyId = randomUUID();
    const actorUserId = randomUUID();
    const loginId = `${actorUserId}@example.test`;
    await postgres.pool.query("insert into company(id,name) values($1,$2)", [companyId, `Company ${companyId}`]);
    await postgres.pool.query(
      "insert into app_user(id,company_id,name,login_id,email,password_hash,role_id) select $1,$2,'Buyer',$3,$3,'argon2-placeholder',id from role where key='purchaser'",
      [actorUserId, companyId, loginId],
    );
    return { actorUserId, companyId };
  }

  async function orderFixture() {
    const identity = await account();
    const productLineId = randomUUID();
    const modelId = randomUUID();
    const variantId = randomUUID();
    const releaseId = randomUUID();
    const releasedModelId = randomUUID();
    await postgres.pool.query("insert into product_line(id,name,normalized_name) values($1,$2,lower($2))", [productLineId, `Line ${productLineId}`]);
    await postgres.pool.query("insert into model(id,product_line_id,name) values($1,$2,$3)", [modelId, productLineId, `Model ${modelId}`]);
    await postgres.pool.query("insert into variant(id,model_id,label) values($1,$2,$3)", [variantId, modelId, `Variant ${variantId}`]);
    await postgres.pool.query("insert into publication_release(id,model_id,revision,source_checksum) values($1,$2,1,repeat('a',64))", [releaseId, modelId]);
    await postgres.pool.query(
      "insert into release_model(release_id,id,working_id,product_line_id,product_line_name,name,status) values($1,$2,$3,$4,'Line','Model','active')",
      [releaseId, releasedModelId, modelId, productLineId],
    );
    await postgres.pool.query(
      "insert into release_variant(release_id,id,working_id,model_id,label) values($1,$2,$3,$4,'Variant')",
      [releaseId, randomUUID(), variantId, releasedModelId],
    );
    return { ...identity, variantId, releaseId };
  }

  function context(identity: { actorUserId: string; companyId: string }) {
    return {
      actorUserId: identity.actorUserId,
      companyId: identity.companyId,
      capability: "orders.submit",
      requestId: randomUUID(),
    };
  }

  async function insertOrder(tx: Transaction, fixture: Awaited<ReturnType<typeof orderFixture>>, orderId = randomUUID()) {
    await tx.insert(schema.order).values({
      id: orderId,
      companyId: fixture.companyId,
      submittedByUserId: fixture.actorUserId,
      variantId: fixture.variantId,
      releaseId: fixture.releaseId,
      currency: "CAD",
      listTotal: "10.00",
      discountApplied: "0.00",
      netTotal: "10.00",
    });
    return orderId;
  }

  it("rolls domain, audit, outbox, and idempotency state back together", async () => {
    const fixture = await orderFixture();
    const ctx = context(fixture);
    const orderId = randomUUID();
    const requestHash = canonicalJsonHash({ lines: [{ part: "P-1", qty: 1 }] });

    await expect(connection.withTransaction(async tx => withIdempotency(tx, ctx, "orders.submit", "rollback-key", requestHash, async () => {
      await insertOrder(tx, fixture, orderId);
      await writeAuditLog(tx, ctx, { objectType: "order", objectId: orderId, after: { status: "submitted" } });
      await enqueueOutboxEvent(tx, { eventType: "rfq.submitted", aggregateType: "order", aggregateId: orderId, payload: { orderId } });
      throw new Error("abort domain mutation");
    }))).rejects.toThrow("abort domain mutation");

    for (const table of ['"order"', "audit_log", "outbox_event", "idempotency_record"]) {
      expect((await postgres.pool.query(`select count(*)::int as n from ${table}`)).rows[0].n).toBe(0);
    }
  });

  it("replays a matching completed response without repeating the order side effect", async () => {
    const fixture = await orderFixture();
    const ctx = context(fixture);
    const hash = canonicalJsonHash({ reference: "PO-7", lines: [{ qty: 1, part: "P-1" }] });
    const execute = async (tx: Transaction) => {
      const id = await insertOrder(tx, fixture);
      return { status: 201, body: { id, state: "submitted" } };
    };

    const first = await connection.withTransaction(tx => withIdempotency(tx, ctx, "orders.submit", "same-key", hash, () => execute(tx)));
    const second = await connection.withTransaction(tx => withIdempotency(tx, { ...ctx, requestId: randomUUID() }, "orders.submit", "same-key", hash, () => execute(tx)));

    expect(second.body).toEqual(first.body);
    expect((await postgres.pool.query('SELECT count(*)::int AS n FROM "order"')).rows[0].n).toBe(1);
  });

  it("rejects a changed request body or effective company for the same actor operation key", async () => {
    const fixture = await orderFixture();
    const ctx = context(fixture);
    const otherCompanyId = randomUUID();
    await postgres.pool.query("insert into company(id,name) values($1,'Other')", [otherCompanyId]);
    const execute = async () => ({ status: 202, body: { accepted: true } });
    await connection.withTransaction(tx => withIdempotency(tx, ctx, "orders.submit", "conflict-key", canonicalJsonHash({ qty: 1 }), execute));

    await expect(connection.withTransaction(tx => withIdempotency(tx, ctx, "orders.submit", "conflict-key", canonicalJsonHash({ qty: 2 }), execute)))
      .rejects.toMatchObject({ status: 409, code: "IDEMPOTENCY_KEY_REUSED" });
    await expect(connection.withTransaction(tx => withIdempotency(tx, { ...ctx, companyId: otherCompanyId }, "orders.submit", "conflict-key", canonicalJsonHash({ qty: 1 }), execute)))
      .rejects.toBeInstanceOf(IdempotencyConflictError);
  });

  it("executes simultaneous requests for one key only once", async () => {
    const fixture = await orderFixture();
    const ctx = context(fixture);
    const hash = canonicalJsonHash({ lines: [{ part: "P-1", qty: 1 }] });
    let executions = 0;
    const invoke = () => connection.withTransaction(tx => withIdempotency(tx, ctx, "orders.submit", "parallel-key", hash, async () => {
      executions += 1;
      const id = await insertOrder(tx, fixture);
      return { status: 201, body: { id } };
    }));

    const [first, second] = await Promise.all([invoke(), invoke()]);

    expect(second.body).toEqual(first.body);
    expect(executions).toBe(1);
    expect((await postgres.pool.query('SELECT count(*)::int AS n FROM "order"')).rows[0].n).toBe(1);
  });

  it("canonicalizes object keys, preserves array order, and rejects unsupported JSON", () => {
    expect(canonicalJsonHash({ z: 1, a: { y: true, x: null } })).toBe(canonicalJsonHash({ a: { x: null, y: true }, z: 1 }));
    expect(canonicalJsonHash({ values: [1, 2] })).not.toBe(canonicalJsonHash({ values: [2, 1] }));
    expect(() => canonicalJsonHash({ value: Number.POSITIVE_INFINITY })).toThrow("finite");
    expect(() => canonicalJsonHash({ value: undefined })).toThrow("Unsupported");
  });

  it("reclaims crashed leases only after expiry and rejects stale acknowledgements", async () => {
    const aggregateId = randomUUID();
    await connection.withTransaction(tx => enqueueOutboxEvent(tx, {
      eventType: "rfq.submitted", aggregateType: "order", aggregateId, payload: { aggregateId },
    }));

    const [crashed] = await connection.withTransaction(tx => claimOutboxEvents(tx));
    expect(crashed).toBeDefined();
    expect(await connection.withTransaction(tx => claimOutboxEvents(tx))).toHaveLength(0);
    await postgres.pool.query("update outbox_event set locked_at=now() - interval '6 minutes' where id=$1", [crashed.id]);
    const [reclaimed] = await connection.withTransaction(tx => claimOutboxEvents(tx));

    expect(reclaimed.leaseToken).not.toBe(crashed.leaseToken);
    await expect(connection.withTransaction(tx => completeOutboxEvent(tx, crashed.id, crashed.leaseToken))).resolves.toBe(false);
    await expect(connection.withTransaction(tx => completeOutboxEvent(tx, reclaimed.id, reclaimed.leaseToken))).resolves.toBe(true);
  });

  it("lets two workers claim disjoint batches", async () => {
    for (let index = 0; index < 25; index += 1) {
      await connection.withTransaction(tx => enqueueOutboxEvent(tx, {
        eventType: "test.delivery", aggregateType: "order", aggregateId: randomUUID(), payload: { index },
      }));
    }

    const [left, right] = await Promise.all([
      connection.withTransaction(tx => claimOutboxEvents(tx)),
      connection.withTransaction(tx => claimOutboxEvents(tx)),
    ]);

    expect([left.length, right.length].sort((a, b) => a - b)).toEqual([5, 20]);
    expect(new Set([...left, ...right].map(event => event.id)).size).toBe(25);
  });

  it("delivers after the lease commits and completes in a separate transaction", async () => {
    await connection.withTransaction(tx => enqueueOutboxEvent(tx, {
      eventType: "test.delivery", aggregateType: "order", aggregateId: randomUUID(), payload: { safe: true }, deduplicationKey: "rfq:7",
    }));
    let insideTransaction = false;
    const delivered: Array<{ providerIdempotencyKey: string }> = [];
    const runner = {
      withTransaction: <T>(fn: (tx: Transaction) => Promise<T>) => connection.withTransaction(async tx => {
        insideTransaction = true;
        try { return await fn(tx); } finally { insideTransaction = false; }
      }),
    };

    await processOutboxBatch({
      transactionRunner: runner,
      deliveries: {
        "test.delivery": async message => {
          expect(insideTransaction).toBe(false);
          delivered.push(message);
        },
      },
    });

    expect(delivered).toHaveLength(1);
    expect(delivered[0].providerIdempotencyKey).toBe("rfq:7");
    expect((await postgres.pool.query("select completed_at is not null as completed, attempts from outbox_event")).rows[0]).toEqual({ completed: true, attempts: 0 });
  });

  it("backs failures off, stops after twelve failures, and emits a structured terminal alert", async () => {
    const id = await connection.withTransaction(tx => enqueueOutboxEvent(tx, {
      eventType: "missing.delivery", aggregateType: "order", aggregateId: randomUUID(), payload: { safe: true },
    }));
    let result: Awaited<ReturnType<typeof failOutboxEvent>> | undefined;
    for (let attempt = 0; attempt < 12; attempt += 1) {
      await postgres.pool.query("update outbox_event set available_at=now(), locked_at=null, locked_by=null where id=$1", [id]);
      const [event] = await connection.withTransaction(tx => claimOutboxEvents(tx));
      result = await connection.withTransaction(tx => failOutboxEvent(tx, event.id, event.leaseToken, new Error("provider token=do-not-log")));
    }
    expect(result).toMatchObject({ updated: true, terminal: true, attempts: 12 });
    expect(await connection.withTransaction(tx => claimOutboxEvents(tx))).toHaveLength(0);
    const row = (await postgres.pool.query("select last_error, available_at > now() + interval '59 minutes' as capped from outbox_event where id=$1", [id])).rows[0];
    expect(row.last_error).not.toContain("do-not-log");
    expect(row.capped).toBe(true);

    await postgres.pool.query("update outbox_event set attempts=11,available_at=now(),locked_at=null,locked_by=null where id=$1", [id]);
    const alerts: unknown[] = [];
    await processOutboxBatch({ transactionRunner: connection, deliveries: {}, onTerminalFailure: alert => { alerts.push(alert); } });
    expect(alerts).toEqual([{ eventId: id, eventType: "missing.delivery", attempts: 12, code: "OUTBOX_DELIVERY_TERMINAL" }]);
  });

  it("reopens a terminal event only alongside an audit entry in the caller transaction", async () => {
    const identity = await account();
    const id = await connection.withTransaction(tx => enqueueOutboxEvent(tx, {
      eventType: "test.delivery", aggregateType: "order", aggregateId: randomUUID(), payload: { safe: true },
    }));
    await postgres.pool.query("update outbox_event set attempts=12 where id=$1", [id]);

    await connection.withTransaction(tx => retryOutboxEvent(tx, context(identity), id));

    expect((await postgres.pool.query("select attempts, available_at <= now() as available from outbox_event where id=$1", [id])).rows[0])
      .toEqual({ attempts: 0, available: true });
    expect((await postgres.pool.query("select object_type,object_id,after_patch from audit_log where object_id=$1", [id])).rows[0])
      .toEqual({ object_type: "outbox_event", object_id: id, after_patch: { action: "retry_requested" } });
  });

  it("redacts nested authentication material while preserving provenance hashes", async () => {
    const identity = await account();
    const ctx = context(identity);
    const objectId = randomUUID();
    const patch = {
      password: "pw",
      apiKey: "provider-key",
      nested: [{ resetToken: "reset", credential: { sessionId: "session", mfaSecret: "mfa" } }],
      sourceHash: "a".repeat(64),
      domainId: objectId,
    };
    expect(redactAuditValue(patch)).toEqual({
      password: "[REDACTED]",
      apiKey: "[REDACTED]",
      nested: [{ resetToken: "[REDACTED]", credential: "[REDACTED]" }],
      sourceHash: "a".repeat(64),
      domainId: objectId,
    });

    await connection.withTransaction(tx => writeAuditLog(tx, ctx, { objectType: "order", objectId, after: patch }));
    const stored = (await postgres.pool.query("select after_patch from audit_log where object_id=$1", [objectId])).rows[0].after_patch;
    expect(stored).toEqual(redactAuditValue(patch));

    await expect(connection.withTransaction(tx => enqueueOutboxEvent(tx, {
      eventType: "generic.delivery",
      aggregateType: "order",
      aggregateId: objectId,
      payload: { nested: { clientSecret: "must-not-persist" } },
    }))).rejects.toThrow("authentication material");
  });
});
