"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Breadcrumbs,
  EmptyState,
  Icon,
  PageHeader,
  Panel,
  QuantityStepper,
  SpecList,
  WarningPanel,
} from "@/components";
import { downloadRequestCsv } from "@/lib/csv";
import { formatAmount } from "@/lib/format";
import { useMachine } from "@/state/MachineContext";
import { useRequest } from "@/state/RequestContext";
import screen from "@/styles/screen.module.css";
import styles from "./request.module.css";

export default function RequestPage() {
  const router = useRouter();
  const { selectedModel, selectedVariant } = useMachine();
  const {
    lines,
    currency,
    itemCount,
    company,
    discountRate,
    listTotal,
    discountApplied,
    netTotal,
    updateQty,
    removeLine,
    submit,
  } = useRequest();

  const machineName = selectedModel?.name ?? "Catalogue";

  const trail = (
    <div className={screen.trail}>
      <Breadcrumbs
        items={[{ label: machineName, href: "/" }, { label: "Request list" }]}
      />
    </div>
  );

  const onSubmit = () => {
    const confirmation = submit();
    if (confirmation) router.push("/request/confirmed");
  };

  if (lines.length === 0) {
    return (
      <main className={screen.screen}>
        {trail}
        <PageHeader hasTrail eyebrow="Draft · not submitted" title="Request list" />
        <EmptyState
          icon="clipboard-list"
          eyebrow="Empty"
          title="Nothing in the request list"
          description="Tick a part on a figure's parts list to add it here. Quantities and totals update as parts are added."
          action={
            <Link
              href="/systems"
              className={`${screen.button} ${screen.buttonPrimary}`}
            >
              <Icon name="layers" size="md" />
              Browse systems
            </Link>
          }
        />
      </main>
    );
  }

  return (
    <main className={screen.screen}>
      {trail}

      <PageHeader
        hasTrail
        eyebrow="Draft · not submitted"
        title="Request list"
        meta={[
          `${lines.length} lines · Fat Truck ${machineName}`,
          selectedVariant?.label ?? "No serial range",
        ]}
        actions={
          <Link href="/" className={`${screen.button} ${screen.buttonGhost}`}>
            <Icon name="arrow-left" size="md" />
            Back to catalogue
          </Link>
        }
      />

      <div className={screen.split84}>
        <Panel
          eyebrow={`Fat Truck ${machineName} · ${selectedVariant?.label ?? ""}`}
          title="Selected parts"
          padding="none"
          frame="strong"
        >
          <div className={styles.head}>
            <span>Part no.</span>
            <span>Description</span>
            <span>Quantity</span>
            <span className={styles.right}>Line total</span>
            <span />
          </div>

          {lines.map((line) => (
            <div key={line.partId} className={styles.line}>
              <span className={styles.partNo}>{line.partNumberSnapshot}</span>
              <span className={styles.desc}>
                <span>{line.descriptionSnapshot}</span>
                <span className={styles.descNote}>
                  {formatAmount(line.unitPriceSnapshot, currency)} each
                </span>
              </span>
              <QuantityStepper
                label={`Quantity for ${line.partNumberSnapshot}`}
                value={line.qty}
                min={1}
                onChange={(qty) => updateQty(line.partId, qty)}
              />
              <span className={styles.lineTotal}>
                {formatAmount(line.lineTotal, currency)}
              </span>
              <button
                type="button"
                className={styles.remove}
                onClick={() => removeLine(line.partId)}
                aria-label={`Remove ${line.partNumberSnapshot}`}
              >
                <Icon name="trash" size="md" />
              </button>
            </div>
          ))}

          <div className={styles.tableFoot}>
            <span className={styles.footNote}>
              Prices are list prices in {currency}, excluding freight and duty.
              RufDiamond confirms availability on receipt.
            </span>
            <Link
              href="/systems"
              className={`${screen.button} ${screen.buttonGhost}`}
            >
              <Icon name="plus" size="md" />
              Add more parts
            </Link>
          </div>
        </Panel>

        <div className={styles.aside}>
          <Panel eyebrow="Live total" title="Summary" frame="strong">
            <div className={styles.summaryBody}>
              <SpecList
                items={[
                  { label: "Lines", value: String(lines.length) },
                  { label: "Pieces", value: String(itemCount) },
                  { label: "Machine", value: machineName },
                  {
                    label: "List total",
                    value: formatAmount(listTotal, currency),
                  },
                  ...(discountRate > 0
                    ? [
                        {
                          label: `Dealer discount ${(discountRate * 100).toFixed(0)}%`,
                          value: `− ${formatAmount(discountApplied, currency)}`,
                        },
                      ]
                    : []),
                ]}
              />

              <div className={styles.totalRow}>
                <span className={styles.totalLabel}>Total</span>
                <span className={styles.totalValue}>
                  {currency} {formatAmount(netTotal, currency)}
                </span>
              </div>

              <div className={styles.summaryActions}>
                <button
                  type="button"
                  className={`${screen.button} ${screen.buttonPrimary} ${screen.buttonLg} ${screen.buttonFull}`}
                  onClick={onSubmit}
                >
                  <Icon name="check" size="md" />
                  Submit to RufDiamond
                </button>
                <button
                  type="button"
                  className={`${screen.button} ${screen.buttonLg} ${screen.buttonFull}`}
                  onClick={() =>
                    downloadRequestCsv({
                      lines,
                      discountRate,
                      filename: "parts-request",
                    })
                  }
                >
                  <Icon name="download" size="md" />
                  Export as CSV
                </button>
              </div>
            </div>
          </Panel>

          <WarningPanel severity="caution" title="Check the serial">
            Parts are matched to {selectedVariant?.label ?? "the selected serial range"}.
            Numbers differ on earlier machines.
          </WarningPanel>

          {company ? null : (
            <WarningPanel severity="note" title="No account">
              List prices are shown without a dealer discount until an account
              is signed in.
            </WarningPanel>
          )}
        </div>
      </div>
    </main>
  );
}
