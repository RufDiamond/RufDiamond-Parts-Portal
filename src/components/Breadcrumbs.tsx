import styles from "./Breadcrumbs.module.css";

export interface Crumb {
  label: string;
  /** Omit on the final crumb — the current location is not a link. */
  href?: string;
}

export interface BreadcrumbsProps {
  items: Crumb[];
}

/**
 * Catalogue trail: product line / model / variant / system / figure.
 *
 * Uses plain anchors rather than `next/link` because no routes exist yet and
 * typed routes would reject the string hrefs. Swap the `<a>` for `<Link>` once
 * the route tree is in place — the props do not change.
 */
export function Breadcrumbs({ items }: BreadcrumbsProps) {
  return (
    <nav aria-label="Breadcrumb" className={styles.nav}>
      <ol className={styles.list}>
        {items.map((item, index) => {
          const isLast = index === items.length - 1;

          return (
            <li key={`${item.label}-${index}`} className={styles.item}>
              {item.href && !isLast ? (
                <a href={item.href} className={styles.link}>
                  {item.label}
                </a>
              ) : (
                <span
                  className={styles.current}
                  aria-current={isLast ? "page" : undefined}
                >
                  {item.label}
                </span>
              )}
              {isLast ? null : (
                <span aria-hidden="true" className={styles.separator}>
                  /
                </span>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
