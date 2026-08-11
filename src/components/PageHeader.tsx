import type { ReactNode } from "react";
import styles from "./PageHeader.module.css";

export interface PageHeaderProps {
  eyebrow?: string;
  title: string;
  description?: string;
  /** Mono identifiers under the title, separated by hairline dividers. */
  meta?: string[];
  actions?: ReactNode;
  /** Set when breadcrumbs sit above; tightens the top padding. */
  hasTrail?: boolean;
}

export function PageHeader({
  eyebrow,
  title,
  description,
  meta,
  actions,
  hasTrail = false,
}: PageHeaderProps) {
  return (
    <header
      className={`${styles.header} ${hasTrail ? styles.withTrail : ""}`}
    >
      <div className={styles.heading}>
        {eyebrow ? <span className="eyebrow">{eyebrow}</span> : null}
        <h1 className={styles.title}>{title}</h1>
        {description ? (
          <span className={styles.description}>{description}</span>
        ) : null}
        {meta?.length ? (
          <div className={styles.meta}>
            {meta.map((item, index) => (
              <span key={item} className={styles.meta}>
                {index === 0 ? null : (
                  <span aria-hidden="true" className={styles.metaDivider} />
                )}
                <span className={styles.metaItem}>{item}</span>
              </span>
            ))}
          </div>
        ) : null}
      </div>
      {actions ? <div className={styles.actions}>{actions}</div> : null}
    </header>
  );
}
