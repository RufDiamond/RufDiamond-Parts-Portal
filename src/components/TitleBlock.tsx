import type { ReactNode } from "react";
import styles from "./TitleBlock.module.css";

export interface TitleBlockMeta {
  label: string;
  value: string;
}

export interface TitleBlockProps {
  /** Small mono line above the title — the section or document class. */
  eyebrow?: string;
  title: string;
  subtitle?: string;
  /** Drawing-sheet style field list: revision, serial range, sheet count. */
  meta?: TitleBlockMeta[];
  actions?: ReactNode;
}

/**
 * The header of a screen, modelled on the title block of an engineering
 * drawing: what this sheet is, and the fields that identify it.
 */
export function TitleBlock({
  eyebrow,
  title,
  subtitle,
  meta,
  actions,
}: TitleBlockProps) {
  return (
    <header className={styles.block}>
      <div className={styles.heading}>
        <div>
          {eyebrow ? <p className={styles.eyebrow}>{eyebrow}</p> : null}
          <h1 className={styles.title}>{title}</h1>
          {subtitle ? <p className={styles.subtitle}>{subtitle}</p> : null}
        </div>
        {actions ? <div className={styles.actions}>{actions}</div> : null}
      </div>

      {meta?.length ? (
        <dl className={styles.meta}>
          {meta.map((field) => (
            <div key={field.label} className={styles.field}>
              <dt className={styles.fieldLabel}>{field.label}</dt>
              <dd className={styles.fieldValue}>{field.value}</dd>
            </div>
          ))}
        </dl>
      ) : null}
    </header>
  );
}
