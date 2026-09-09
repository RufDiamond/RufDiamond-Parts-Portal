import { and, eq, inArray, sql } from "drizzle-orm";
import type { Transaction } from "../../db/client.js";
import * as s from "../../db/schema/index.js";
import { AppError } from "../../plugins/error-handler.js";
import { scopeSql } from "../authorization/scope-sql.js";
import { isPinnedVersion } from "../drawings/storage.js";
import { unavailable, uuid } from "../publication/validation.js";
import { partProjection, projectFigure } from "./projection.js";
import { permittedVariants, requiredId, type CatalogScope } from "./scope.js";

export async function readFigure(tx: Transaction, scope: CatalogScope, figureId: string) {
  const [metadata] = await tx.select({
    figure: s.releaseFigure, variant: s.releaseVariant, system: s.releaseSystem,
    drawing: { id: s.releaseDrawing.id, workingId: s.releaseDrawing.workingId, filename: s.releaseDrawing.filename, mediaType: s.releaseDrawing.mediaType, width: s.releaseDrawing.width, height: s.releaseDrawing.height, fileVersion: s.releaseDrawing.fileVersion },
  }).from(s.releaseFigure)
    .innerJoin(s.releaseVariant, and(eq(s.releaseVariant.releaseId, s.releaseFigure.releaseId), eq(s.releaseVariant.id, s.releaseFigure.variantId)))
    .innerJoin(s.releaseSystem, and(eq(s.releaseSystem.releaseId, s.releaseFigure.releaseId), eq(s.releaseSystem.id, s.releaseFigure.systemId)))
    .leftJoin(s.releaseDrawing, and(eq(s.releaseDrawing.releaseId, s.releaseFigure.releaseId), eq(s.releaseDrawing.id, s.releaseFigure.drawingId)))
    .where(and(eq(s.releaseFigure.workingId, requiredId(figureId)), inArray(s.releaseFigure.releaseId, scope.releases.map(r => r.releaseId)), scopeSql(s.releaseVariant.workingId, scope.authority.variantIds))).limit(1);
  if (!metadata) unavailable();
  const f = metadata.figure;
  const rows = await tx.select({ row: s.releaseFigurePart, part: partProjection("release_part", scope.authority.canViewPrices) })
    .from(s.releaseFigurePart).innerJoin(s.releasePart, and(eq(s.releasePart.releaseId, s.releaseFigurePart.releaseId), eq(s.releasePart.id, s.releaseFigurePart.partId)))
    .where(and(eq(s.releaseFigurePart.releaseId, f.releaseId), eq(s.releaseFigurePart.figureId, f.id))).orderBy(s.releaseFigurePart.workingId);
  const calls = await tx.select().from(s.releaseCallout).where(and(eq(s.releaseCallout.releaseId, f.releaseId), eq(s.releaseCallout.figureId, f.id))).orderBy(s.releaseCallout.workingId);
  const [mapping] = await tx.select().from(s.releaseDiagramMapping).where(and(eq(s.releaseDiagramMapping.releaseId, f.releaseId), eq(s.releaseDiagramMapping.figureId, f.id)));
  const references=await tx.select().from(s.releaseSourceReference).where(and(eq(s.releaseSourceReference.releaseId,f.releaseId),eq(s.releaseSourceReference.figureId,f.id)));
  return projectFigure(scope, metadata, rows, calls, mapping,references);
}

type DrawingIdentity = { release_id: string; object_key: string; object_version_id: string | null; sha256: string; bytes: string };
export async function drawingIdentity(tx: Transaction, scope: CatalogScope, figureId: string, releaseId: string) {
  const result = await tx.execute<DrawingIdentity>(sql`
    WITH ${permittedVariants(scope)}
    SELECT f.release_id,d.object_key,d.object_version_id,d.sha256,d.bytes
    FROM release_figure f JOIN permitted_variants pv ON pv.release_id=f.release_id AND pv.id=f.variant_id
    JOIN release_drawing d ON d.release_id=f.release_id AND d.id=f.drawing_id
    WHERE f.working_id=${requiredId(figureId)}::uuid LIMIT 1
  `);
  const current = result.rows[0]; if (!current) unavailable();
  if (current.release_id !== releaseId) {
    if (uuid.test(releaseId)) {
      const modelId = scope.refs.get(current.release_id)!.modelId;
      const historical = await tx.execute<{ id: string }>(sql`SELECT f.id FROM release_figure f
        JOIN publication_release r ON r.id=f.release_id JOIN release_model m ON m.release_id=f.release_id
        WHERE f.release_id=${releaseId}::uuid AND f.working_id=${figureId}::uuid AND m.working_id=${modelId}::uuid AND r.status='inactive' LIMIT 1`);
      if (historical.rows.length) throw new AppError("RELEASE_CHANGED", 409, "The active release changed. Reload the complete figure.");
    }
    unavailable();
  }
  if (!isPinnedVersion(current.object_version_id ?? undefined)) throw new AppError("DRAWING_VERSION_UNAVAILABLE", 503, "Historical immutable object identity requires restoration.");
  return { objectKey: current.object_key, objectVersionId: current.object_version_id!, sha256: current.sha256, bytes: Number(current.bytes) };
}
