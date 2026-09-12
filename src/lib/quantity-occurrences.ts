import type { Callout, FigurePartRow } from "@/types/catalog";

/**
 * Quantity on the parts list is the expected count of physical instances for
 * that figure-part row. Markers/callouts are observations of those instances.
 * One Ref. No. may therefore own several callout rows — all sharing the same
 * number — and the viewer lights every matching observation together.
 */

export type QuantityOccurrenceStatus =
  | "match"
  | "shortfall"
  | "excess"
  | "unspecified"
  | "unmapped";

export interface QuantityOccurrenceReport {
  figurePartId: string;
  partId: string;
  refNumbers: (number | string)[];
  /** Installed quantity from the parts list; null when unspecified. */
  expected: number | null;
  /** Positioned callout observations for this figure-part. */
  detected: number;
  /** Total callout slots (including unpositioned quantity expansions). */
  slots: number;
  status: QuantityOccurrenceStatus;
  needsReview: boolean;
}

export function isPositionedCallout(callout: Callout): boolean {
  return callout.x !== null && callout.y !== null;
}

/** Count of placed markers for one figure-part row. */
export function countDetectedOccurrences(
  callouts: readonly Callout[],
  figurePartId: string,
): number {
  return callouts.filter(
    (callout) =>
      callout.figurePartId === figurePartId && isPositionedCallout(callout),
  ).length;
}

export function quantityOccurrenceStatus(
  expected: number | null | undefined,
  detected: number,
): QuantityOccurrenceStatus {
  if (expected === null || expected === undefined) return "unspecified";
  if (detected === 0) return "unmapped";
  if (detected < expected) return "shortfall";
  if (detected > expected) return "excess";
  return "match";
}

export function reportQuantityOccurrences(
  rows: readonly FigurePartRow[],
  callouts: readonly Callout[],
): QuantityOccurrenceReport[] {
  return rows.map((row) => {
    const slots = callouts.filter(
      (callout) => callout.figurePartId === row.figurePart.id,
    ).length;
    const detected = countDetectedOccurrences(callouts, row.figurePart.id);
    const expected = row.figurePart.qty;
    const status = quantityOccurrenceStatus(expected, detected);
    return {
      figurePartId: row.figurePart.id,
      partId: row.part.id,
      refNumbers: row.calloutNumbers,
      expected,
      detected,
      slots,
      status,
      needsReview: status === "shortfall" || status === "excess",
    };
  });
}

/**
 * Ensure each associated figure-part with a known quantity has that many
 * callout slots, all sharing the printed Ref. No. Extra slots stay unpositioned
 * until mapping supplies coordinates — Quantity never invents plate geometry.
 */
export function expandCalloutsForQuantity(
  rows: readonly FigurePartRow[],
  callouts: readonly Callout[],
): Callout[] {
  const byFigurePart = new Map<string, Callout[]>();
  for (const callout of callouts) {
    if (!callout.figurePartId) continue;
    const list = byFigurePart.get(callout.figurePartId) ?? [];
    list.push(callout);
    byFigurePart.set(callout.figurePartId, list);
  }

  const expanded = [...callouts];
  for (const row of rows) {
    const expected = row.figurePart.qty;
    if (expected === null || expected === undefined || expected < 1) continue;

    const existing = byFigurePart.get(row.figurePart.id) ?? [];
    if (existing.length === 0 || existing.length >= expected) continue;

    const template = existing[0];
    for (let index = existing.length; index < expected; index += 1) {
      expanded.push({
        id: `${template.id}__qty-${index + 1}`,
        figureId: template.figureId,
        figurePartId: template.figurePartId,
        number: template.number,
        x: null,
        y: null,
        maskPath: null,
      });
    }
  }

  return expanded;
}

/**
 * When one callout carries several component regions, treat each region as a
 * physical instance: emit one marker per region (shared Ref. No.) so Quantity
 * instances are independently addressable on the plate.
 */
export function splitCalloutByRegions(callout: Callout): Callout[] {
  const geometry = callout.componentGeometry;
  const regions = geometry?.regions;
  if (!geometry || !regions || regions.length <= 1) return [callout];
  if (callout.x === null || callout.y === null) return [callout];
  if (!geometry.imageWidth || !geometry.imageHeight) return [callout];

  const toPercent = (point: readonly [number, number]): [number, number] => [
    (point[0] / geometry.imageWidth) * 100,
    (point[1] / geometry.imageHeight) * 100,
  ];

  return regions.map((region, index) => {
    const percentOuter = region.outer.map(toPercent);
    const centroid = percentOuter.reduce(
      (sum, point) => [sum[0] + point[0], sum[1] + point[1]] as [number, number],
      [0, 0] as [number, number],
    );
    const x = centroid[0] / percentOuter.length;
    const y = centroid[1] / percentOuter.length;
    const holePaths = (region.holes ?? [])
      .map((hole) => {
        const percentHole = hole.map(toPercent);
        return ` ${percentHole
          .map((point, pointIndex) =>
            `${pointIndex === 0 ? "M" : "L"} ${point[0]} ${point[1]}`,
          )
          .join(" ")} Z`;
      })
      .join("");
    const maskPath = `${percentOuter
      .map((point, pointIndex) =>
        `${pointIndex === 0 ? "M" : "L"} ${point[0]} ${point[1]}`,
      )
      .join(" ")} Z${holePaths}`;

    return {
      ...callout,
      id: index === 0 ? callout.id : `${callout.id}__region-${index + 1}`,
      // Keep the printed label on the first instance; siblings use the
      // component centroid so each physical occurrence is independently lit.
      x: index === 0 ? callout.x : x,
      y: index === 0 ? callout.y : y,
      maskPath,
      componentGeometry: {
        ...geometry,
        regions: [region],
      },
    };
  });
}

/** Expand multi-region geometry first, then fill remaining Quantity slots. */
export function materializeQuantityOccurrences(
  rows: readonly FigurePartRow[],
  callouts: readonly Callout[],
): Callout[] {
  return expandCalloutsForQuantity(
    rows,
    callouts.flatMap(splitCalloutByRegions),
  );
}
