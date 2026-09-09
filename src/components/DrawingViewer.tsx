"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import { CalloutMarker } from "./CalloutMarker";
import { DiagramRegions } from "./DiagramRegions";
import type { DiagramRegionDocument } from "@/lib/drawing";
import type { SelectDiagramPart, SelectionActivation } from "@/state/useDiagramSelection";
import { DIAGRAM_ZOOM_STEPS, revealDelta, revealZoom, type ViewportRect } from "@/lib/diagram-viewport";
import styles from "./DrawingViewer.module.css";

export interface DrawingMarker {
  id: string;
  figurePartId?: string;
  number: number;
  /** Percentages, 0-100. */
  x: number;
  y: number;
  /** Which part this marker points at. Several markers may share a part. */
  partId: string;
  /**
   * The part's own artwork as an SVG path in the same 0-100 space, when it
   * could be recovered from the plate. Selecting the part fills this shape.
   */
  maskPath?: string;
  label?: string;
}

export interface DrawingViewerProps {
  /** Sheet caption for the strip above the plate. */
  label: string;
  /** Right-hand count, e.g. "6 callouts · 5 parts". */
  count?: string;
  /** Note shown inside the trim line when no drawing is attached. */
  note?: string;
  /** Resolved image URL. Until the backend serves drawings, leave undefined. */
  src?: string;
  /**
   * The plate's true pixel dimensions. Markers are percentages OF THE DRAWING,
   * so the frame has to carry the drawing's aspect ratio — letterboxing inside
   * a differently-shaped box would slide every marker off its target.
   */
  width?: number;
  height?: number;
  markers: DrawingMarker[];
  document?: DiagramRegionDocument;
  onSelectPart?: SelectDiagramPart;
  selectionActivation?: SelectionActivation;
  /** Incremented by the explicit Show selected part action. */
  revealRequest?: number;
  /**
   * Selected parts. EVERY marker carrying one of these part ids goes solid —
   * a part fitted in two places lights in both — and the rest recede.
   */
  selectedPartIds?: ReadonlySet<string>;
  hoveredPartId?: string | null;
  onTogglePart?: (partId: string) => void;
  onHoverPart?: (partId: string | null) => void;
  /**
   * Plate magnification. Markers sit in percentages of the plate, so growing
   * the whole sheet keeps every marker on its target.
   */
  zoom?: number;
  /**
   * Called when the reader zooms from the plate itself — pinching a trackpad
   * or ctrl-scrolling a mouse. Omit to leave the buttons the only way in.
   */
  onZoomChange?: (zoom: number) => void;
}

/** The steps the buttons and the wheel both move through. */
export const ZOOM_STEPS = DIAGRAM_ZOOM_STEPS;

function stepFrom(zoom: number, direction: 1 | -1): number {
  const i = ZOOM_STEPS.indexOf(zoom);
  const next = (i === -1 ? 0 : i) + direction;
  return ZOOM_STEPS[Math.min(ZOOM_STEPS.length - 1, Math.max(0, next))];
}

/** Apply one wheel gesture only when it originated over the rendered drawing. */
export function handleDrawingWheel(
  event: Pick<WheelEvent, "deltaY" | "preventDefault" | "target">,
  drawing: Pick<HTMLDivElement, "contains"> | null,
  zoom: number,
  onZoomChange?: (zoom: number) => void,
): boolean {
  if (
    !drawing ||
    !onZoomChange ||
    event.deltaY === 0 ||
    event.target === null ||
    !drawing.contains(event.target as Node)
  ) {
    return false;
  }

  event.preventDefault();
  onZoomChange(stepFrom(zoom, event.deltaY < 0 ? 1 : -1));
  return true;
}

const NO_SELECTION: ReadonlySet<string> = new Set();

