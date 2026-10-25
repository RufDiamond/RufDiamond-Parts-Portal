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

/** Enough space for a complete grid when a dense drawing needs to scroll. */
export function minimumDrawingWidth(count: number, ratio: number, gap = 36): number {
  if (count < 2 || ratio <= 0) return 0;
  let width = Infinity;
  for (let columns = 1; columns <= count; columns++) {
    width = Math.min(width, Math.max(columns * gap, Math.ceil(count / columns) * gap * ratio));
  }
  return Math.ceil(width);
}

/** Separate all labels in display pixels, independently of selection.
 * Source coordinates remain the endpoints of leaders, never rewritten data.
 */
export function layoutDrawingMarkers(
  markers: readonly DrawingMarker[], width: number, height: number, gap = 36,
): Map<string, { x: number; y: number }> {
  const positions = new Map<string, { x: number; y: number }>();
  if (width <= 0 || height <= 0) return positions;
  const columns = Math.max(1, Math.floor((width + 0.001) / gap));
  const rows = Math.max(1, Math.floor((height + 0.001) / gap));
  const grid = Array.from({ length: columns * Math.max(rows, Math.ceil(markers.length / columns)) }, (_, i) => ({
    x: gap / 2 + (i % columns) * gap,
    y: gap / 2 + Math.floor(i / columns) * gap,
  }));
  const placed: { x: number; y: number }[] = [];
  const collides = (candidate: { x: number; y: number }) => placed.some(other =>
    Math.abs(other.x - candidate.x) < gap - 0.001 && Math.abs(other.y - candidate.y) < gap - 0.001);
  const nearest = (anchor: { x: number; y: number }, candidates: typeof grid) =>
    candidates.reduce((best, candidate) =>
      (candidate.x-anchor.x)**2 + (candidate.y-anchor.y)**2 < (best.x-anchor.x)**2 + (best.y-anchor.y)**2 ? candidate : best);
  let repack = false;
  for (const marker of markers) {
    const anchor = { x: marker.x * width / 100, y: marker.y * height / 100 };
    let position = anchor;
    if (collides(anchor)) {
      const free = grid.filter(candidate => !collides(candidate));
      if (!free.length) { repack = true; break; }
      position = nearest(anchor, free);
    }
    placed.push(position);
    positions.set(marker.id, position === anchor ? { x: marker.x, y: marker.y } : {
      x: position.x / width * 100, y: position.y / height * 100,
    });
  }
  // Arbitrary anchors can block several grid cells each. Repack every label
  // only when preserving those anchors prevents a complete placement.
  if (repack) {
    positions.clear();
    const free = [...grid];
    for (const marker of markers) {
      const anchor = { x: marker.x * width / 100, y: marker.y * height / 100 };
      const position = nearest(anchor, free);
      free.splice(free.indexOf(position), 1);
      positions.set(marker.id, { x: position.x / width * 100, y: position.y / height * 100 });
    }
  }
  return positions;
}
