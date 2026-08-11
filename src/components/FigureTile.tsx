"use client";

import { formatFigureRef } from "@/lib/format";
import type { FigureStatus } from "@/types/catalog";
import { Badge } from "./Badge";
import styles from "./FigureTile.module.css";

const STATUS_LABEL: Record<FigureStatus, string> = {
  published: "Released",
  draft: "In preparation",
  superseded: "Superseded",
};

export interface FigureTileProps {
  groupNo: string;
  name: string;
  status: FigureStatus;
  partCount?: number;
  calloutCount?: number;
  /** Sheet number as printed, e.g. "01 / 04". */
  sheet?: string;
  /** True when the plate drawing has not been attached yet. */
  drawingMissing?: boolean;
  href?: string;
  onSelect?: () => void;
}

/** One figure within a system: sheet thumbnail, group number, readiness. */
export function FigureTile({
  groupNo,
  name,
  status,
  partCount,
  calloutCount,
  sheet,
  drawingMissing = false,
  href,
  onSelect,
}: FigureTileProps) {
  const meta = [
    calloutCount === undefined ? null : `${calloutCount} callouts`,
    partCount === undefined ? null : `${partCount} parts`,
  ]
    .filter(Boolean)
    .join(" · ");

  const body = (
    <>
      <span className={styles.head}>
        <span className="eyebrow">{formatFigureRef(groupNo)}</span>
        <Badge variant={drawingMissing ? "hatched" : "outline"}>
          {drawingMissing ? "Drawing in preparation" : STATUS_LABEL[status]}
        </Badge>
      </span>
      <span
        className={`${styles.preview} ${drawingMissing ? styles.previewMissing : ""}`}
      >
        {drawingMissing ? null : <span className={styles.previewTrim} />}
        <span className={styles.previewLabel}>
          {drawingMissing ? "No sheet" : `Sheet ${sheet ?? "—"}`}
        </span>
      </span>
      <span className={styles.body}>
        <span className={styles.name}>{name}</span>
        {meta ? <span className={styles.meta}>{meta}</span> : null}
      </span>
    </>
  );

  const className = `${styles.tile} ${drawingMissing ? styles.pending : ""}`;

  if (onSelect) {
    return (
      <button type="button" className={className} onClick={onSelect}>
        {body}
      </button>
    );
  }

  if (href) {
    return (
      <a href={href} className={className}>
        {body}
      </a>
    );
  }

  return <div className={className}>{body}</div>;
}
