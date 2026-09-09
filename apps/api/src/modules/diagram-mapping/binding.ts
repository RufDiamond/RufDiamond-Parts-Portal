import { validateMappingGeometry, type DiagramMappingDocument, type MappingIssue, type MappingSource } from "@rufdiamond/contracts";
import { AppError } from "../../plugins/error-handler.js";
import { canonicalJsonHash } from "../outbox/idempotency.js";
import type { MappingGraph } from "./repository.js";

/** Only canonical source identities/versions, never Date, price, URL or object-key values. */
export function catalogueBindingSha256(graph: MappingGraph): string {
  const { figure, model, variant, drawing } = graph;
  return canonicalJsonHash({
    figure: { id: figure.id, version: figure.version, sourceKey: figure.sourceKey, drawingFileId: figure.drawingFileId },
    model: { id: model.id, version: model.version, productLineId: model.productLineId },
    variant: { id: variant.id, version: variant.version },
    drawing: drawing ? { id: drawing.id, sha256: drawing.sha256, width: drawing.width, height: drawing.height, fileVersion: drawing.fileVersion, objectVersionId: drawing.objectVersionId, validationStatus: drawing.validationStatus, mediaType: drawing.mediaType } : null,
    rows: graph.rows.map(({ row, part }) => ({ id: row.id, version: row.version, sourceRowKey: row.sourceRowKey, partId: part.id, partVersion: part.version })).sort((a, b) => a.id.localeCompare(b.id)),
    occurrences: graph.occurrences.map(c => ({ id: c.id, version: c.version, sourceKey: c.sourceKey, figurePartId: c.figurePartId, refNo: c.number })).sort((a, b) => a.id.localeCompare(b.id)),
  });
}
export function sourceContext(graph: MappingGraph): MappingSource {
  const { figure, model, drawing } = graph;
  return {
    figure: { id: figure.id, name: figure.name, version: figure.version, variantId: figure.variantId, modelId: model.id },
    drawing: drawing ? { id: drawing.id, filename: drawing.filename, sha256: drawing.sha256, width: drawing.width, height: drawing.height, fileVersion: drawing.fileVersion, mediaType: drawing.mediaType, validationStatus: drawing.validationStatus } : null,
    catalogueBindingSha256: catalogueBindingSha256(graph),
    rows: graph.rows.map(({ row, part }) => ({ id: row.id, partId: part.id, partNumber: part.partNumber, description: part.description, qty: row.qty, version: row.version, refLabels: graph.occurrences.filter(c => c.figurePartId === row.id).map(c => c.number) })),
    occurrences: graph.occurrences.map(c => ({ id: c.id, figurePartId: c.figurePartId, refNo: c.number, version: c.version })),
  };
}
export function usableDrawing(graph: MappingGraph): boolean {
  const d = graph.drawing;
  return !!d && d.validationStatus === "valid" && d.mediaType === "image/png" && !!d.width && !!d.height && d.width <= 16384 && d.height <= 16384 && d.width * d.height <= 40_000_000;
}
export function initialDocument(graph: MappingGraph): DiagramMappingDocument {
  if (!usableDrawing(graph)) throw new AppError("SOURCE_UNAVAILABLE", 409, "A validated PNG drawing with dimensions is required.");
  const drawing = graph.drawing!;
  return { schemaVersion: 1, figureId: graph.figure.id, drawingFileId: drawing.id, drawingSha256: drawing.sha256, imageWidth: drawing.width!, imageHeight: drawing.height!, catalogueBindingSha256: catalogueBindingSha256(graph), occurrences: graph.occurrences.map(c => ({ calloutId: c.id, figurePartId: c.figurePartId, refNo: c.number, labelRegion: null, regions: [], evidence: "" })) };
}
export function sourceConflict(graph: MappingGraph, document: DiagramMappingDocument): boolean {
  return !usableDrawing(graph) || document.figureId !== graph.figure.id || document.drawingFileId !== graph.drawing?.id || document.drawingSha256 !== graph.drawing.sha256 || document.imageWidth !== graph.drawing.width || document.imageHeight !== graph.drawing.height || document.catalogueBindingSha256 !== catalogueBindingSha256(graph);
}
export function requireCurrentSource(graph: MappingGraph, document: DiagramMappingDocument): void {
  if (sourceConflict(graph, document)) throw new AppError("MAPPING_SOURCE_CONFLICT", 409, "The drawing or catalogue changed. Reload and reconcile the mapping.");
}
function identifiedPath(path: string, document: DiagramMappingDocument): string {
  return path.replace(/occurrences\[(\d+)\](?:\.regions\[(\d+)\])?/, (_, occurrenceIndex, regionIndex) => {
    const occurrence = document.occurrences[Number(occurrenceIndex)];
    return `occurrences[${JSON.stringify(occurrence.calloutId)}]${regionIndex === undefined ? "" : `.regions[${JSON.stringify(occurrence.regions[Number(regionIndex)].id)}]`}`;
  });
}
export function validateDocument(graph: MappingGraph, document: DiagramMappingDocument, complete = false): boolean {
  if (complete && graph.occurrences.length === 0) throw new AppError("EMPTY_MAPPING", 422, "A mapping with no source occurrences cannot be approved.", [{ path: "occurrences", code: "empty_mapping", message: "Source-backed occurrences are required before review." }]);
  const issues: MappingIssue[] = validateMappingGeometry(document).map(i => ({ ...i, path: identifiedPath(i.path, document) }));
  let changesAssociation = false;
  const issue = (path: string, code: string, message: string) => issues.push({ path, code, message });
  for (const occurrence of document.occurrences) {
    const path = `occurrences[${JSON.stringify(occurrence.calloutId)}]`;
    const stored = graph.occurrences.find(c => c.id === occurrence.calloutId);
    if (!stored) { issue(path, "unknown_occurrence", "Occurrence does not belong to this figure."); continue; }
    if (occurrence.refNo !== stored.number) issue(`${path}.refNo`, "reference_mismatch", "Reference must match its source occurrence.");
    if (occurrence.figurePartId !== null && !graph.rows.some(({ row }) => row.id === occurrence.figurePartId)) issue(`${path}.figurePartId`, "unknown_row", "Row does not belong to this figure.");
    if (occurrence.figurePartId !== stored.figurePartId) changesAssociation = true;
    if (complete) {
      if (occurrence.figurePartId === null || occurrence.figurePartId !== stored.figurePartId) issue(`${path}.figurePartId`, "unresolved_row", "An exact established row association is required.");
      if (!occurrence.labelRegion) issue(`${path}.labelRegion`, "missing_label", "A label rectangle is required.");
      if (occurrence.regions.length === 0) issue(`${path}.regions`, "missing_regions", "A physical component region is required.");
      if (!occurrence.evidence.trim()) issue(`${path}.evidence`, "missing_evidence", "Source evidence is required.");
    }
  }
  if (complete) for (const occurrence of graph.occurrences) {
    if (!document.occurrences.some(c => c.calloutId === occurrence.id)) issue(`occurrences[${JSON.stringify(occurrence.id)}]`, "missing_occurrence", "Every source occurrence must be reviewed.");
  }
  if (issues.length) throw new AppError("INVALID_MAPPING", 422, "The mapping needs correction.", issues);
  return changesAssociation;
}
