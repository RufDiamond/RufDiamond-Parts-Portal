"use client";

import { useState } from "react";
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
  /** Tooltip text for the marker. */
  label?: string;
}

export interface DrawingViewerProps {
  /** Sheet caption, e.g. "FIG 1.1 — Filters". */
  label: string;
  /** Asset handle. Null renders a blank plate with the callouts still placed. */
  drawingFileId?: string | null;
  /** Resolved image URL. Until the backend serves drawings, leave undefined. */
  src?: string;
  markers: DrawingMarker[];
  /**
   * Selected parts. EVERY marker carrying one of these part ids goes solid —
   * a part fitted in two places lights in both — and the rest recede.
   */
  selectedPartIds?: ReadonlySet<string>;
  /** Part under the pointer, wherever the pointer is. */
  hoveredPartId?: string | null;
  onTogglePart?: (partId: string) => void;
  onHoverPart?: (partId: string | null) => void;
}

const ZOOM_STEPS = [1, 1.5, 2, 3] as const;

const NO_SELECTION: ReadonlySet<string> = new Set();

/**
 * The drawing plate with its callouts overlaid.
 *
 * Selecting a part lights every marker that points at it, which is how
 * multi-occurrence items read correctly on the sheet.
 */
export function DrawingViewer({
  label,
  drawingFileId = null,
  src,
  markers,
  selectedPartIds = NO_SELECTION,
  hoveredPartId = null,
  onTogglePart,
  onHoverPart,
}: DrawingViewerProps) {
  const [zoomIndex, setZoomIndex] = useState(0);
  const zoom = ZOOM_STEPS[zoomIndex];

  const markerState = (partId: string) => {
    if (selectedPartIds.has(partId) || partId === hoveredPartId) {
      return "active" as const;
    }
    // Once something is selected, everything else steps back so the chosen
    // part reads at a glance.
    return selectedPartIds.size > 0 ? ("muted" as const) : ("default" as const);
  };

  return (
    <figure className={styles.viewer}>
      <div className={styles.toolbar}>
        <figcaption className={styles.label}>{label}</figcaption>
        <div className={styles.zoom}>
          <span className={styles.zoomValue}>{Math.round(zoom * 100)}%</span>
          <button
            type="button"
            className={styles.zoomButton}
            onClick={() => setZoomIndex((index) => Math.max(0, index - 1))}
            disabled={zoomIndex === 0}
            aria-label="Zoom out"
          >
            &minus;
          </button>
          <button
            type="button"
            className={styles.zoomButton}
            onClick={() =>
              setZoomIndex((index) => Math.min(ZOOM_STEPS.length - 1, index + 1))
            }
            disabled={zoomIndex === ZOOM_STEPS.length - 1}
            aria-label="Zoom in"
          >
            +
          </button>
        </div>
      </div>

      <div className={styles.frame}>
        <div
          className={styles.sheet}
          style={{ width: `${zoom * 100}%` }}
          onMouseLeave={() => onHoverPart?.(null)}
        >
          {src ? (
            // Plain <img>: the drawing is an arbitrary external asset served by
            // the backend, and next/image would need its dimensions up front.
            // eslint-disable-next-line @next/next/no-img-element
            <img src={src} alt={label} className={styles.plate} />
          ) : (
            <div className={styles.placeholder}>
              <p className={styles.placeholderTitle}>Drawing not attached</p>
              <p className={styles.placeholderNote}>
                {drawingFileId
                  ? `File ${drawingFileId} is not available in this build`
                  : "Callouts are positioned on a blank plate"}
              </p>
            </div>
          )}

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
