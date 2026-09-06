"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import styles from "./PortalShell.module.css";

/**
 * The portal chrome from the V2 deck: an icon rail down the left and a header
 * carrying the RUF Diamond mark, the portal title and today's date.
 *
 * The rail's buttons sit on three rounded white cards, grouped as the deck
 * groups them — Home; the three product lines with quote and order status;
 * then the utilities. Icons are the deck's own artwork, which is photographic
 * for the product lines rather than line art.
 */

interface NavItem {
  id: string;
  icon: string;
  /** Wraps to two lines in the deck, e.g. "FAT TRUCK" / "PARTS". */
  label: string;
  href?: string;
  /** Opens the visitor's mail client or an external site rather than routing. */
  external?: string;
  /** Drawn wide rather than square. */
  wide?: boolean;
}

const NAV_GROUPS: NavItem[][] = [
  [{ id: "home", icon: "home", label: "Home", href: "/" }],
  [
    {
      id: "fat-truck",
      icon: "fat-truck",
      label: "Fat Truck Parts",
      href: "/parts/fat-truck",
      wide: true,
    },
    {
      id: "ironhorse",
      icon: "ironhorse",
      label: "IronHorse Parts",
      href: "/parts/ironhorse",
    },
    {
      id: "agilis",
      icon: "agilis",
      label: "Agilis Parts",
      href: "/parts/agilis",
      wide: true,
    },
    {
      id: "quote",
      icon: "quote-status",
      label: "Quote Status",
      href: "/quotes",
    },
    {
      id: "order",
      icon: "order-status",
      label: "Order Status",
      href: "/orders",
    },
  ],
  [
    { id: "technical", icon: "technical", label: "Technical Info" },
    {
      id: "support",
      icon: "support",
      label: "Support",
      external: "mailto:parts@rufdiamond.com",
    },
    {
      id: "website",
      icon: "website",
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
   * Today, formatted, as the deck prints it top right. Passed in from the
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
      {/*
        * The mark runs across the head of the rail and on into the header, as
        * the deck has it. The emblem is the supplied artwork inverted so it
        * reads on the dark ground; the wordmark is set as type because the
        * supplied file's wordmark is white on a white ground and did not
        * survive — see clients.md.
        */}
      <Link href="/" className={styles.brand} aria-label="RUF Diamond home">
        <Image
          src="/brand/logo-mark-dark.png"
          alt=""
          width={306}
          height={420}
          className={styles.brandMark}
          priority
        />
        <span className={styles.wordmark}>
          <b>RUF</b>
          <b>DIAMOND</b>
        </span>
        <Image
          src="/brand/flag-ca.jpg"
          alt="Canada"
          width={60}
          height={60}
          className={styles.flag}
        />
      </Link>

      <nav className={styles.rail} aria-label="Portal sections">
        {NAV_GROUPS.map((group, index) => (
          <div key={index} className={styles.railGroup}>
            {group.map((item) => {
              const body = (
                <>
                  <span className={styles.railIconBox}>
                    <Image
                      src={`/nav/${item.icon}.png`}
                      alt=""
                      width={120}
                      height={120}
                      className={`${styles.railIcon} ${
                        item.wide ? styles.railIconWide : ""
                      }`}
                    />
                  </span>
                  <span className={styles.railLabel}>{item.label}</span>
                </>
              );

              if (item.external) {
                return (
                  <a
                    key={item.id}
                    href={item.external}
                    className={styles.railItem}
                    target={
                      item.external.startsWith("http") ? "_blank" : undefined
                    }
                    rel="noreferrer"
                  >
                    {body}
                  </a>
                );
              }

              if (!item.href) {
                // Technical info is phase two in the deck. The button is shown
                // so its absence is not mistaken for a missing feature.
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
          <h1 className={styles.title}>Parts &amp; Service Portal</h1>

          <span className={styles.dateBlock}>
            <Image
              src="/brand/calendar.png"
              alt=""
              width={200}
              height={200}
              className={styles.calendar}
            />
            <span className={styles.date}>{date}</span>
          </span>
        </header>

        <div
          className={`${styles.content} ${
            pathname === "/" ? styles.contentBare : ""
          }`}
        >
          {children}
        </div>
      </div>
    </div>
  );
}
