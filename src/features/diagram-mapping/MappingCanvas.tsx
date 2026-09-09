"use client";

import { useRef, useState, type Dispatch, type PointerEvent } from "react";
import { regionPath } from "@rufdiamond/contracts/diagram-geometry";
import type { ImagePoint } from "@rufdiamond/contracts";
import type { EditorAction, EditorState, Vertex } from "./editor-state";
import styles from "./mapping-editor.module.css";

/** Issued by authenticated drawing delivery; caller must provide the exact pinned source. */
export type MappingDrawing = { figureId: string; drawingFileId: string; sha256: string; width: number; height: number; url: string };
export function drawingMatches(state: EditorState, drawing: MappingDrawing | null): drawing is MappingDrawing {
  const d = state.document;
  return !!drawing && !!drawing.url && /^(https:\/\/|\/(?!\/))/.test(drawing.url) && drawing.figureId === d.figureId && drawing.drawingFileId === d.drawingFileId && drawing.sha256 === d.drawingSha256 && drawing.width === d.imageWidth && drawing.height === d.imageHeight;
}
function imagePoint(svg: SVGSVGElement, x: number, y: number): ImagePoint | null {
  const matrix = svg.getScreenCTM()?.inverse();
  return matrix ? [matrix.a * x + matrix.c * y + matrix.e, matrix.b * x + matrix.d * y + matrix.f] : null;
}
type Gesture = { kind: "pan"; x: number; y: number; pan: ImagePoint } | { kind: "label"; start: ImagePoint } | { kind: "vertex"; vertex: Vertex };
export function MappingCanvas({ state, drawing, enabled, dispatch, onImageReady }: { state: EditorState; drawing: MappingDrawing; enabled: boolean; dispatch: Dispatch<EditorAction>; onImageReady: (ready: boolean) => void }) {
  const svg = useRef<SVGSVGElement>(null);
  const [gesture, setGesture] = useState<Gesture | null>(null);
  const [pan, setPan] = useState<ImagePoint>([0, 0]);
  const [zoom, setZoom] = useState(1);
  const [preview, setPreview] = useState<ImagePoint | null>(null);
  const selected = state.document.occurrences.find(o => o.calloutId === state.selectedOccurrence);
  function down(event: PointerEvent<SVGSVGElement>) {
    if (!enabled || event.button !== 0 || !svg.current) return;
    if (state.tool === "pan") { setGesture({ kind: "pan", x: event.clientX, y: event.clientY, pan }); event.currentTarget.setPointerCapture?.(event.pointerId); }
    else if (state.tool === "label" && !state.openRing) {
      const start = imagePoint(svg.current, event.clientX, event.clientY);
      if (start) { setGesture({ kind: "label", start }); event.currentTarget.setPointerCapture?.(event.pointerId); }
    }
  }
  function move(event: PointerEvent<SVGSVGElement>) {
    const active = gesture;
    if (!active || !svg.current) return;
    if (active.kind === "pan") setPan([active.pan[0] + event.clientX - active.x, active.pan[1] + event.clientY - active.y]);
    else setPreview(imagePoint(svg.current, event.clientX, event.clientY));
  }
  function up(event: PointerEvent<SVGSVGElement>) {
    const active = gesture;
    const end = svg.current && imagePoint(svg.current, event.clientX, event.clientY);
    if (enabled && active && end) {
      if (active.kind === "vertex") dispatch({ type: "moveVertex", ...active.vertex, point: end });
      if (active.kind === "label") dispatch({ type: "setLabel", label: { x: Math.min(active.start[0], end[0]), y: Math.min(active.start[1], end[1]), width: Math.abs(end[0] - active.start[0]), height: Math.abs(end[1] - active.start[1]) } });
    }
    setGesture(null); setPreview(null);
    if (event.currentTarget.hasPointerCapture?.(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  }
  return <section aria-label="Drawing workspace">
    <div className={styles.zoomControls}><button onClick={() => setZoom(z => Math.min(8, z * 1.25))}>Zoom in</button><button onClick={() => setZoom(z => Math.max(0.25, z / 1.25))}>Zoom out</button><button onClick={() => { setZoom(1); setPan([0, 0]); }}>Fit drawing</button></div>
    <div className={styles.viewport}>
      <div className={styles.imageLayer} style={{ aspectRatio: `${drawing.width} / ${drawing.height}`, transform: `translate(${pan[0]}px, ${pan[1]}px) scale(${zoom})` }}>
        {/* Exact private URL is supplied by authenticated delivery; never optimize/cache it publicly. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={drawing.url} alt="Authoritative drawing" draggable={false} referrerPolicy="no-referrer" onLoad={event => onImageReady(event.currentTarget.naturalWidth === drawing.width && event.currentTarget.naturalHeight === drawing.height)} onError={() => onImageReady(false)} />
        <svg ref={svg} data-testid="mapping-canvas" viewBox={`0 0 ${drawing.width} ${drawing.height}`} aria-label="Polygon editing canvas" aria-describedby="mapping-instructions" tabIndex={0}
          onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={() => { setGesture(null); setPreview(null); }}
          onClick={event => {
            if (!enabled || !state.openRing || !svg.current) return;
            const point = imagePoint(svg.current, event.clientX, event.clientY);
            if (point) dispatch({ type: "addPoint", point });
          }}>
          {enabled && state.document.occurrences.map(o => <g key={o.calloutId} opacity={o.calloutId === state.selectedOccurrence ? 1 : 0.35}>
            {o.labelRegion && <rect {...o.labelRegion} className={styles.label} />}
            {o.regions.map((r, index) => <path key={r.id} d={regionPath(r)} fillRule="evenodd" className={styles.region} role="button" tabIndex={0} aria-label={`Component region ${index + 1}, reference ${o.refNo}, occurrence ${o.calloutId}`} aria-pressed={state.selectedRegion === r.id}
              onClick={event => { if (state.tool !== "select" || state.openRing) return; event.stopPropagation(); dispatch({ type: "selectOccurrence", calloutId: o.calloutId }); dispatch({ type: "selectRegion", regionId: r.id }); }}
              onKeyDown={event => { if (state.tool === "select" && (event.key === "Enter" || event.key === " ")) { event.preventDefault(); event.stopPropagation(); dispatch({ type: "selectOccurrence", calloutId: o.calloutId }); dispatch({ type: "selectRegion", regionId: r.id }); } }} />)}
          </g>)}
          {enabled && state.tool === "select" && selected?.regions.filter(r => r.id === state.selectedRegion).flatMap(r => [r.outer, ...r.holes].flatMap((ring, ringIndex) => ring.map((point, index) => {
            const vertex = { regionId: r.id, holeIndex: ringIndex === 0 ? null : ringIndex - 1, index };
            const active = gesture?.kind === "vertex" && JSON.stringify(gesture.vertex) === JSON.stringify(vertex);
            const p = active && preview ? preview : point;
            return <circle key={`${r.id}-${ringIndex}-${index}`} cx={p[0]} cy={p[1]} r={5 / zoom} className={styles.vertex} role="button" tabIndex={0} aria-label={`${ringIndex ? `Hole ${ringIndex}` : "Outer"} vertex ${index + 1}`}
              onClick={event => { event.stopPropagation(); dispatch({ type: "selectVertex", vertex }); }}
              onFocus={() => dispatch({ type: "selectVertex", vertex })}
              onPointerDown={event => { event.stopPropagation(); dispatch({ type: "selectVertex", vertex }); setGesture({ kind: "vertex", vertex }); svg.current?.setPointerCapture?.(event.pointerId); }}
              onKeyDown={event => {
                const delta: Record<string, ImagePoint> = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
                if (delta[event.key]) { event.preventDefault(); event.stopPropagation(); dispatch({ type: "moveVertex", ...vertex, point: [point[0] + delta[event.key][0] * (event.shiftKey ? 10 : 1), point[1] + delta[event.key][1] * (event.shiftKey ? 10 : 1)] }); }
              }} />;
          })))}
          {enabled && state.openRing && <g>
            <polyline points={state.openRing.points.map(p => p.join(",")).join(" ")} className={styles.openRing} />
            {state.openRing.points.map((p, index) => <circle key={index} cx={p[0]} cy={p[1]} r={5 / zoom} className={styles.vertex} {...(index === 0 ? { role: "button", tabIndex: 0, "aria-label": "Close ring at first vertex", onClick: (event: React.MouseEvent) => { event.stopPropagation(); dispatch({ type: "closeRing" }); } } : {})} />)}
          </g>}
          {enabled && gesture?.kind === "label" && preview && <rect x={Math.min(gesture.start[0], preview[0])} y={Math.min(gesture.start[1], preview[1])} width={Math.abs(gesture.start[0] - preview[0])} height={Math.abs(gesture.start[1] - preview[1])} className={styles.label} />}
        </svg>
      </div>
    </div>
  </section>;
}
