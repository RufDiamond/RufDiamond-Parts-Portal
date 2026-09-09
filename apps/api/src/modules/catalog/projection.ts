import { sql, type SQL } from "drizzle-orm";
import type { FigureDetail, Part } from "@rufdiamond/contracts";
import * as s from "../../db/schema/index.js";
import { AppError } from "../../plugins/error-handler.js";
import { canonicalJsonHash } from "../outbox/idempotency.js";
import { remapDocument } from "../publication/service.js";
import type { CatalogScope } from "./scope.js";

const column = (alias: string, name: string) => sql`${sql.identifier(alias)}.${sql.identifier(name)}`;

/** Correlated same-release joins project only the selected part's relations.
 * Hidden prices are not included in the SQL projection or transported in JSON. */
export function partProjection(alias: string, canViewPrices: boolean): SQL<Part> {
  const p = (name: string) => column(alias, name);
  const prices = canViewPrices ? sql` || CASE WHEN ${p("list_price")} IS NULL THEN '{}'::jsonb ELSE jsonb_build_object('listPrice',${p("list_price")}::text) END` : sql``;
  return sql<Part>`jsonb_build_object(
    'id',${p("working_id")}, 'releasePartId',${p("id")}, 'partNumber',${p("part_number")},
    'description',${p("description")}, 'manufacturer',${p("manufacturer")}, 'currency',${p("currency")}, 'status',${p("status")},
    'supersededByPartId',(SELECT target.working_id FROM release_part target WHERE target.release_id=${p("release_id")} AND target.id=${p("superseded_by_part_id")}),
    'requires',COALESCE((SELECT jsonb_agg(jsonb_build_object('partId',target.working_id,'qty',req.qty) ORDER BY target.working_id)
      FROM release_part_requires req JOIN release_part target ON target.release_id=req.release_id AND target.id=req.required_part_id
      WHERE req.release_id=${p("release_id")} AND req.part_id=${p("id")}), '[]'::jsonb)
  )${prices}`;
}

export type FigureMetadata = {
  figure: typeof s.releaseFigure.$inferSelect;
  variant: typeof s.releaseVariant.$inferSelect;
  system: typeof s.releaseSystem.$inferSelect;
  drawing: Pick<typeof s.releaseDrawing.$inferSelect, "id" | "workingId" | "filename" | "mediaType" | "width" | "height" | "fileVersion">;
};
export type FigureRow = { row: typeof s.releaseFigurePart.$inferSelect; part: Part };

export function projectFigure(scope: CatalogScope, metadata: FigureMetadata, rows: FigureRow[], calls: Array<typeof s.releaseCallout.$inferSelect>, mapping: typeof s.releaseDiagramMapping.$inferSelect | undefined): FigureDetail {
  const { figure: f, variant: v, system, drawing } = metadata;
  if (!drawing.width || !drawing.height || !["image/png", "image/jpeg"].includes(drawing.mediaType)) throw new AppError("DRAWING_UNAVAILABLE", 503, "Historical drawing metadata needs restoration.");
  const stableIds = new Map([[f.id, f.workingId], [drawing.id, drawing.workingId], ...rows.map(({ row }) => [row.id, row.workingId] as [string, string]), ...calls.map(c => [c.id, c.workingId] as [string, string])]);
  const stable = (id: string) => { const value = stableIds.get(id); if (!value) throw new Error("Broken same-release mapping identity"); return value; };
  const calloutNumbers = new Map<string, Set<string>>();
  for (const call of calls) {
    const numbers = calloutNumbers.get(call.figurePartId) ?? new Set<string>();
    numbers.add(call.number); calloutNumbers.set(call.figurePartId, numbers);
  }
  const document = mapping ? remapDocument(mapping.document, stable) : null;
  const release = scope.refs.get(f.releaseId)!;
  return {
    release,
    figure: { id: f.workingId, variantId: v.workingId, systemId: system.workingId, name: f.name, groupNo: f.groupNo, drawingFileId: drawing.workingId, status: "published" },
    drawing: { id: drawing.workingId, contentUrl: `/api/v1/catalog/figures/${f.workingId}/drawing?releaseId=${f.releaseId}`, filename: drawing.filename, format: drawing.mediaType === "image/png" ? "png" : "jpg", width: drawing.width, height: drawing.height, version: drawing.fileVersion },
    system: { id: system.workingId, name: system.name, sortOrder: system.sortOrder },
    variant: { id: v.workingId, modelId: release.modelId, label: v.label, serialFrom: v.serialFrom, serialTo: v.serialTo, catalogRevision: v.catalogRevision },
    mapping: mapping && document ? { document, sourceRevisionId: mapping.sourceRevisionId, sourceDocumentChecksum: mapping.sourceDocumentChecksum, storedDocumentChecksum: canonicalJsonHash(mapping.document), documentChecksum: canonicalJsonHash(document), reviewerId: mapping.reviewedByUserId, reviewedAt: mapping.reviewedAt.toISOString() } : null,
    callouts: calls.map(c => ({ id: c.workingId, figureId: f.workingId, figurePartId: stable(c.figurePartId), number: c.number, x: Number(c.x), y: Number(c.y), maskPath: c.maskPath })),
    rows: rows.map(({ row, part }) => ({
      figurePart: { id: row.workingId, figureId: f.workingId, partId: part.id, qty: row.qty, remarks: row.remarks, serviceable: row.serviceable }, part,
      calloutNumbers: [...(calloutNumbers.get(row.id) ?? [])].sort((a, b) => a.localeCompare(b, "en", { numeric: true })),
    })),
  };
}
