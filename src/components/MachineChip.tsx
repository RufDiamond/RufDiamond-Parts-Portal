"use client";

import styles from "./MachineChip.module.css";

export interface MachineChipProps {
  /** Model name, e.g. "FT3 Wagon". */
  name: string;
  /** Serial range as printed, e.g. "SERIAL NUMBER 99FT3WXXXXXX and up". */
  serial?: string;
  manufacturer?: string;
  /** Renders a clear button when provided. */
  onDismiss?: () => void;
}

/**
 * The machine currently in context. Sits in the header of every catalogue
 * screen so the reader always knows which serial range they are looking at.
 */
export function MachineChip({
  name,
  serial,
  manufacturer,
  onDismiss,
}: MachineChipProps) {
  return (
    <div className={styles.chip}>
      <div className={styles.identity}>
        {manufacturer ? (
          <span className={styles.manufacturer}>{manufacturer}</span>
        ) : null}
        <span className={styles.name}>{name}</span>
      </div>
      {serial ? <span className={styles.serial}>{serial}</span> : null}
      {onDismiss ? (
        <button
          type="button"
          className={styles.dismiss}
          onClick={onDismiss}
          aria-label={`Clear ${name}`}
        >
          &times;
        </button>
      ) : null}
    </div>
  );
}
