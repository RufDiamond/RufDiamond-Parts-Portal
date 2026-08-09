"use client";

import styles from "./SystemTile.module.css";

export interface SystemTileProps {
  name: string;
  /** Position in the contents list, rendered as a two-digit index. */
  index?: number;
  figureCount: number;
  selected?: boolean;
  /** Renders an anchor. Ignored when `onSelect` is given. */
  href?: string;
  onSelect?: () => void;
}

/** One entry in the systems contents grid. */
export function SystemTile({
  name,
  index,
  figureCount,
  selected = false,
  href,
  onSelect,
}: SystemTileProps) {
  const empty = figureCount === 0;

  const body = (
    <>
      {index === undefined ? null : (
        <span className={styles.index}>{String(index).padStart(2, "0")}</span>
      )}
      <span className={styles.name}>{name}</span>
      <span className={empty ? styles.countEmpty : styles.count}>
        {empty ? "No figures" : `${figureCount} ${figureCount === 1 ? "figure" : "figures"}`}
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
      <a href={href} className={className} aria-current={selected ? "page" : undefined}>
        {body}
      </a>
    );
  }

  return <div className={className}>{body}</div>;
}
