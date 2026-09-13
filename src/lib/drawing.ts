import type { DrawingMarker } from "@/components/DrawingViewer";
import type { ComponentRegion } from "@rufdiamond/contracts";
import type { Callout, DrawingFile, FigurePartRow } from "@/types/catalog";
import { isPositionedCallout, materializeQuantityOccurrences } from "@/lib/quantity-occurrences";

/** Renderer projection; deliberately not an approval/persistence document. */
export interface DiagramRegionDocument {
  imageWidth: number;
  imageHeight: number;
  occurrences: {
    calloutId: string; figurePartId: string; partId: string; partNumber: string;
    refNo: string; regions: ComponentRegion[];
  }[];
}

export function buildDiagramRegions(rows: FigurePartRow[], callouts: Callout[], drawing: DrawingFile | null): DiagramRegionDocument | undefined {
  if (!drawing) return undefined;
  const occurrences: DiagramRegionDocument["occurrences"] = [];
  for (const callout of materializeQuantityOccurrences(rows, callouts)) {
    const geometry = callout.componentGeometry;
    const row = rows.find((candidate) => candidate.figurePart.id === callout.figurePartId);
    if (!geometry || !row || row.figurePart.figureId !== callout.figureId || row.figurePart.partId !== row.part.id ||
      geometry.drawingPath !== drawing.storagePath || geometry.imageWidth !== drawing.width || geometry.imageHeight !== drawing.height) continue;
    occurrences.push({ calloutId: callout.id, figurePartId: row.figurePart.id, partId: row.part.id,
      partNumber: row.part.partNumber, refNo: String(callout.number), regions: geometry.regions });
  }
  return { imageWidth: drawing.width, imageHeight: drawing.height, occurrences };
}

/**
 * Turn a figure's callouts into drawing markers.
 *
 * Quantity is the expected instance count: callouts are expanded to that many
 * slots and multi-region geometry is split so each physical instance gets its
 * own marker. Markers still share `partId` / Ref. No., so selecting the table
 * row lights every matching instance together.
 */
export function buildDrawingMarkers(
  rows: FigurePartRow[],
  callouts: Callout[],
): DrawingMarker[] {
  const rowByFigurePartId = new Map(rows.map((row) => [row.figurePart.id, row]));

  const markers: DrawingMarker[] = [];
  for (const callout of materializeQuantityOccurrences(rows, callouts)) {
    // A marker needs both a position to sit at and a part to point at. Either
    // gap keeps it off the plate — and off the customer's screen, since a
    // figure in that state cannot be published.
    if (!isPositionedCallout(callout)) continue;
    if (callout.figurePartId === null) continue;

    const row = rowByFigurePartId.get(callout.figurePartId);
    if (!row) continue;

    markers.push({
      id: callout.id,
      figurePartId: row.figurePart.id,
      number: callout.number,
      x: callout.x!,
      y: callout.y!,
      partId: row.part.id,
      // Absent wherever the part's outline could not be recovered from the
      // flat plate, which is the common case. Highlighting degrades to the
      // marker alone rather than failing.
      maskPath: callout.maskPath ?? undefined,
      label: `${row.part.partNumber} — ${row.part.description}`,
    });
  }
  return markers;
}

/** Spread selected labels in display pixels; source anchors never move. */
export function layoutSelectedMarkers(
  markers: readonly DrawingMarker[], selectedPartIds: ReadonlySet<string>, width: number, height: number,
): Map<string, { x: number; y: number }> {
  const positions = new Map<string, { x: number; y: number }>();
  if (width <= 0 || height <= 0) return positions;
  const placed: { x: number; y: number }[] = [];
  const gap = 40;
  for (const marker of markers) {
    if (!selectedPartIds.has(marker.partId)) continue;
    const anchor = { x: marker.x * width / 100, y: marker.y * height / 100 };
    let position = anchor;
    search: for (let radius = 0; radius <= markers.length; radius++) {
      for (let dy = -radius; dy <= radius; dy++) for (let dx = -radius; dx <= radius; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== radius) continue;
        const candidate = { x: anchor.x + dx * gap, y: anchor.y + dy * gap };
        if (candidate.x < 18 || candidate.x > width - 18 || candidate.y < 18 || candidate.y > height - 18) continue;
        if (placed.some((other) => Math.abs(other.x - candidate.x) < gap && Math.abs(other.y - candidate.y) < gap)) continue;
        position = candidate;
        break search;
      }
    }
    placed.push(position);
    positions.set(marker.id, { x: position.x / width * 100, y: position.y / height * 100 });
  }
  return positions;
}
