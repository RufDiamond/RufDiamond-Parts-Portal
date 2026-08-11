"use client";

import { Icon, type IconName } from "./Icon";
import styles from "./SystemTile.module.css";

export interface SystemTileProps {
  name: string;
  figureCount: number;
  icon?: IconName;
  /** Catalogue revision, for the "empty in revision" note. */
  revision?: string;
  href?: string;
  onSelect?: () => void;
}

/** One entry in the systems contents grid. */
export function SystemTile({
  name,
  figureCount,
  icon = "box",
  revision,
  href,
  onSelect,
}: SystemTileProps) {
  const empty = figureCount === 0;

  const body = (
    <>
      <Icon name={icon} size="lg" />
      <span className={styles.name}>{name}</span>
      <span className={styles.foot}>
        {empty
          ? `Empty in revision ${revision ?? "—"}`
          : `${figureCount} ${figureCount === 1 ? "figure" : "figures"}`}
      </span>
    </>
  );

  const className = `${styles.tile} ${empty ? styles.empty : ""}`;

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
