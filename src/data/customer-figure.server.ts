import "server-only";
import type { CustomerRepository } from "./customer-composition.server";

/** Keep these dependent reads inside the caller's release-coherent boundary. */
export async function readFigureWorkspace(repo: CustomerRepository, figureId: string) {
  const detail = await repo.getFigureDetail(figureId);
  if (!detail) return null;
  const siblings = await repo.getFigures(detail.figure.variantId, detail.system.id);
  const usage = await repo.getPartUsageIndex();
  return { detail, siblings, usage };
}
