import Link from "next/link";
import type { ReactNode } from "react";
import styles from "./admin.module.css";

export interface RecordField {
  label: string;
  value: string;
}

/** Nav rail entries. `href` is set only where the screen has been built. */
const NAV: { id: string; label: string; count: string | null; href?: string }[] =
  [
    { id: "catalog", label: "Catalog", count: null, href: "/admin" },
    { id: "models", label: "Models", count: null },
    { id: "figures", label: "Figures", count: null },
    { id: "parts", label: "Parts", count: null },
    { id: "orders", label: "Orders", count: "5" },
    { id: "publish", label: "Publishing", count: null },
  ];

export interface AdminShellProps {
  /** Which nav entry is lit. */
  active: string;
  title: string;
  actions?: ReactNode;
  /** The five cells of the bottom record bar. */
  record: RecordField[];
  operator: string;
  children: ReactNode;
}

/**
 * Admin chrome: a persistent nav rail on the left and a record bar pinned to
 * the foot of the content column. Deliberately not the customer shell — no
 * machine chip, no request list, no title block.
 */
export function AdminShell({
  active,
  title,
  actions,
  record,
  operator,
  children,
}: AdminShellProps) {
  return (
    <div className={styles.page}>
      <div className={styles.console}>
        <aside className={styles.rail}>
          <div className={styles.railHead}>
            <b className={styles.wordmark}>RUF DIAMOND</b>
            <span className={styles.railSub}>Catalog admin</span>
          </div>

          <nav className={styles.nav}>
            {NAV.map((item) => {
              const isActive = item.id === active;
              const body = (
                <>
                  <span>{item.label}</span>
                  {item.count ? (
                    <span className={styles.navCount}>{item.count}</span>
                  ) : null}
                </>
              );

              if (isActive) {
                return (
                  <span
                    key={item.id}
                    className={`${styles.navItem} ${styles.navItemActive}`}
                    aria-current="page"
                  >
                    {body}
                  </span>
                );
              }

              if (item.href) {
                return (
                  <Link
                    key={item.id}
                    href={item.href}
                    className={styles.navItem}
                  >
                    {body}
                  </Link>
                );
              }

              return (
                <button
                  key={item.id}
                  type="button"
                  className={`${styles.navItem} ${styles.navItemPending}`}
                  aria-disabled
                  disabled
                  title="Not built yet"
                >
                  {body}
                </button>
              );
            })}
          </nav>

          <div className={styles.railFoot}>
            Signed in as {operator}
            <br />
            Parts &amp; service
          </div>
        </aside>

        <div className={styles.content}>
          <div className={styles.screen}>
            <div className={styles.screenHead}>
              <h2 className={styles.screenTitle}>{title}</h2>
              {actions ? (
                <div className={styles.screenActions}>{actions}</div>
              ) : null}
            </div>
            <div className={styles.body}>{children}</div>
          </div>

          <dl className={styles.recordBar}>
            {record.map((field) => (
              <div key={field.label} className={styles.recordCell}>
                <dt className={styles.recordLabel}>{field.label}</dt>
                <dd className={styles.recordValue}>{field.value}</dd>
              </div>
            ))}
          </dl>
        </div>
      </div>
    </div>
  );
}
