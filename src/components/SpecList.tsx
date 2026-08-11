import type { ReactNode } from "react";
import styles from "./SpecList.module.css";

export interface Spec {
  label: string;
  value: ReactNode;
}

export interface SpecListProps {
  items: Spec[];
  columns?: 1 | 2;
}

/** Label/value record rows — the machine record, the submission record. */
export function SpecList({ items, columns = 1 }: SpecListProps) {
  return (
    <dl className={`${styles.list} ${columns === 2 ? styles.columns2 : ""}`}>
      {items.map((item) => (
        <div key={item.label} className={styles.row}>
          <dt className={styles.label}>{item.label}</dt>
          <dd className={styles.value}>{item.value}</dd>
        </div>
      ))}
    </dl>
  );
}
