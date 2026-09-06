import styles from "./Trail.module.css";

/**
 * The breadcrumb bar the deck puts at the top of every catalogue screen:
 *
 *   Search by Model: FAT TRUCK 2.4P > 3 DRIVE SYSTEM > HYDRAULIC MOTOR ASSEMBLY
 *
 * The lead is bold; the steps after it are set in capitals and separated by a
 * chevron. The last step is the screen you are on.
 */
export interface TrailProps {
  /** "Search by Model", "Search by Part Number", "Search by Description". */
  lead?: string;
  /** Already in the order the deck prints them, coarsest first. */
  steps: string[];
}

export function Trail({ lead = "Search by Model", steps }: TrailProps) {
  return (
    <p className={styles.trail}>
      <span className={styles.lead}>{lead}:</span>{" "}
      {steps.map((step, index) => (
        <span key={`${step}-${index}`}>
          {index > 0 ? <span className={styles.sep}>&gt;</span> : null}
          <span
            className={index === steps.length - 1 ? styles.here : undefined}
          >
            {step.toUpperCase()}
          </span>
        </span>
      ))}
    </p>
  );
}
