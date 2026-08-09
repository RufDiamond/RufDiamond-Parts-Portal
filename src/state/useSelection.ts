"use client";

import { useCallback, useMemo, useState } from "react";
import type { Callout, FigurePartRow } from "@/types/catalog";

/**
 * Selection is deliberately NOT a provider. It belongs to one figure screen
 * and dies with it — putting it in context would leak one plate's selection
 * onto the next.
 */

export interface UseSelectionOptions {
  rows: FigurePartRow[];
  callouts: Callout[];
}

export interface Selection {
  /** Part ids currently selected. Selection is multiple by design. */
  selectedPartIds: ReadonlySet<string>;
  selectedRows: FigurePartRow[];
  isSelected: (partId: string) => boolean;
  toggle: (partId: string) => void;
  selectOnly: (partId: string) => void;
  deselect: (partId: string) => void;
  clear: () => void;
  /** Row under the pointer, on either the table or the drawing. */
  hoveredPartId: string | null;
  setHoveredPartId: (partId: string | null) => void;
  /** EVERY callout for a part, not just its first occurrence. */
  calloutsForPart: (partId: string) => Callout[];
  /** All callouts of all selected parts. */
  highlightedCallouts: Callout[];
  isCalloutHighlighted: (calloutId: string) => boolean;
}

/**
 * Group callouts by the part they point at.
 *
 * Callouts reference a figure part, not a part, so a part fitted in two places
 * on the plate owns two callouts. Resolving through the rows is what lets one
 * selected row light both markers.
 */
export function buildCalloutIndex(
  rows: FigurePartRow[],
  callouts: Callout[],
): Map<string, Callout[]> {
  const partIdByFigurePartId = new Map(
    rows.map((row) => [row.figurePart.id, row.part.id]),
  );

  const index = new Map<string, Callout[]>();
  for (const callout of callouts) {
    const partId = partIdByFigurePartId.get(callout.figurePartId);
    if (!partId) continue;

    const existing = index.get(partId);
    if (existing) {
      existing.push(callout);
    } else {
      index.set(partId, [callout]);
    }
  }
  return index;
}

const NO_CALLOUTS: Callout[] = [];

export function useSelection({ rows, callouts }: UseSelectionOptions): Selection {
  const [selectedPartIds, setSelectedPartIds] = useState<ReadonlySet<string>>(
    () => new Set(),
  );
  const [hoveredPartId, setHoveredPartId] = useState<string | null>(null);

  const calloutIndex = useMemo(
    () => buildCalloutIndex(rows, callouts),
    [rows, callouts],
  );

  const isSelected = useCallback(
    (partId: string) => selectedPartIds.has(partId),
    [selectedPartIds],
  );

  const toggle = useCallback((partId: string) => {
    setSelectedPartIds((current) => {
      const next = new Set(current);
      if (!next.delete(partId)) next.add(partId);
      return next;
    });
  }, []);

  const selectOnly = useCallback((partId: string) => {
    setSelectedPartIds(new Set([partId]));
  }, []);

  const deselect = useCallback((partId: string) => {
    setSelectedPartIds((current) => {
      if (!current.has(partId)) return current;
      const next = new Set(current);
      next.delete(partId);
      return next;
    });
  }, []);

  const clear = useCallback(() => {
    setSelectedPartIds((current) => (current.size === 0 ? current : new Set()));
  }, []);

  const calloutsForPart = useCallback(
    (partId: string) => calloutIndex.get(partId) ?? NO_CALLOUTS,
    [calloutIndex],
  );

  const selectedRows = useMemo(
    () => rows.filter((row) => selectedPartIds.has(row.part.id)),
    [rows, selectedPartIds],
  );

  // Every occurrence of every selected part, flattened. A part with two
  // markers contributes both.
  const highlightedCallouts = useMemo(
    () =>
      [...selectedPartIds]
        .flatMap((partId) => calloutIndex.get(partId) ?? NO_CALLOUTS)
        .sort((a, b) => a.number - b.number),
    [selectedPartIds, calloutIndex],
  );

  const highlightedCalloutIds = useMemo(
    () => new Set(highlightedCallouts.map((callout) => callout.id)),
    [highlightedCallouts],
  );

  const isCalloutHighlighted = useCallback(
    (calloutId: string) => highlightedCalloutIds.has(calloutId),
    [highlightedCalloutIds],
  );

  return {
    selectedPartIds,
    selectedRows,
    isSelected,
    toggle,
    selectOnly,
    deselect,
    clear,
    hoveredPartId,
    setHoveredPartId,
    calloutsForPart,
    highlightedCallouts,
    isCalloutHighlighted,
  };
}
