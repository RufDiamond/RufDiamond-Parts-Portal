"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import { CalloutMarker } from "./CalloutMarker";
import styles from "./DrawingViewer.module.css";

export interface DrawingMarker {
  id: string;
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
export const ZOOM_STEPS = [1, 1.5, 2, 3, 4];

function stepFrom(zoom: number, direction: 1 | -1): number {
  const i = ZOOM_STEPS.indexOf(zoom);
  const next = (i === -1 ? 0 : i) + direction;
  return ZOOM_STEPS[Math.min(ZOOM_STEPS.length - 1, Math.max(0, next))];
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
  selectedPartIds = NO_SELECTION,
  hoveredPartId = null,
  onTogglePart,
  onHoverPart,
  zoom = 1,
  onZoomChange,
}: DrawingViewerProps) {
  const highlighted = markers.filter(
    (marker) =>
      marker.maskPath !== undefined &&
      (selectedPartIds.has(marker.partId) || marker.partId === hoveredPartId),
  );

  const markerState = (partId: string) => {
    if (selectedPartIds.has(partId) || partId === hoveredPartId) {
      return "active" as const;
    }
    // Once something is selected, everything else steps back.
    return selectedPartIds.size > 0 ? ("muted" as const) : ("default" as const);
  };

  // Only constrain the frame when a plate is actually attached; the empty
  // state keeps the stylesheet's fixed height.
  const frame =
    src && width && height
      ? { aspectRatio: `${width} / ${height}`, height: "auto" }
      : undefined;

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
  const from = useRef<{
    x: number;
    y: number;
    left: number;
    top: number;
  } | null>(null);
  const moved = useRef(false);
  const [dragging, setDragging] = useState(false);

  /*
   * Pinching a trackpad and ctrl-scrolling a mouse both arrive as a wheel
   * event with ctrlKey set. Bound by hand because preventDefault is needed to
   * stop the browser zooming the whole page, and React's onWheel is passive.
   */
  useEffect(() => {
    const box = sheet.current;
    if (!box || !onZoomChange) return;

    const onWheel = (event: WheelEvent) => {
      if (!event.ctrlKey && !event.metaKey) return;
      event.preventDefault();
      onZoomChange(stepFrom(zoom, event.deltaY < 0 ? 1 : -1));
    };

    box.addEventListener("wheel", onWheel, { passive: false });
    return () => box.removeEventListener("wheel", onWheel);
  }, [zoom, onZoomChange]);

  const startDrag = (event: React.PointerEvent<HTMLDivElement>) => {
    const box = sheet.current;
    if (!box || zoom === 1) return;
    from.current = {
      x: event.clientX,
      y: event.clientY,
      left: box.scrollLeft,
      top: box.scrollTop,
    };
    moved.current = false;
    setDragging(true);
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const onDrag = (event: React.PointerEvent<HTMLDivElement>) => {
    const start = from.current;
    const box = sheet.current;
    if (!start || !box) return;
    const dx = event.clientX - start.x;
    const dy = event.clientY - start.y;
    if (Math.abs(dx) > 3 || Math.abs(dy) > 3) moved.current = true;
    box.scrollLeft = start.left - dx;
    box.scrollTop = start.top - dy;
  };

  const endDrag = (event: React.PointerEvent<HTMLDivElement>) => {
    if (from.current) event.currentTarget.releasePointerCapture(event.pointerId);
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
        style={frame}
        onMouseLeave={() => onHoverPart?.(null)}
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
          <img src={src} alt={label} className={styles.plate} />
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
              <path key={marker.id} d={marker.maskPath} />
            ))}
          </svg>
        ) : null}

        {markers.map((marker) => (
          <CalloutMarker
            key={marker.id}
            number={marker.number}
            x={marker.x}
            y={marker.y}
            state={markerState(marker.partId)}
            title={marker.label}
            onActivate={
              onTogglePart ? () => onTogglePart(marker.partId) : undefined
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
