import { and, eq, sql } from "drizzle-orm";
import type { Database, Transaction } from "../../db/client.js";
import { drawingUploadIntent } from "../../db/schema/index.js";
import { mappingTransaction } from "../diagram-mapping/repository.js";
import type { DrawingStorage } from "./storage.js";

async function referenced(tx: Transaction, key: string) {
  const result = await tx.execute(sql`SELECT 1 FROM public.drawing_file WHERE object_key=${key} OR preview_object_key=${key}
    UNION ALL SELECT 1 FROM public.release_drawing WHERE object_key=${key} OR preview_object_key=${key}
    UNION ALL SELECT 1 FROM public.import_job WHERE object_key=${key} LIMIT 1`);
  return result.rows.length > 0;
}
/** A bounded maintenance pass. Claim prevents finalization; failed deletes are retried on the next pass. */
export async function cleanupDrawingQuarantine(database: Database, storage: DrawingStorage, now: () => Date = () => new Date()): Promise<{ cleaned: number }> {
  const cutoff = new Date(now().getTime() - 24 * 3600_000);
  const targets = await mappingTransaction(database, async tx => {
    // Retain for 24 hours AFTER upload expiry, covering bytes written near the end of the URL lifetime.
    const rows = await tx.select().from(drawingUploadIntent).where(and(sql`${drawingUploadIntent.createdAt} < ${cutoff}`, sql`${drawingUploadIntent.expiresAt} < ${cutoff}`, sql`${drawingUploadIntent.state} IN ('pending','cleanup')`, sql`${drawingUploadIntent.finalizedDrawingId} IS NULL`)).orderBy(drawingUploadIntent.createdAt, drawingUploadIntent.id).limit(100).for("update", { skipLocked: true });
    const claimed: typeof rows = [];
    for (const row of rows) {
      if (row.objectKey !== `quarantine/${row.figureId}/${row.id}.png` || await referenced(tx, row.objectKey)) continue;
      await tx.update(drawingUploadIntent).set({ state: "cleanup" }).where(eq(drawingUploadIntent.id, row.id)); claimed.push(row);
    }
    return claimed;
  });
  let cleaned = 0;
  for (const target of targets) {
    // No database transaction spans slow external deletion. No route can attach a claimed intent.
    await storage.deleteQuarantine(target.objectKey);
    await mappingTransaction(database, async tx => {
      await tx.update(drawingUploadIntent).set({ state: "cleaned" }).where(and(eq(drawingUploadIntent.id, target.id), eq(drawingUploadIntent.state, "cleanup")));
    });
    cleaned++;
  }
  return { cleaned };
}
