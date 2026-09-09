"use client";

import styles from "./CalloutMarker.module.css";

export type CalloutMarkerState = "default" | "active" | "muted";

export interface CalloutMarkerProps {
  number: number;
  /** Percentages, 0-100. Omit to render inline rather than on a drawing. */
  x?: number;
  y?: number;
  state?: CalloutMarkerState;
  /** Persistent selection, independent of the temporary visual hover state. */
  pressed?: boolean;
  size?: "sm" | "md";
  title?: string;
  onActivate?: () => void;
  onHoverChange?: (hovering: boolean) => void;
}

/**
 * A numbered callout square. Placed on a drawing in percentages so it tracks
 * the plate at any container width, or inline in a parts-list Ref cell.
 */
export function CalloutMarker({
  number,
  x,
  y,
  state = "default",
  pressed,
  size = "md",
  title,
  onActivate,
  onHoverChange,
}: CalloutMarkerProps) {
  const interactive = Boolean(onActivate);
  const placed = x !== undefined && y !== undefined;

  return (
    <button
      type="button"
      className={`${styles.marker} ${styles[state]} ${size === "sm" ? styles.sm : ""} ${placed ? styles.placed : ""}`}
      style={placed ? { left: `${x}%`, top: `${y}%` } : undefined}
      title={title}
      aria-label={title ? `Callout ${number}: ${title}` : `Callout ${number}`}
      aria-pressed={interactive ? (pressed ?? state === "active") : undefined}
      disabled={!interactive}
      onPointerDown={(event) => event.stopPropagation()}
      onClick={onActivate}
      onMouseEnter={() => onHoverChange?.(true)}
      onMouseLeave={() => onHoverChange?.(false)}
      onFocus={() => onHoverChange?.(true)}
      onBlur={() => onHoverChange?.(false)}
    >
      {number}
    </button>
  );
}
