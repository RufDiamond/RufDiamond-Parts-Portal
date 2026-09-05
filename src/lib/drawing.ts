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
    // A marker needs both a position to sit at and a part to point at. Either
    // gap keeps it off the plate — and off the customer's screen, since a
    // figure in that state cannot be published.
    if (callout.x === null || callout.y === null) continue;
    if (callout.figurePartId === null) continue;

    const row = rowByFigurePartId.get(callout.figurePartId);
    if (!row) continue;

    markers.push({
      id: callout.id,
      number: callout.number,
      x: callout.x,
      y: callout.y,
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
