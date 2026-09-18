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

/** Customer copy of the quote request. Internal routing is not a customer action. */
export function Confirmed({ usage }: ConfirmedProps) {
  const { lastConfirmation, confirmationHydrated, submissionAvailable } = useRequest();
  if (!submissionAvailable) return <main><h1>Quote submission unavailable</h1><p>The request service is not connected. No request has been submitted.</p><Link href="/request">Return to saved parts</Link></main>;

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
          {lines.length} {lines.length === 1 ? "part" : "parts"}
        </span>
      </div>

      <p className={styles.lead}>
        Your quote request copy. Pricing and availability will be confirmed by RUF Diamond.
        To save a PDF, choose Save as PDF in the print dialog.
      </p>

      <div className={styles.documents}>
        <section className={styles.column}>
          <h2 className={styles.columnTitle}>Your request</h2>
          <QuoteDocument
            variant="factory"
            confirmation={lastConfirmation}
            usage={usage}
          />
        </section>
      </div>

      <div className={styles.actions}>
        <button type="button" className={styles.primary} onClick={() => window.print()}>Print</button>
        <button type="button" className={styles.primary} onClick={() => window.print()}>Save PDF</button>
        <Link href="/systems" className={styles.primary}>
          Start a new request
        </Link>
      </div>
    </div>
  );
}
