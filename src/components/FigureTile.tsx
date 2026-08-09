"use client";

import { formatFigureRef } from "@/lib/format";
import type { FigureStatus } from "@/types/catalog";
import { StateChip } from "./StateChip";
import styles from "./FigureTile.module.css";

export interface FigureTileProps {
  groupNo: string;
  name: string;
  status: FigureStatus;
  partCount?: number;
  /** True when the plate drawing has not been attached yet. */
  drawingMissing?: boolean;
  selected?: boolean;
  /** Renders an anchor. Ignored when `onSelect` is given. */
  href?: string;
  onSelect?: () => void;
}

/** One figure within a system: its group number, name, and readiness. */
export function FigureTile({
  groupNo,
  name,
  status,
  partCount,
  drawingMissing = false,
  selected = false,
  href,
  onSelect,
}: FigureTileProps) {
  const body = (
    <>
      <div className={styles.head}>
        <span className={styles.ref}>{formatFigureRef(groupNo)}</span>
        {status === "published" ? null : (
          <StateChip label={status} tone={selected ? "strong" : "muted"} />
        )}
      </div>
      <span className={styles.name}>{name}</span>
      <span className={styles.foot}>
        {partCount === undefined
          ? null
          : `${partCount} ${partCount === 1 ? "part" : "parts"}`}
        {drawingMissing ? (
          <span className={styles.warning}>No drawing</span>
        ) : null}
      </span>
    </>
  );

  const className = `${styles.tile} ${selected ? styles.selected : ""}`;

  if (onSelect) {
    return (
      <button
        type="button"
        className={className}
        onClick={onSelect}
        aria-pressed={selected}
      >
        {body}
      </button>
    );
  }

  if (href) {
    return (
      <a
        href={href}
        className={className}
        aria-current={selected ? "page" : undefined}
      >
        {body}
      </a>
    );
  }

  return <div className={className}>{body}</div>;
}
