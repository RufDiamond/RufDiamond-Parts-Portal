"use client";

import Link from "next/link";
import { Icon, Panel } from "@/components";
import { formatFigureRef } from "@/lib/format";
import { useRecentlyViewed } from "@/state/useRecentlyViewed";
import screen from "@/styles/screen.module.css";
import styles from "./home.module.css";

export function RecentlyViewed() {
  const { items, hydrated } = useRecentlyViewed();

  // Nothing before the read lands, and no heading worth the space if the
  // session has not opened a figure yet.
  if (!hydrated || items.length === 0) return null;

  return (
    <div className={screen.section}>
      <Panel eyebrow="This machine" title="Recently viewed" padding="none">
        <ul className={styles.rowList}>
          {items.map((item) => (
            <li key={item.figureId}>
              <Link href={`/figures/${item.figureId}`} className={styles.row}>
                <span className={styles.rowRef}>
                  {formatFigureRef(item.groupNo)}
                </span>
                <span className={styles.rowLabel}>{item.figureName}</span>
                <span className={styles.rowWhere}>{item.systemName}</span>
                <Icon
                  name="chevron-right"
                  size="md"
                  className={styles.rowChevron}
                />
              </Link>
            </li>
          ))}
        </ul>
      </Panel>
    </div>
  );
}
