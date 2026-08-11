import styles from "./TitleBlock.module.css";

export interface TitleBlockField {
  label: string;
  value: string;
}

export interface TitleBlockProps {
  fields: TitleBlockField[];
  /** Fix to the foot of the window. Used for the shell-wide block. */
  pinned?: boolean;
  /** Shorter rows, for the pinned bar. */
  dense?: boolean;
}

/**
 * A drawing title block — NOT a page heading. The reference carries a pinned,
 * dense one at the foot of every screen after sign-in, and a three-field one
 * directly beneath each figure drawing.
 */
export function TitleBlock({
  fields,
  pinned = false,
  dense = false,
}: TitleBlockProps) {
  return (
    <div
      className={`${styles.block} ${pinned ? styles.pinned : ""} ${dense ? styles.dense : ""}`}
      style={{ gridTemplateColumns: `repeat(${fields.length}, minmax(0, 1fr))` }}
    >
      {fields.map((field) => (
        <div key={field.label} className={styles.field}>
          <span className={styles.label}>{field.label}</span>
          <span className={styles.value} title={field.value}>
            {field.value}
          </span>
        </div>
      ))}
    </div>
  );
}
