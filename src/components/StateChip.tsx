import styles from "./StateChip.module.css";

export type StateChipTone = "neutral" | "muted" | "strong";

export interface StateChipProps {
  label: string;
  /** neutral: outlined. muted: recessed. strong: inverted. */
  tone?: StateChipTone;
  title?: string;
}

/**
 * A small status marker. Monochrome by design — meaning comes from the word,
 * not from colour, so the tone only shifts contrast.
 */
export function StateChip({ label, tone = "neutral", title }: StateChipProps) {
  return (
    <span className={`${styles.chip} ${styles[tone]}`} title={title}>
      {label}
    </span>
  );
}
