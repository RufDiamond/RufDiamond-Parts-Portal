"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { Icon, type IconName } from "./Icon";
import styles from "./PortalShell.module.css";

/**
 * The portal chrome from the V2 deck: a persistent icon rail down the left,
 * and a header carrying the dealer mark, the portal title and today's date.
 *
 * Replaces the previous top-header shell. Deck geometry (slide 14, 1280x720):
 * rail 72px wide against a 1280 stage, header 90px tall, content inset to
 * x=94. Those are transposed here as a fixed rail and a fluid content column
 * rather than copied as pixels, since the deck is a 16:9 slide and this is a
 * browser.
 */

interface NavItem {
  id: string;
  icon: IconName;
  /** Two lines in the deck, e.g. "FAT TRUCK" / "PARTS". */
  label: string;
  sub?: string;
  href?: string;
  /** Opens the visitor's mail client or an external site rather than routing. */
  external?: string;
}

const NAV_GROUPS: NavItem[][] = [
  [
  { id: "home", icon: "home", label: "Home", href: "/" },
  ],
  [
  {
    id: "fat-truck",
    icon: "truck",
    label: "Fat Truck",
    sub: "Parts",
    href: "/parts/fat-truck",
  },
  {
    id: "ironhorse",
    icon: "truck-delivery",
    label: "IronHorse",
    sub: "Parts",
    href: "/parts/ironhorse",
  },
  {
    id: "agilis",
    icon: "package",
    label: "Agilis",
    sub: "Parts",
    href: "/parts/agilis",
  },
  { id: "quote", icon: "receipt", label: "Quote status", href: "/quotes" },
  {
    id: "order",
    icon: "clipboard-list",
    label: "Order status",
    href: "/orders",
  },
  ],
  [
  { id: "technical", icon: "cog", label: "Technical", sub: "info" },
  {
    id: "support",
    icon: "mail",
    label: "Support",
    external: "mailto:parts@rufdiamond.com",
  },
  {
    id: "website",
    icon: "globe",
    label: "Website",
    external: "https://www.rufdiamond.com",
  },
  ],
];

function isActive(pathname: string, item: NavItem): boolean {
  if (!item.href) return false;
  if (item.href === "/") return pathname === "/";
  return pathname === item.href || pathname.startsWith(`${item.href}/`);
}

export interface PortalShellProps {
  children: ReactNode;
  /**
   * Today, formatted, as the deck prints it top-right. Passed in from the
   * server layout rather than computed here: the server and the reader can sit
   * in different time zones, and formatting a date on both sides of hydration
   * is a mismatch waiting to happen.
   */
  date: string;
}

export function PortalShell({ children, date }: PortalShellProps) {
  const pathname = usePathname() ?? "/";

  return (
    <div className={styles.shell}>
      <nav className={styles.rail} aria-label="Portal sections">
        {NAV_GROUPS.map((group, groupIndex) => (
          <div key={groupIndex} className={styles.railGroup}>
        {group.map((item) => {
          const body = (
            <>
              <Icon name={item.icon} size="lg" className={styles.railIcon} />
              <span className={styles.railLabel}>
                {item.label}
                {item.sub ? (
                  <>
                    <br />
                    {item.sub}
                  </>
                ) : null}
              </span>
            </>
          );

          if (item.external) {
            return (
              <a
                key={item.id}
                href={item.external}
                className={styles.railItem}
                target={item.external.startsWith("http") ? "_blank" : undefined}
                rel="noreferrer"
              >
                {body}
              </a>
            );
          }

          if (!item.href) {
            // Technical info is phase two in the deck; the button is shown so
            // its absence is not mistaken for a missing feature.
            return (
              <span
                key={item.id}
                className={`${styles.railItem} ${styles.railItemPending}`}
                title="Available in a later phase"
              >
                {body}
              </span>
            );
          }

          return (
            <Link
              key={item.id}
              href={item.href}
              className={`${styles.railItem} ${
                isActive(pathname, item) ? styles.railItemActive : ""
              }`}
              aria-current={isActive(pathname, item) ? "page" : undefined}
            >
              {body}
            </Link>
          );
        })}
          </div>
        ))}
      </nav>

      <div className={styles.main}>
        <header className={styles.header}>
          <Link href="/" className={styles.brand} aria-label="RUF Diamond home">
            {/*
              * The emblem only. The supplied logo's wordmark is drawn white on
              * a white ground, so it cannot be shown on this light plate — the
              * wordmark is set as type until a usable version arrives. See
              * clients.md.
              */}
            <Image
              src="/brand/logo-mark.png"
              alt=""
              width={233}
              height={320}
              className={styles.brandMark}
              priority
            />
            <b className={styles.wordmark}>RUF DIAMOND</b>
          </Link>
          <h1 className={styles.title}>Parts &amp; Service Portal</h1>
          <span className={styles.date}>{date}</span>
        </header>

        <div className={styles.content}>{children}</div>
      </div>
    </div>
  );
}
