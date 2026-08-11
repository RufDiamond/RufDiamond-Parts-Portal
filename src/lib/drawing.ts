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
    // A callout with nothing attached has no part to point at, so it is not
    // drawn for customers. The admin editor is where those get mapped.
    if (callout.figurePartId === null) continue;

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
