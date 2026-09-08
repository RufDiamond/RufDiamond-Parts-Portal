import type { Transaction } from "../../db/client.js";
import {
  claimOutboxEvents,
  completeOutboxEvent,
  failOutboxEvent,
  type ClaimedOutboxEvent,
} from "./repository.js";

export interface TransactionRunner {
  withTransaction<T>(fn: (tx: Transaction) => Promise<T>): Promise<T>;
}

export interface DeliveryMessage {
  eventId: string;
  eventType: string;
  aggregateType: string;
  aggregateId: string;
  payloadVersion: number;
  payload: unknown;
  providerIdempotencyKey: string;
}

export type OutboxDelivery = (message: DeliveryMessage) => Promise<void>;

export interface TerminalFailureAlert {
  eventId: string;
  eventType: string;
  attempts: number;
  code: "OUTBOX_DELIVERY_TERMINAL";
}

export interface ProcessOutboxDependencies {
  transactionRunner: TransactionRunner;
  deliveries: Readonly<Record<string, OutboxDelivery>>;
  onTerminalFailure?: (alert: TerminalFailureAlert) => void | Promise<void>;
}

export interface ProcessOutboxResult {
  claimed: number;
  completed: number;
  failed: number;
  terminal: number;
}

class MissingDeliveryHandlerError extends Error {
  readonly code = "MISSING_HANDLER";
  constructor(eventType: string) {
    super(`No delivery handler is registered for ${eventType}`);
    this.name = "OutboxDeliveryError";
  }
}

function deliveryMessage(event: ClaimedOutboxEvent): DeliveryMessage {
  return {
    eventId: event.id,
    eventType: event.eventType,
    aggregateType: event.aggregateType,
    aggregateId: event.aggregateId,
    payloadVersion: event.payloadVersion,
    payload: event.payload,
    providerIdempotencyKey: event.deduplicationKey ?? event.id,
  };
}

export async function processOutboxBatch(dependencies: ProcessOutboxDependencies): Promise<ProcessOutboxResult> {
  const claimed = await dependencies.transactionRunner.withTransaction(tx => claimOutboxEvents(tx));
  const result: ProcessOutboxResult = { claimed: claimed.length, completed: 0, failed: 0, terminal: 0 };
  for (const event of claimed) {
    try {
      const delivery = dependencies.deliveries[event.eventType];
      if (!delivery) throw new MissingDeliveryHandlerError(event.eventType);
      await delivery(deliveryMessage(event));
      if (await dependencies.transactionRunner.withTransaction(tx => completeOutboxEvent(tx, event.id, event.leaseToken))) {
        result.completed += 1;
      }
    } catch (error) {
      const failure = await dependencies.transactionRunner.withTransaction(tx => failOutboxEvent(tx, event.id, event.leaseToken, error));
      if (!failure.updated) continue;
      result.failed += 1;
      if (failure.terminal && failure.attempts !== null) {
        result.terminal += 1;
        await dependencies.onTerminalFailure?.({
          eventId: event.id,
          eventType: event.eventType,
          attempts: failure.attempts,
          code: "OUTBOX_DELIVERY_TERMINAL",
        });
      }
    }
  }
  return result;
}

export interface RunOutboxWorkerDependencies extends ProcessOutboxDependencies {
  signal: AbortSignal;
  pollIntervalMs?: number;
  onWorkerError?: (error: { code: "OUTBOX_WORKER_ERROR"; name: string }) => void | Promise<void>;
}

function waitForPoll(milliseconds: number, signal: AbortSignal): Promise<void> {
  if (signal.aborted) return Promise.resolve();
  return new Promise(resolve => {
    const timer = setTimeout(done, milliseconds);
    function done() {
      clearTimeout(timer);
      signal.removeEventListener("abort", done);
      resolve();
    }
    signal.addEventListener("abort", done, { once: true });
  });
}

export async function runOutboxWorker(dependencies: RunOutboxWorkerDependencies): Promise<void> {
  const pollIntervalMs = dependencies.pollIntervalMs ?? 1_000;
  if (!Number.isFinite(pollIntervalMs) || pollIntervalMs < 0) throw new TypeError("pollIntervalMs must be a non-negative finite number");
  while (!dependencies.signal.aborted) {
    let claimed = 0;
    try {
      claimed = (await processOutboxBatch(dependencies)).claimed;
    } catch (error) {
      const name = error instanceof Error ? error.name : "UnknownError";
      await dependencies.onWorkerError?.({ code: "OUTBOX_WORKER_ERROR", name });
    }
    if (claimed === 0 && !dependencies.signal.aborted) await waitForPoll(pollIntervalMs, dependencies.signal);
  }
}
