import type { DrawingMarker } from "@/components/DrawingViewer";
import type { Callout, FigurePartRow } from "@/types/catalog";

/**
 * Turn a figure's callouts into drawing markers.
 *
 * Each marker carries the part id rather than the callout id, which is what
 * makes multi-occurrence highlighting work: two markers for the same part
 * carry the same `partId`, so selecting that part lights both.
 */
export function buildDrawingMarkers(
  rows: FigurePartRow[],
  callouts: Callout[],
): DrawingMarker[] {
  const rowByFigurePartId = new Map(rows.map((row) => [row.figurePart.id, row]));

  const markers: DrawingMarker[] = [];
  for (const callout of callouts) {
    const row = rowByFigurePartId.get(callout.figurePartId);
    if (!row) continue;

    markers.push({
      id: callout.id,
      number: callout.number,
      x: callout.x,
      y: callout.y,
      partId: row.part.id,
      label: `${row.part.partNumber} — ${row.part.description}`,
    });
  }
  return markers;
}
