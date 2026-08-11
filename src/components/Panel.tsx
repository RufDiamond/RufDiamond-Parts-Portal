import type { ReactNode } from "react";
import styles from "./Panel.module.css";

export interface PanelProps {
  /** Mono small-caps label above the title. */
  eyebrow?: string;
  title?: string;
  /** "strong" draws the 2px frame reserved for the primary panel. */
  frame?: "thin" | "strong";
  /** "none" lets a table or row list meet the panel edge. */
  padding?: "default" | "none";
  actions?: ReactNode;
  children: ReactNode;
}

/** The card the reference builds every screen out of. */
export function Panel({
  eyebrow,
  title,
  frame = "thin",
  padding = "default",
  actions,
  children,
}: PanelProps) {
  return (
    <section
      className={`${styles.panel} ${frame === "strong" ? styles.frameStrong : ""}`}
    >
      {eyebrow || title ? (
        <header className={styles.head}>
          <div className={styles.heading}>
            {eyebrow ? <span className="eyebrow">{eyebrow}</span> : null}
            {title ? <h2 className={styles.title}>{title}</h2> : null}
          </div>
          {actions ? <div className={styles.actions}>{actions}</div> : null}
        </header>
      ) : null}
      <div
        className={`${styles.body} ${padding === "none" ? styles.bodyNone : ""}`}
      >
        {children}
      </div>
    </section>
  );
}
