"use client";

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
  markers: DrawingMarker[];
  /**
   * Selected parts. EVERY marker carrying one of these part ids goes solid —
   * a part fitted in two places lights in both — and the rest recede.
   */
  selectedPartIds?: ReadonlySet<string>;
  hoveredPartId?: string | null;
  onTogglePart?: (partId: string) => void;
  onHoverPart?: (partId: string | null) => void;
}

const NO_SELECTION: ReadonlySet<string> = new Set();

/** The drawing plate with its callouts overlaid. */
export function DrawingViewer({
  label,
  count,
  note,
  src,
  markers,
  selectedPartIds = NO_SELECTION,
  hoveredPartId = null,
  onTogglePart,
  onHoverPart,
}: DrawingViewerProps) {
  const markerState = (partId: string) => {
    if (selectedPartIds.has(partId) || partId === hoveredPartId) {
      return "active" as const;
    }
    // Once something is selected, everything else steps back.
    return selectedPartIds.size > 0 ? ("muted" as const) : ("default" as const);
  };

  return (
    <figure className={styles.viewer}>
      <div className={styles.toolbar}>
        <figcaption className="eyebrow">{label}</figcaption>
        {count ? <span className={styles.count}>{count}</span> : null}
      </div>

      <div className={styles.sheet} onMouseLeave={() => onHoverPart?.(null)}>
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
    </figure>
  );
}
