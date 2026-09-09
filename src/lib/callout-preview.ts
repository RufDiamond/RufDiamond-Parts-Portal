import type { FigureDetail } from "@/types/catalog";

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

/**
 * Overlay source-validated review coordinates onto detached repository data.
 * The review record can never create callouts or alter placed occurrences.
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

  const proposalCount = new Map<number | string, number>();
  const proposalByNumber = new Map<number | string, PreviewMarker>();
  for (const marker of proposal.markers) {
    proposalCount.set(marker.number, (proposalCount.get(marker.number) ?? 0) + 1);
    proposalByNumber.set(marker.number, marker);
  }

  const calloutCount = new Map<number | string, number>();
  for (const callout of detail.callouts) {
    calloutCount.set(callout.number, (calloutCount.get(callout.number) ?? 0) + 1);
  }

  let applied = 0;
  let unresolved = 0;
  const callouts = detail.callouts.map((callout) => {
    if (callout.x !== null || callout.y !== null) return callout;

    const marker = proposalByNumber.get(callout.number);
    const row = detail.rows.find(
      (candidate) =>
        callout.figureId === detail.figure.id &&
        callout.figurePartId !== null &&
        candidate.figurePart.figureId === detail.figure.id &&
        candidate.figurePart.id === callout.figurePartId &&
        candidate.figurePart.partId === candidate.part.id,
    );
    if (
      !marker ||
      proposalCount.get(callout.number) !== 1 ||
      calloutCount.get(callout.number) !== 1 ||
      !isPercentage(marker.x) ||
      !isPercentage(marker.y) ||
      !row
    ) {
      unresolved += 1;
      return callout;
    }

    applied += 1;
    return { ...callout, x: marker.x, y: marker.y };
  });

  return {
    detail: { ...detail, callouts },
    notice: `${NOTICE} Applied ${applied} marker position${applied === 1 ? "" : "s"}; ${unresolved} unresolved.`,
  };
}
