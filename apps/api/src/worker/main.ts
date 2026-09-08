import { runOutboxWorker, type RunOutboxWorkerDependencies } from "../modules/outbox/worker.js";

export type WorkerMainDependencies = Omit<RunOutboxWorkerDependencies, "signal"> & { signal?: AbortSignal };

export async function main(dependencies: WorkerMainDependencies): Promise<void> {
  if (dependencies.signal) {
    await runOutboxWorker({ ...dependencies, signal: dependencies.signal });
    return;
  }

  const controller = new AbortController();
  const stop = () => controller.abort();
  process.once("SIGINT", stop);
  process.once("SIGTERM", stop);
  try {
    await runOutboxWorker({ ...dependencies, signal: controller.signal });
  } finally {
    process.removeListener("SIGINT", stop);
    process.removeListener("SIGTERM", stop);
  }
}
