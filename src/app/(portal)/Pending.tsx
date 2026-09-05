import styles from "./pending.module.css";

/**
 * A section the V2 deck names in the navigation but does not draw. Shown
 * rather than hidden so the gap is visible and traceable to `clients.md`.
 */
export function Pending({
  eyebrow,
  title,
  children,
}: {
  eyebrow: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className={styles.pending}>
      <p className={styles.eyebrow}>{eyebrow}</p>
      <h2 className={styles.title}>{title}</h2>
      <p className={styles.body}>{children}</p>
    </section>
  );
}