/** The drawing plate with its callouts overlaid. */
export function DrawingViewer({
  label,
  count,
  note,
  src,
  width,
  height,
  markers,
  document,
  onSelectPart,
  selectionActivation,
  revealRequest = 0,
  selectedPartIds = NO_SELECTION,
  hoveredPartId = null,
  onTogglePart,
  onHoverPart,
  zoom = 1,
  onZoomChange,
}: DrawingViewerProps) {
  const numericDocument = src && document && width === document.imageWidth && height === document.imageHeight ? document : undefined;
  const numericIds = new Set(numericDocument?.occurrences.filter((item) => item.regions.length).map((item) => item.calloutId));
  const highlighted = markers.filter(
    (marker) =>
      marker.maskPath !== undefined &&
      !numericIds.has(marker.id) &&
      (selectedPartIds.has(marker.partId) || marker.partId === hoveredPartId),
  );

  const markerState = (partId: string) => {
    if (selectedPartIds.has(partId) || partId === hoveredPartId) {
      return "active" as const;
    }
    // Once something is selected, everything else steps back.
    return selectedPartIds.size > 0 ? ("muted" as const) : ("default" as const);
  };

  /*
   * The frame no longer carries the drawing's aspect ratio. It used to, which
   * pinned the sheet's height to the plate's shape and left the rest of the
   * panel empty; the stage now fits the drawing inside whatever frame it is
   * given, so the frame is free to fill.
   */

  /*
   * Magnification is REAL SIZE, not a transform.
   *
   * Scaling with `transform` inside an overflow:hidden frame magnifies about
   * the centre and clips whatever leaves it — the edges of a zoomed drawing
   * simply could not be reached. Growing the canvas to `zoom x` the frame
   * makes the overflow real, so the sheet scrolls on both axes and the plate
   * can also be dragged. Markers are placed in percentages of the canvas, so
   * they ride along at every step.
   */
  const sheet = useRef<HTMLDivElement>(null);
  const drawing = useRef<HTMLDivElement>(null);
  const from = useRef<{
    x: number;
    y: number;
    left: number;
    top: number;
  } | null>(null);
  const moved = useRef(false);
  const [dragging, setDragging] = useState(false);

  const reveal = useRef<{ activation?: SelectionActivation; request: number; pending: boolean }>({ request:0, pending:false });
  useEffect(() => {
    const previous = reveal.current;
    if (previous.activation !== selectionActivation) {
      previous.activation = selectionActivation;
      previous.pending = selectionActivation?.origin === "table";
    }
    if (previous.request !== revealRequest) {
      previous.request = revealRequest;
      previous.pending = true;
    }
    if (!src || !selectedPartIds.size) previous.pending = false;
    if (!previous.pending) return;
    const box = sheet.current;
    const area = drawing.current;
    if (!box || !area || !box.clientWidth || !box.clientHeight) return;
    let frame = 0;
    let lastWidth = -1;
    let stableFrames = 0;
    const run = () => {
      const plate = area.getBoundingClientRect();
      // A fit may change zoom. Wait for the existing width transition to finish
      // before measuring the next scroll, including under reduced motion.
      stableFrames = Math.abs(plate.width - lastWidth) < 0.01 ? stableFrames + 1 : 0;
      lastWidth = plate.width;
      if (stableFrames < 2) { frame = requestAnimationFrame(run); return; }
      const targets: ViewportRect[] = [];
      const represented = new Set<string>();
      if (numericDocument) {
        for (const occurrence of numericDocument.occurrences) {
          if (!selectedPartIds.has(occurrence.partId)) continue;
          const points = occurrence.regions.flatMap((region) => region.outer);
          if (!points.length) continue;
          const xs = points.map(([x]) => plate.left + x / numericDocument.imageWidth * plate.width);
          const ys = points.map(([, y]) => plate.top + y / numericDocument.imageHeight * plate.height);
          targets.push({ left:Math.min(...xs), top:Math.min(...ys), right:Math.max(...xs), bottom:Math.max(...ys) });
          represented.add(occurrence.calloutId);
        }
      }
      const legacyPaths = new Map(Array.from(area.querySelectorAll<SVGPathElement>("path[data-legacy-selected][data-callout-id]"))
        .map((path) => [path.dataset.calloutId, path]));
      const markerElements = new Map(Array.from(area.querySelectorAll<HTMLButtonElement>(":scope > button[data-callout-id]"))
        .map((marker) => [marker.dataset.calloutId, marker]));
      for (const marker of markers) {
        if (!selectedPartIds.has(marker.partId) || represented.has(marker.id)) continue;
        // Fallback is per occurrence, never per part: measure its unchanged SVG
        // shape first, then its own marker. Do not parse arbitrary legacy paths.
        const legacy = legacyPaths.get(marker.id)?.getBoundingClientRect();
        const target = legacy && (legacy.width || legacy.height) ? legacy : markerElements.get(marker.id)?.getBoundingClientRect();
        if (target) targets.push(target);
        represented.add(marker.id);
      }
      previous.pending = false;
      if (!targets.length) return;
      const target = { left:Math.min(...targets.map((rect) => rect.left)), top:Math.min(...targets.map((rect) => rect.top)),
        right:Math.max(...targets.map((rect) => rect.right)), bottom:Math.max(...targets.map((rect) => rect.bottom)) };
      const rect = box.getBoundingClientRect();
      const left = rect.left + box.clientLeft;
      const top = rect.top + box.clientTop;
      const viewport = { left, top, right:left + box.clientWidth, bottom:top + box.clientHeight };
      const nextZoom = revealZoom(target, viewport, zoom);
      if (nextZoom < zoom && onZoomChange) {
        previous.pending = true;
        onZoomChange(nextZoom);
        return;
      }
      const delta = revealDelta(target, viewport);
      if (delta.x || delta.y) box.scrollBy({ left:delta.x, top:delta.y,
        behavior:window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth" });
    };
    frame = requestAnimationFrame(run);
    return () => cancelAnimationFrame(frame);
  }, [selectionActivation, revealRequest, src, numericDocument, markers, selectedPartIds, zoom, onZoomChange]);

  /*
   * Ordinary vertical wheel input and trackpad pinches share the existing zoom
   * steps while the pointer is over the drawing itself. Bound by hand because
   * preventDefault is needed to keep that gesture local, and React's onWheel
   * is passive. Blank space around the drawing retains normal page scrolling.
   */
  useEffect(() => {
    const box = sheet.current;
    const area = drawing.current;
    if (!box || !area || !src || !onZoomChange) return;

    const onWheel = (event: WheelEvent) => {
      handleDrawingWheel(event, area, zoom, onZoomChange);
    };

    box.addEventListener("wheel", onWheel, { passive: false });
    return () => box.removeEventListener("wheel", onWheel);
  }, [src, zoom, onZoomChange]);

  const startDrag = (event: React.PointerEvent<HTMLDivElement>) => {
    const box = sheet.current;
    if (!box || event.button !== 0) return;
    from.current = {
      x: event.clientX,
      y: event.clientY,
      left: box.scrollLeft,
      top: box.scrollTop,
    };
    moved.current = false;
  };

  const onDrag = (event: React.PointerEvent<HTMLDivElement>) => {
    const start = from.current;
    const box = sheet.current;
    if (!start || !box) return;
    const dx = event.clientX - start.x;
    const dy = event.clientY - start.y;
    if (Math.hypot(dx, dy) > 5) {
      moved.current = true;
      if (zoom > 1) {
        setDragging(true);
        event.currentTarget.setPointerCapture?.(event.pointerId);
      }
    }
    if (moved.current && zoom > 1) {
      box.scrollLeft = start.left - dx;
      box.scrollTop = start.top - dy;
    }
  };

  const endDrag = (event: React.PointerEvent<HTMLDivElement>) => {
    if (from.current && Math.hypot(event.clientX - from.current.x, event.clientY - from.current.y) > 5) moved.current = true;
    if (event.type === "pointercancel") moved.current = true;
    if (event.currentTarget.hasPointerCapture?.(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    from.current = null;
    setDragging(false);
  };

  return (
    <figure className={styles.viewer}>
      <div className={styles.toolbar}>
        <figcaption className="eyebrow">{label}</figcaption>
        {count ? <span className={styles.count}>{count}</span> : null}
      </div>

      <div
        ref={sheet}
        className={`${styles.sheet} ${zoom > 1 ? styles.sheetZoomed : ""} ${
          dragging ? styles.sheetDragging : ""
        }`}
        onMouseLeave={() => onHoverPart?.(null)}
        onPointerDownCapture={() => { moved.current = false; from.current = null; }}
        onPointerDown={startDrag}
        onPointerMove={onDrag}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        /* A drag ends in a click on whatever is under the pointer — a callout,
           most likely — so the closing click is swallowed. */
        onClickCapture={(event) => {
          if (!moved.current) return;
          moved.current = false;
          event.stopPropagation();
          event.preventDefault();
        }}
      >
        <div
          ref={drawing}
          className={styles.stage}
          style={
            {
              "--zoom": zoom,
              "--ratio": width && height ? width / height : 999,
            } as CSSProperties
          }
        >
        {src ? (
          // Plain <img>: the drawing is an arbitrary asset served by the
          // backend, and next/image would need its dimensions up front.
          // eslint-disable-next-line @next/next/no-img-element
          <img src={src} alt={label} className={styles.plate} draggable={false} />
        ) : (
          <div className={styles.trim}>
            <span className="eyebrow">{note}</span>
          </div>
        )}

        {/*
          * Selected parts, filled on top of the plate. viewBox is 0-100 in
          * both axes and preserveAspectRatio is off, so the path tracks the
          * plate exactly as the percentage-placed markers do.
          */}
        {highlighted.length > 0 ? (
          <svg
            className={styles.highlight}
            viewBox="0 0 100 100"
            preserveAspectRatio="none"
            aria-hidden="true"
          >
            {highlighted.map((marker) => (
              <path key={marker.id} d={marker.maskPath} data-callout-id={marker.id} data-legacy-selected={selectedPartIds.has(marker.partId) || undefined} />
            ))}
          </svg>
        ) : null}

        {numericDocument ? (
          <DiagramRegions key={src} document={numericDocument} selectedPartIds={selectedPartIds}
            onSelect={onSelectPart ? (id) => onSelectPart(id, "component") : undefined} />
        ) : null}

        {markers.map((marker) => (
          <CalloutMarker
            key={marker.id}
            occurrenceId={marker.id}
            number={marker.number}
            x={marker.x}
            y={marker.y}
            state={markerState(marker.partId)}
            pressed={selectedPartIds.has(marker.partId)}
            title={marker.label}
            onActivate={
              onSelectPart && marker.figurePartId ? () => onSelectPart(marker.figurePartId!, "label")
                : onTogglePart ? () => onTogglePart(marker.partId) : undefined
            }
            onHoverChange={
              onHoverPart
                ? (hovering) => onHoverPart(hovering ? marker.partId : null)
                : undefined
            }
          />
        ))}
        </div>
      </div>
    </figure>
  );
}
