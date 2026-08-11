"use client";

import Link from "next/link";
import {
  Breadcrumbs,
  EmptyState,
  Icon,
  PageHeader,
  Panel,
  SpecList,
  WarningPanel,
} from "@/components";
import { downloadRequestCsv } from "@/lib/csv";
import { formatAmount } from "@/lib/format";
import { useMachine } from "@/state/MachineContext";
import { useRequest } from "@/state/RequestContext";
import screen from "@/styles/screen.module.css";
import styles from "./confirmed.module.css";

export default function ConfirmedPage() {
  const { selectedModel, selectedVariant } = useMachine();
  const { lastConfirmation, confirmationHydrated } = useRequest();

  const machineName = selectedModel?.name ?? "Catalogue";
  const trail = (
    <div className={screen.trail}>
      <Breadcrumbs
        items={[
          { label: machineName, href: "/" },
          { label: "Request list", href: "/request" },
          { label: "Submitted" },
        ]}
      />
    </div>
  );

  if (!confirmationHydrated) {
    return (
      <main className={screen.screen}>
        <p className={screen.loading}>Loading…</p>
      </main>
    );
  }

  if (!lastConfirmation) {
    return (
      <main className={screen.screen}>
        {trail}
        <PageHeader hasTrail eyebrow="Parts request" title="Nothing submitted" />
        <EmptyState
          icon="clipboard-list"
          eyebrow="Empty"
          title="No recent request"
          description="Submitted requests appear here for the rest of the session."
          action={
            <Link
              href="/request"
              className={`${screen.button} ${screen.buttonPrimary}`}
            >
              Go to request list
            </Link>
          }
        />
      </main>
    );
  }

  const {
    reference,
    submittedAt,
    lines,
    totals,
    discountRate,
    companyName,
    currency,
  } = lastConfirmation;

  // Local date, not UTC — an evening submission must not read as tomorrow.
  const submittedDate = new Date(submittedAt).toLocaleDateString("en-CA");

  return (
    <main className={screen.screen}>
      {trail}

      <PageHeader
        hasTrail
        eyebrow="Submitted to RufDiamond"
        title={`Request ${reference}`}
        meta={[`Submitted ${submittedDate} · ${lines.length} lines`]}
        actions={
          <>
            <button
              type="button"
              className={screen.button}
              onClick={() =>
                downloadRequestCsv({ lines, discountRate, filename: reference })
              }
            >
              <Icon name="download" size="md" />
              Download copy
            </button>
            <Link
              href="/systems"
              className={`${screen.button} ${screen.buttonPrimary}`}
            >
              <Icon name="plus" size="md" />
              Start a new request
            </Link>
          </>
        }
      />

      <div className={screen.split84}>
        <Panel
          eyebrow="What was sent"
          title="Request lines"
          padding="none"
          frame="strong"
        >
          <div className={styles.head}>
            <span>Part no.</span>
            <span>Description</span>
            <span className={styles.right}>Qty</span>
            <span className={styles.right}>Line total</span>
          </div>

          {lines.map((line) => (
            <div key={line.partId} className={styles.line}>
              <span className={styles.mono}>{line.partNumberSnapshot}</span>
              <span>{line.descriptionSnapshot}</span>
              <span className={`${styles.mono} ${styles.right}`}>
                {line.qty}
              </span>
              <span className={`${styles.mono} ${styles.right}`}>
                {formatAmount(line.lineTotal, currency)}
              </span>
            </div>
          ))}

          <div className={styles.totalBar}>
            <span className={styles.totalLabel}>Total submitted</span>
            <span className={styles.totalValue}>
              {currency} {formatAmount(totals.netTotal, currency)}
            </span>
          </div>
        </Panel>

        <div className={styles.aside}>
          <Panel eyebrow="Record" title="Submission" frame="strong">
            <SpecList
              items={[
                { label: "Request", value: reference },
                ...(discountRate > 0
                  ? [
                      {
                        label: "Dealer discount",
                        value: `${(discountRate * 100).toFixed(0)}%`,
                      },
                    ]
                  : []),
                { label: "List total", value: formatAmount(totals.listTotal, currency) },
                { label: "Submitted", value: submittedDate },
                { label: "Account", value: companyName ?? "—" },
                { label: "Machine", value: `Fat Truck ${machineName}` },
                {
                  label: "Serial range",
                  value: selectedVariant?.label ?? "—",
                },
                { label: "State", value: "Awaiting confirmation" },
              ]}
            />
          </Panel>

          <WarningPanel severity="note" title="Next step">
            RufDiamond confirms availability and freight within one business
            day. Quote {reference} on all correspondence.
          </WarningPanel>
        </div>
      </div>
    </main>
  );
}
