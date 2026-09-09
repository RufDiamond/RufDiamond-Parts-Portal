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

export function useDiagramSelection({ figureId, releaseKey, rows }: {
  figureId: string; releaseKey: string; rows: FigurePartRow[];
}) {
  const [state, setState] = useState<{ figureId: string; releaseKey: string; selection: DiagramSelection; activation?: SelectionActivation }>(
    { figureId, releaseKey, selection: null },
  );
  // Reset during render so a different source never paints a stale selection.
  if (state.figureId !== figureId || state.releaseKey !== releaseKey) {
    setState({ figureId, releaseKey, selection: null });
  }
  const selection = state.figureId === figureId && state.releaseKey === releaseKey && state.selection
    ? resolveDiagramSelection(figureId, state.selection.figurePartId, rows) : null;
  const selectPart: SelectDiagramPart = useCallback((figurePartId, origin) => {
    setState((previous) => ({ figureId, releaseKey, selection: resolveDiagramSelection(figureId, figurePartId, rows),
      activation: { origin, sequence: (previous.activation?.sequence ?? 0) + 1 } }));
  }, [figureId, releaseKey, rows]);
  const clear = useCallback(() => setState({ figureId, releaseKey, selection: null }), [figureId, releaseKey]);
  const selectedPartIds: ReadonlySet<string> = useMemo(() => {
    const row = rows.find((item) => item.figurePart.id === selection?.figurePartId);
    return new Set(row ? [row.part.id] : []);
  }, [rows, selection?.figurePartId]);
  return { selection, selectPart, clear, selectedPartIds, activation: selection ? state.activation : undefined };
}
