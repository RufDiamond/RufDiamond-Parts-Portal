import type { Callout, FigureDetail } from "@/types/catalog";
import {
  expandCalloutsForQuantity,
  reportQuantityOccurrences,
} from "@/lib/quantity-occurrences";

export interface PreviewMarker {
  number: number;
  x: number;
  y: number;
}

export interface PreviewFigure {
  figureId: string;
  drawingPath: string;
  sha256: string;
  width: number;
  height: number;
  markers: PreviewMarker[];
  notes: string;
}

export interface CalloutPreview {
  detail: FigureDetail;
  notice: string | null;
}

const NOTICE =
  "Local preview — unapproved marker positions; not for ordering.";
const BLOCKED_FIGURES = new Set(["fig-frame-assy-2-1", "fig-cabin-6-13"]);

function isPercentage(value: number): boolean {
  return Number.isFinite(value) && value >= 0 && value <= 100;
}

function groupByNumber<T extends { number: number | string }>(
  items: readonly T[],
): Map<number | string, T[]> {
  const groups = new Map<number | string, T[]>();
  for (const item of items) {
    const list = groups.get(item.number) ?? [];
    list.push(item);
    groups.set(item.number, list);
  }
  return groups;
}

/**
 * Overlay source-validated review coordinates onto detached repository data.
 *
 * Quantity expands a Ref. No. into N callout slots before pairing. Multiple
 * proposal markers that share a printed number are zipped onto those slots in
 * stable order. The review record still never invents geometry from Quantity
 * alone — unmatched slots stay unpositioned and are flagged for review.
 */
export function applyCalloutPreview(
  detail: FigureDetail,
  proposal: PreviewFigure,
): CalloutPreview {
  if (proposal.figureId !== detail.figure.id) {
    return {
      detail,
      notice: `${NOTICE} Preview unavailable because the proposal figure does not match the catalogue figure.`,
    };
  }

  if (BLOCKED_FIGURES.has(detail.figure.id)) {
    return {
      detail,
      notice: `${NOTICE} Preview withheld because this figure has an unresolved source conflict.`,
    };
  }

  const expanded = expandCalloutsForQuantity(detail.rows, detail.callouts);
  const proposalsByNumber = groupByNumber(proposal.markers);
  const calloutsByNumber = groupByNumber(
    expanded.filter((callout) => callout.x === null && callout.y === null),
  );
  const isQuantitySlot = (callout: Callout) => callout.id.includes("__qty-");

  const assigned = new Map<string, PreviewMarker>();
  let unresolved = 0;

  for (const [number, callouts] of calloutsByNumber) {
    const markers = proposalsByNumber.get(number) ?? [];
    const originals = callouts.filter((callout) => !isQuantitySlot(callout));
    // Prefer an exact multi-instance zip when proposal count matches every
    // quantity slot. Otherwise keep the established 1:1 / N:N pairing on the
    // imported callouts and leave quantity-expansion slots for review.
    // Never place onto quantity-only leftovers when every imported callout for
    // this number is already positioned — that would invent a duplicate marker.
    const targets =
      markers.length === originals.length && originals.length > 0
        ? originals
        : markers.length === callouts.length && originals.length > 0
          ? callouts
          : [];

    if (
      targets.length === 0 ||
      !markers.every((marker) => isPercentage(marker.x) && isPercentage(marker.y))
    ) {
      unresolved += originals.length;
      continue;
    }

    for (let index = 0; index < targets.length; index += 1) {
      const callout = targets[index];
      const row = detail.rows.find(
        (candidate) =>
          callout.figureId === detail.figure.id &&
          callout.figurePartId !== null &&
          candidate.figurePart.figureId === detail.figure.id &&
          candidate.figurePart.id === callout.figurePartId &&
          candidate.figurePart.partId === candidate.part.id,
      );
      if (!row) continue;
      assigned.set(callout.id, markers[index]);
    }
    unresolved += originals.filter((callout) => !assigned.has(callout.id)).length;
  }

  let applied = 0;
  const callouts: Callout[] = expanded.flatMap((callout) => {
    if (callout.x !== null || callout.y !== null) return [callout];
    const marker = assigned.get(callout.id);
    if (!marker) {
      // Quantity-expansion slots stay out of the persisted preview detail until
      // mapping supplies coordinates; materializeQuantityOccurrences recreates
      // them for expected-count validation in the viewer.
      return isQuantitySlot(callout) ? [] : [callout];
    }
    applied += 1;
    return [{ ...callout, x: marker.x, y: marker.y }];
  });

  const reviewCallouts = expandCalloutsForQuantity(detail.rows, callouts);
  const mismatches = reportQuantityOccurrences(detail.rows, reviewCallouts).filter(
    (report) => report.needsReview,
  );
  const mismatchNotice =
    mismatches.length === 0
      ? ""
      : ` Quantity review: ${mismatches.length} part${mismatches.length === 1 ? "" : "s"} flagged because detected instances do not match the Quantity column.`;

  return {
    detail: { ...detail, callouts },
    notice: `${NOTICE} Applied ${applied} marker position${applied === 1 ? "" : "s"}; ${unresolved} existing-row markers unpositioned. Source-only references and incomplete contours are separate review questions.${mismatchNotice}`,
  };
}
