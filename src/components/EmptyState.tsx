import type { ReactNode } from "react";
import styles from "./EmptyState.module.css";

export interface EmptyStateProps {
  title: string;
  description?: string;
  /** A short mono note — a figure reference, a search term, a file id. */
  note?: string;
  action?: ReactNode;
}

/** Placeholder for a region with nothing in it yet: no figures, no results. */
export function EmptyState({
  title,
  description,
  note,
  action,
}: EmptyStateProps) {
  return (
    <div className={styles.empty}>
      <p className={styles.title}>{title}</p>
      {description ? <p className={styles.description}>{description}</p> : null}
      {note ? <p className={styles.note}>{note}</p> : null}
      {action ? <div className={styles.action}>{action}</div> : null}
    </div>
  );
}
