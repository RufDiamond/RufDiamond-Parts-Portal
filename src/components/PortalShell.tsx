"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useMachine } from "@/state/MachineContext";
import type { ReactNode } from "react";
import styles from "./PortalShell.module.css";
import { SignOutButton, useCustomerSession } from "@/state/SessionBoundary";

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

/** Product line id to the rail button that represents it. */
const LINE_TO_HREF: Record<string, string> = {
  "pl-fat-truck": "/parts/fat-truck",
  "pl-ironhorse": "/parts/ironhorse",
  "pl-agilis": "/parts/agilis",
};

/**
 * A product line stays lit for everything beneath it — systems, figures and
 * the plate — not just its own landing screen. Those routes are addressed by
 * figure or system id and carry no brand in the path, so the selected
 * machine's product line is what marks them.
 */
function isActive(pathname: string, item: NavItem, lineHref: string | null): boolean {
  if (!item.href) return false;
  if (item.href === "/") return pathname === "/";
  if (pathname === item.href || pathname.startsWith(`${item.href}/`)) return true;

  const withinCatalogue =
    pathname.startsWith("/systems") || pathname.startsWith("/figures");
  return withinCatalogue && lineHref === item.href;
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
  const session = useCustomerSession();
  const pathname = usePathname() ?? "/";
  const { selectedModel } = useMachine();
  const lineHref = selectedModel
    ? (LINE_TO_HREF[selectedModel.productLineId] ?? null)
    : null;

  return (
    <div className={styles.shell}>
      {/*
        * The supplied header artwork, used as given: emblem, wordmark and
        * flag in one piece. It runs across the head of the rail and on into
        * the header, as the deck has it.
        */}
      <Link href="/" className={styles.brand} aria-label="RUF Diamond home">
        <Image
          src="/brand/header-logo.png"
          alt="RUF Diamond"
          width={900}
          height={298}
          className={styles.brandMark}
          priority
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
                    isActive(pathname, item, lineHref) ? styles.railItemActive : ""
                  }`}
                  aria-current={isActive(pathname, item, lineHref) ? "page" : undefined}
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
              src="/brand/calendar-light.png"
              alt=""
              width={200}
              height={200}
              className={styles.calendar}
            />
            <span className={styles.date}>{date}</span>
            {session?.scopes.environment === "draft" && ["publish.draft.view", "catalog.figure.view"].every(key => session.capabilities.includes(key)) && <Link href="/admin">Draft administration</Link>}
            <SignOutButton />
          </span>
        </header>

        <div
          className={`${styles.content} ${
            pathname === "/" || pathname.startsWith("/parts/")
              ? styles.contentBare
              : ""
          }`}
        >
          {children}
        </div>
      </div>
    </div>
  );
}
