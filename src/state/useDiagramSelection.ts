"use client";

import { useCallback, useMemo, useState } from "react";
import type { FigurePartRow } from "@/types/catalog";

export type DiagramSelection = { figureId: string; figurePartId: string } | null;
export type SelectionOrigin = "label" | "component" | "table";
export type SelectionActivation = { origin: SelectionOrigin; sequence: number };
export type SelectDiagramPart = (figurePartId: string, origin: SelectionOrigin) => void;

export function resolveDiagramSelection(figureId: string, figurePartId: string, rows: FigurePartRow[]): DiagramSelection {
  const row = rows.find((item) => item.figurePart.id === figurePartId && item.figurePart.figureId === figureId);
  return row && row.figurePart.partId === row.part.id ? { figureId, figurePartId } : null;
}

/**
 * Diagram focus is multi-select by design: each pointer/row click toggles an
 * exact figure-part occurrence. Shared parts still light every occurrence via
 * selectedPartIds. `selection` is the most recently activated row for scroll.
 */
export function useDiagramSelection({ figureId, releaseKey, rows }: {
  figureId: string; releaseKey: string; rows: FigurePartRow[];
}) {
  const [state, setState] = useState<{
    figureId: string;
    releaseKey: string;
    figurePartIds: ReadonlySet<string>;
    focusFigurePartId: string | null;
    activation?: SelectionActivation;
  }>({ figureId, releaseKey, figurePartIds: new Set(), focusFigurePartId: null });

  // Reset during render so a different source never paints a stale selection.
  if (state.figureId !== figureId || state.releaseKey !== releaseKey) {
    setState({ figureId, releaseKey, figurePartIds: new Set(), focusFigurePartId: null });
  }

  const figurePartIds = state.figureId === figureId && state.releaseKey === releaseKey
    ? state.figurePartIds
    : new Set<string>();

  const resolvedIds = useMemo(() => {
    const next = new Set<string>();
    for (const id of figurePartIds) {
      if (resolveDiagramSelection(figureId, id, rows)) next.add(id);
    }
    return next;
  }, [figureId, figurePartIds, rows]);

  const selection = state.focusFigurePartId && resolvedIds.has(state.focusFigurePartId)
    ? resolveDiagramSelection(figureId, state.focusFigurePartId, rows)
    : null;

  const selectPart: SelectDiagramPart = useCallback((figurePartId, origin) => {
    setState((previous) => {
      if (previous.figureId !== figureId || previous.releaseKey !== releaseKey) {
        return previous;
      }
      if (!resolveDiagramSelection(figureId, figurePartId, rows)) {
        return previous;
      }
      const figurePartIds = new Set(previous.figurePartIds);
      const removing = figurePartIds.has(figurePartId);
      if (removing) figurePartIds.delete(figurePartId);
      else figurePartIds.add(figurePartId);
      const focusFigurePartId = removing
        ? (previous.focusFigurePartId === figurePartId
          ? (figurePartIds.values().next().value ?? null)
          : (previous.focusFigurePartId && figurePartIds.has(previous.focusFigurePartId)
            ? previous.focusFigurePartId
            : (figurePartIds.values().next().value ?? null)))
        : figurePartId;
      return {
        figureId,
        releaseKey,
        figurePartIds,
        focusFigurePartId,
        activation: focusFigurePartId
          ? { origin, sequence: (previous.activation?.sequence ?? 0) + 1 }
          : undefined,
      };
    });
  }, [figureId, releaseKey, rows]);

  const clear = useCallback(
    () => setState({ figureId, releaseKey, figurePartIds: new Set(), focusFigurePartId: null }),
    [figureId, releaseKey],
  );

  const selectedPartIds: ReadonlySet<string> = useMemo(() => {
    const ids = new Set<string>();
    for (const figurePartId of resolvedIds) {
      const row = rows.find((item) => item.figurePart.id === figurePartId);
      if (row) ids.add(row.part.id);
    }
    return ids;
  }, [rows, resolvedIds]);

  return {
    selection,
    selectPart,
    clear,
    selectedPartIds,
    activation: selection ? state.activation : undefined,
  };
}
