"use client";

import Link from "next/link";
import { EmptyState } from "@/components";
import { useRequest } from "@/state/RequestContext";
import type { PartUsageSummary } from "@/types/catalog";
import { QuoteDocument } from "./QuoteDocument";
import styles from "./confirmed.module.css";

export interface ConfirmedProps {
  usage: Record<string, PartUsageSummary>;
}

/**
 * The two Quote Request documents — slide 53.
 *
 * Submitting generates two documents carrying the same parts and the same
 * sequential number: one for the factory, one for the dealer. They are shown
 * together here because they are produced together; the deck has them sent
 * simultaneously, which is a backend job once there is one.
 */
export function Confirmed({ usage }: ConfirmedProps) {
  const { lastConfirmation, confirmationHydrated } = useRequest();

  if (!confirmationHydrated) {
    return <p className={styles.loading}>Loading…</p>;
  }

  if (!lastConfirmation) {
    return (
      <div className={styles.screen}>
        <div className={styles.bar}>
          <span className={styles.title}>Quote request</span>
        </div>
        <div className={styles.surface}>
          <EmptyState
            icon="clipboard-list"
            eyebrow="Empty"
            title="No recent request"
            description="Submitted requests appear here for the rest of the session."
            action={
              <Link href="/request" className={styles.action}>
                Go to the request list
              </Link>
            }
          />
        </div>
      </div>
    );
  }

  const { reference, lines } = lastConfirmation;

  return (
    <div className={styles.screen}>
      <div className={styles.bar}>
        <span className={styles.title}>Quote request {reference}</span>
        <span className={styles.count}>
          {lines.length} {lines.length === 1 ? "part" : "parts"} · two documents
          generated
        </span>
      </div>

      <p className={styles.lead}>
        Two documents carry this request, both under the same number. One goes
        to the factory, one to the dealer.
      </p>

      <div className={styles.documents}>
        <section className={styles.column}>
          <h2 className={styles.columnTitle}>Sent to the factory</h2>
          <QuoteDocument
            variant="factory"
            confirmation={lastConfirmation}
            usage={usage}
          />
        </section>

        <section className={styles.column}>
          <h2 className={styles.columnTitle}>Sent to RUF Diamond</h2>
          <QuoteDocument
            variant="customer"
            confirmation={lastConfirmation}
            usage={usage}
          />
        </section>
      </div>

      <div className={styles.actions}>
        <Link href="/systems" className={styles.primary}>
          Start a new request
        </Link>
      </div>
    </div>
  );
}
