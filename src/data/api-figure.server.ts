import "server-only";
import { validateMappingGeometry, type FigureDetail } from "@rufdiamond/contracts";
import { CatalogApiError } from "@/lib/api-error";

/** Check relational identities in addition to the shared structural contract. */
export function validateFigureIdentity(detail: FigureDetail, requestedId: string): FigureDetail {
  const { figure, drawing, variant, system, rows, callouts, release, mapping } = detail;
  const invalid = () => { throw new CatalogApiError(502, "INVALID_CATALOG_IDENTITY"); };
  if (figure.id !== requestedId || figure.drawingFileId !== drawing.id || figure.variantId !== variant.id ||
      figure.systemId !== system.id || release.modelId !== variant.modelId ||
      drawing.contentUrl !== `/api/v1/catalog/figures/${requestedId}/drawing?releaseId=${release.releaseId}`) invalid();
  const rowById = new Map(rows.map(row => [row.figurePart.id, row]));
  const calloutById = new Map(callouts.map(callout => [callout.id, callout]));
  if (rowById.size !== rows.length || calloutById.size !== callouts.length) invalid();
  for (const row of rows) {
    if (row.figurePart.figureId !== figure.id || row.figurePart.partId !== row.part.id) invalid();
    const numbers = new Set(callouts.filter(callout => callout.figurePartId === row.figurePart.id).map(callout => callout.number));
    if (numbers.size !== row.calloutNumbers.length || new Set(row.calloutNumbers).size !== row.calloutNumbers.length || !row.calloutNumbers.every(number => numbers.has(number))) invalid();
  }
  for (const callout of callouts) if (callout.figureId !== figure.id || !rowById.has(callout.figurePartId)) invalid();
  if (mapping) {
    const document = mapping.document;
    if (document.figureId !== figure.id || document.drawingFileId !== drawing.id || document.imageWidth !== drawing.width || document.imageHeight !== drawing.height || validateMappingGeometry(document).length) invalid();
    const seen = new Set<string>();
    for (const occurrence of document.occurrences) {
      const callout = calloutById.get(occurrence.calloutId);
      if (seen.has(occurrence.calloutId) || !callout || occurrence.figurePartId !== callout.figurePartId || occurrence.refNo !== callout.number) invalid();
      seen.add(occurrence.calloutId);
    }
    if (seen.size !== callouts.length) invalid();
  }
  return detail;
}
