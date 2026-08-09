"use client";

import styles from "./CalloutMarker.module.css";

export type CalloutMarkerState = "default" | "active" | "muted";

export interface CalloutMarkerProps {
  number: number;
  /** Percentage across the drawing, 0-100. */
  x: number;
  /** Percentage down the drawing, 0-100. */
  y: number;
  state?: CalloutMarkerState;
  /** Tooltip — usually the part number and description. */
  title?: string;
  onActivate?: () => void;
  onHoverChange?: (hovering: boolean) => void;
}

/**
 * A numbered marker pinned to a drawing. Positioned in percentages so it
 * tracks the plate at any zoom or container width.
 *
 * Square rather than the usual circle: zero radius is a system rule.
 * Requires a positioned ancestor.
 */
export function CalloutMarker({
  number,
  x,
  y,
  state = "default",
  title,
  onActivate,
  onHoverChange,
}: CalloutMarkerProps) {
  const interactive = Boolean(onActivate);

  return (
    <button
      type="button"
      className={`${styles.marker} ${styles[state]}`}
      style={{ left: `${x}%`, top: `${y}%` }}
      title={title}
      aria-label={title ? `Callout ${number}: ${title}` : `Callout ${number}`}
      aria-pressed={interactive ? state === "active" : undefined}
      disabled={!interactive}
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
