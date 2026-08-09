"use client";

import { useState } from "react";
import styles from "./QuantityStepper.module.css";

export interface QuantityStepperProps {
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
  disabled?: boolean;
  /** Accessible name, e.g. "Quantity for 36-00304". */
  label: string;
}

/** Order quantity control. Figures are mono and tabular so columns stay aligned. */
export function QuantityStepper({
  value,
  onChange,
  min = 0,
  max = 999,
  step = 1,
  disabled = false,
  label,
}: QuantityStepperProps) {
  // Free text while typing, so the field can pass through an empty state
  // without the value snapping back to the clamped number on every keystroke.
  const [draft, setDraft] = useState(String(value));

  // Resync during render when the value changes underneath us — cheaper and
  // flicker-free compared with doing it in an effect.
  const [lastValue, setLastValue] = useState(value);
  if (value !== lastValue) {
    setLastValue(value);
    setDraft(String(value));
  }

  const clamp = (next: number) => Math.min(max, Math.max(min, next));

  const commit = (raw: string) => {
    const parsed = Number.parseInt(raw, 10);
    const next = Number.isNaN(parsed) ? min : clamp(parsed);
    setDraft(String(next));
    if (next !== value) onChange(next);
  };

  return (
    <div className={styles.stepper} data-disabled={disabled || undefined}>
      <button
        type="button"
        className={styles.button}
        onClick={() => onChange(clamp(value - step))}
        disabled={disabled || value <= min}
        aria-label={`Decrease ${label}`}
      >
        &minus;
      </button>
      <input
        className={styles.input}
        type="text"
        inputMode="numeric"
        autoComplete="off"
        aria-label={label}
        value={draft}
        disabled={disabled}
        onChange={(event) => setDraft(event.target.value.replace(/[^\d]/g, ""))}
        onBlur={(event) => commit(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter") commit(event.currentTarget.value);
        }}
      />
      <button
        type="button"
        className={styles.button}
        onClick={() => onChange(clamp(value + step))}
        disabled={disabled || value >= max}
        aria-label={`Increase ${label}`}
      >
        +
      </button>
    </div>
  );
}
