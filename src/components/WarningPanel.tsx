import type { ReactNode } from "react";
import styles from "./WarningPanel.module.css";

export type WarningSeverity = "critical" | "caution" | "note";

export interface WarningPanelProps {
  severity?: WarningSeverity;
  title: string;
  children: ReactNode;
}

/** A flagged note beside the work: two-position parts, serial mismatches. */
export function WarningPanel({
  severity = "note",
  title,
  children,
}: WarningPanelProps) {
  return (
    <aside className={`${styles.panel} ${styles[severity]}`}>
      <p className={styles.title}>{title}</p>
      <p className={styles.body}>{children}</p>
    </aside>
  );
}
