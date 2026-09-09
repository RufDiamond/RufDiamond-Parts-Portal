"use client";

import { useState } from "react";
import { pointInRegion, regionPath } from "@rufdiamond/contracts/diagram-geometry";
import type { DiagramRegionDocument } from "@/lib/drawing";
import styles from "./DrawingViewer.module.css";

export interface DiagramRegionsProps {
  document: DiagramRegionDocument;
  selectedPartIds: ReadonlySet<string>;
  onSelect?: (figurePartId: string) => void;
}

export function DiagramRegions({ document, selectedPartIds, onSelect }: DiagramRegionsProps) {
  const [chooser, setChooser] = useState<{ x: number; y: number; candidates: DiagramRegionDocument["occurrences"] } | null>(null);
  const [sourceDocument, setSourceDocument] = useState(document);
  if (sourceDocument !== document) {
    setSourceDocument(document);
    setChooser(null);
  }
  const activate = (id: string) => { setChooser(null); onSelect?.(id); };
  return <>
    <svg data-diagram-regions className={styles.regions} viewBox={`0 0 ${document.imageWidth} ${document.imageHeight}`}
      preserveAspectRatio="none" aria-label="Mapped components"
      onClick={(event) => {
        if (!onSelect || event.detail === 0) return;
        let inverse: DOMMatrix;
        try {
          const matrix = event.currentTarget.getScreenCTM();
          if (!matrix) return;
          inverse = matrix.inverse();
        } catch { return; }
        const x = inverse.a * event.clientX + inverse.c * event.clientY + inverse.e;
        const y = inverse.b * event.clientX + inverse.d * event.clientY + inverse.f;
        if (!Number.isFinite(x) || !Number.isFinite(y)) return;
        const hits = document.occurrences.filter((occurrence) => occurrence.regions.some((region) => pointInRegion([x,y], region)));
        const candidates = [...new Map(hits.map((hit) => [hit.partId, hit])).values()];
        if (candidates.length === 1) activate(hits[0].figurePartId);
        else setChooser(candidates.length ? { x: (x / document.imageWidth) * 100, y: (y / document.imageHeight) * 100, candidates } : null);
      }}>
      {document.occurrences.flatMap((occurrence) => occurrence.regions.map((region) => (
        <path key={`${occurrence.calloutId}/${region.id}`} d={regionPath(region)} fillRule="evenodd"
          vectorEffect="non-scaling-stroke" role="button" tabIndex={onSelect ? 0 : -1}
          aria-label={`Component ${occurrence.refNo}: ${occurrence.partNumber}`}
          aria-pressed={selectedPartIds.has(occurrence.partId)} aria-disabled={!onSelect}
          data-selected={selectedPartIds.has(occurrence.partId) || undefined}
          onKeyDown={(event) => {
            if (onSelect && (event.key === "Enter" || event.key === " ")) { event.preventDefault(); activate(occurrence.figurePartId); }
          }}
          onClick={(event) => { if (event.detail === 0) activate(occurrence.figurePartId); }} />
      )))}
    </svg>
    {chooser ? <div className={styles.regionChooser} role="group" aria-label="Choose overlapping component"
      style={{ left: `${chooser.x}%`, top: `${chooser.y}%` }} onPointerDown={(event) => event.stopPropagation()}
      onKeyDown={(event) => { if (event.key === "Escape") { event.stopPropagation(); setChooser(null); } }}>
      <span>Choose component</span>
      {chooser.candidates.map((candidate) => <button key={candidate.partId} type="button"
        onClick={() => activate(candidate.figurePartId)}>Ref {candidate.refNo} — {candidate.partNumber}</button>)}
      <button type="button" onClick={() => setChooser(null)}>Cancel</button>
    </div> : null}
  </>;
}
