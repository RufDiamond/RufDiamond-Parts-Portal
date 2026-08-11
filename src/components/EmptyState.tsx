import type { ReactNode } from "react";
import { Icon, type IconName } from "./Icon";
import styles from "./EmptyState.module.css";

export interface EmptyStateProps {
  title: string;
  description?: string;
  eyebrow?: string;
  icon?: IconName;
  /** A short mono note — a figure reference, a search term, a file id. */
  note?: string;
  action?: ReactNode;
}

/** Placeholder for a region with nothing in it yet: no figures, no results. */
export function EmptyState({
  title,
  description,
  eyebrow,
  icon,
  note,
  action,
}: EmptyStateProps) {
  return (
    <div className={styles.empty}>
      {icon ? <Icon name={icon} size="lg" className={styles.icon} /> : null}
      {eyebrow ? <span className="eyebrow">{eyebrow}</span> : null}
      <p className={styles.title}>{title}</p>
      {description ? <p className={styles.description}>{description}</p> : null}
      {note ? <p className={styles.note}>{note}</p> : null}
      {action ? <div className={styles.action}>{action}</div> : null}
    </div>
  );
}
