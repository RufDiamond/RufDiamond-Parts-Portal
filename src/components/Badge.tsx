import styles from "./Badge.module.css";

export type BadgeVariant = "solid" | "outline" | "quiet" | "hatched";

export interface BadgeProps {
  children: string;
  variant?: BadgeVariant;
  title?: string;
}

/**
 * A state marker. Monochrome by mandate: meaning comes from the word, and
 * differentiation from fill and rule rather than hue.
 */
export function Badge({ children, variant = "outline", title }: BadgeProps) {
  return (
    <span className={`${styles.badge} ${styles[variant]}`} title={title}>
      {children}
    </span>
  );
}
