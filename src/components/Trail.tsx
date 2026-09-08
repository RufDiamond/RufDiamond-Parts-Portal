import Link from "next/link";
import styles from "./Trail.module.css";

/**
 * The breadcrumb bar the deck puts at the top of every catalogue screen:
 *
 *   Search by Model: FAT TRUCK FT3 WAGON > 1 FILTERS > FILTERS
 *
 * Every step but the last is a link back up the catalogue; the last step is
 * the screen you are on and is not a link.
 */
export interface TrailStep {
  label: string;
  /** Omitted on the step you are already looking at. */
  href?: string;
}

export interface TrailProps {
  /** "Search by Model", "Search by Part Number", "Search by Description". */
  lead?: string;
  /** Coarsest first, in the order the deck prints them. */
  steps: TrailStep[];
}

export function Trail({ lead = "Search by Model", steps }: TrailProps) {
  return (
    <nav className={styles.trail} aria-label="Breadcrumb">
      <span className={styles.lead}>{lead}:</span>{" "}
      {steps.map((step, index) => {
        const last = index === steps.length - 1;
        const text = step.label.toUpperCase();
        return (
          <span key={`${step.label}-${index}`}>
            {index > 0 ? <span className={styles.sep}>&gt;</span> : null}
            {step.href && !last ? (
              <Link href={step.href} className={styles.step}>
                {text}
              </Link>
            ) : (
              <span className={styles.here} aria-current={last ? "page" : undefined}>
                {text}
              </span>
            )}
          </span>
        );
      })}
    </nav>
  );
}
