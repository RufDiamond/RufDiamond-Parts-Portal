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
  reviewReason?: string;
}

export function isPositionedCallout(callout: Callout): boolean {
  return [callout.x, callout.y].every((value) =>
    typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 100,
  );
}

/** Count of placed physical instances for one figure-part row. */
export function countDetectedOccurrences(
  callouts: readonly Callout[],
  figurePartId: string,
): number {
  return callouts.flatMap(splitCalloutByRegions).filter((callout) =>
    callout.figurePartId === figurePartId && isPositionedCallout(callout),
  ).length;
}

export function quantityOccurrenceStatus(
  expected: number | null | undefined,
  detected: number,
): QuantityOccurrenceStatus {
  if (expected === null || expected === undefined) return "unspecified";
  if (expected === 0 && detected === 0) return "match";
  if (detected === 0) return "unmapped";
  if (detected < expected) return "shortfall";
  if (detected > expected) return "excess";
  return "match";
}

export function reportQuantityOccurrences(
  rows: readonly FigurePartRow[],
  callouts: readonly Callout[],
): QuantityOccurrenceReport[] {
  const instances = materializeQuantityOccurrences(rows, callouts);
  return rows.map((row) => {
    const forPart = instances.filter(
      (callout) => callout.figurePartId === row.figurePart.id,
    );
    const detected = forPart.filter(isPositionedCallout).length;
    const slots = Math.max(forPart.length, row.figurePart.qty ?? forPart.length);
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
      needsReview: !!row.mappingReviewReason || status === "shortfall" || status === "excess" || status === "unmapped",
      ...(row.mappingReviewReason ? { reviewReason: row.mappingReviewReason } : {}),
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
 * Project source-established physical instances to pointers sharing a Ref. No.
 * Multiple contours of a single component remain one physical instance.
 */
export function splitCalloutByRegions(callout: Callout): Callout[] {
  const geometry = callout.componentGeometry;
  if (!geometry?.regions.length) return [callout];
  if (!Number.isFinite(geometry.imageWidth) || geometry.imageWidth <= 0 ||
      !Number.isFinite(geometry.imageHeight) || geometry.imageHeight <= 0) return [callout];

  // Disconnected visible faces can belong to ONE component. Only explicit
  // source identities establish separate physical instances, never polygon count.
  const identities = geometry.instanceIds;
  if (identities && (identities.length !== geometry.regions.length || identities.some((id) => !id.trim()))) return [callout];
  const groups = new Map<string, typeof geometry.regions>();
  geometry.regions.forEach((region, index) => {
    const id = identities?.[index] ?? callout.id;
    groups.set(id, [...(groups.get(id) ?? []), region]);
  });
  if (groups.size === 1 && isPositionedCallout(callout)) return [callout];

  const toPercent = ([x, y]: readonly [number, number]): [number, number] =>
    [x / geometry.imageWidth * 100, y / geometry.imageHeight * 100];
  const ringPath = (points: readonly (readonly [number, number])[]) =>
    points.map(toPercent).map(([x, y], i) => `${i ? "L" : "M"} ${x} ${y}`).join(" ") + " Z";

  return Array.from(groups, ([identity, regions], index) => {
    const points = regions.flatMap((region) => region.outer).map(toPercent);
    const x = points.reduce((sum, point) => sum + point[0], 0) / points.length;
    const y = points.reduce((sum, point) => sum + point[1], 0) / points.length;
    return {
      ...callout,
      id: index === 0 ? callout.id : `${callout.id}__instance-${encodeURIComponent(identity)}`,
      // Keep the established printed label; every additional instance gets its
      // own component-relative pointer, with the same Ref. No. and part identity.
      x: index === 0 && isPositionedCallout(callout) ? callout.x : x,
      y: index === 0 && isPositionedCallout(callout) ? callout.y : y,
      maskPath: regions.flatMap((region) => [region.outer, ...region.holes]).map(ringPath).join(" "),
      componentGeometry: { ...geometry, regions, instanceIds: regions.map(() => identity) },
    };
  });
}

/** Resolve physical instances first, then fill remaining unpositioned Quantity slots. */
export function materializeQuantityOccurrences(
  rows: readonly FigurePartRow[],
  callouts: readonly Callout[],
): Callout[] {
  return expandCalloutsForQuantity(
    rows,
    callouts.flatMap(splitCalloutByRegions),
  );
}

/** Selection feedback uses the same resolved instances as the renderer. */
export function quantityValidationStatus(report: QuantityOccurrenceReport): string {
  return report.needsReview ? "Needs Review" : report.status === "match" ? "Complete" : "Quantity unspecified";
}

export function quantityValidationMessage(report: QuantityOccurrenceReport): string {
  return `Expected quantity: ${report.expected ?? "unspecified"} · Instances found: ${report.detected} · Status: ${quantityValidationStatus(report)}`;
}

export function quantitySelectionMessage(report: QuantityOccurrenceReport): string {
  const ref = `Ref. ${report.refNumbers.join(", ")}`;
  const validation = `${ref} — ${quantityValidationMessage(report)}.`;
  if (report.reviewReason) return `${validation} ${report.detected} mapped pointers highlighted. ${report.reviewReason}`;
  if (report.status === "match") return `${validation} All ${report.detected} instances highlighted.`;
  if (report.status === "unspecified") return `${validation} ${report.detected} mapped instances highlighted.`;
  return `${validation} ${report.detected} instances highlighted; ${report.detected < (report.expected ?? 0) ? "missing locations" : "extra locations"}.`;
}
