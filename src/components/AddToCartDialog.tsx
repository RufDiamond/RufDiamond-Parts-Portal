"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { hasAvailablePrice, quoteRequiredHref } from "@/lib/order-eligibility";
import { useEffect, useMemo, useState } from "react";
import { computeTotals, type RequestPartInput } from "@/state/RequestContext";
import { downloadRequestCsv } from "@/lib/csv";
import { formatAmount } from "@/lib/format";
import type { Currency, OrderLine } from "@/types/catalog";
import { QuantityStepper } from "./QuantityStepper";
import styles from "./AddToCartDialog.module.css";

export interface AddToCartDialogProps {
  /** The ticked parts not yet on the cart, with their suggested quantities. */
  parts: RequestPartInput[];
  currency: Currency;
  /** The account's rate, as a fraction. */
  discountRate: number;
  /** Adds the confirmed lines. Resolves true once they are on the cart. */
  onConfirm: (parts: RequestPartInput[]) => Promise<boolean>;
  onClose: () => void;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * Confirms what is about to go on the cart — the 12 Oct deck, p62–63.
 *
 * The reader can change each quantity before adding. Prices are shown before
 * tax: the province the order ships to is not known yet, and each one taxes
 * differently. Once the lines are on the cart the same box says so, with one
 * way out.
 */
export function AddToCartDialog({
  parts,
  currency,
  discountRate,
  onConfirm,
  onClose,
}: AddToCartDialogProps) {
  const router = useRouter();
  // Snapshot the parts on open, so a selection changing behind the dialog
  // does not rewrite what the reader is confirming.
  const [items] = useState(parts);
  const [qty, setQty] = useState<Record<string, number>>(() =>
    Object.fromEntries(parts.map(({ part, qty = 1 }) => [part.id, Math.max(1, qty)])),
  );
  const [status, setStatus] = useState<"confirming" | "adding" | "added">("confirming");

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" && status !== "adding") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, status]);

  const lines = useMemo<OrderLine[]>(
    () =>
      items.map(({ part, quoteNo }) => {
        const count = qty[part.id] ?? 1;
        return {
          partId: part.id,
          ...(quoteNo ? { quoteNo } : {}),
          partNumberSnapshot: part.partNumber,
          descriptionSnapshot: part.description,
          qty: count,
          ...(part.listPrice === undefined
            ? {}
            : {
                unitPriceSnapshot: part.listPrice,
                lineTotal: round2(Number(part.listPrice) * count),
              }),
        };
      }),
    [items, qty],
  );

  // Prices withheld from this account mean no money columns at all, rather
  // than columns of blanks that read as zero.
  const pricedIds = new Set(items.filter(item => hasAvailablePrice(item.part.listPrice)).map(item => item.part.id));
  const pricedLines = lines.filter(line => pricedIds.has(line.partId));
  const quoteCount = lines.length - pricedLines.length;
  const priced = pricedLines.length > 0;
  const totals = computeTotals(pricedLines, discountRate);

  const confirm = async () => {
    setStatus("adding");
    const committed = await onConfirm(
      items.map((item) => ({ ...item, qty: qty[item.part.id] ?? 1 })),
    );
    if (committed && !priced) {
      onClose();
      router.push(quoteRequiredHref);
      return;
    }
    setStatus(committed ? "added" : "confirming");
  };

  if (status === "added") {
    return (
      <div className={styles.overlay} role="dialog" aria-modal="true" aria-label="Parts Portal" onClick={onClose}>
        <div className={`${styles.panel} ${styles.done}`} onClick={(event) => event.stopPropagation()}>
          <p className={styles.doneTitle}>Parts Portal</p>
          <p className={styles.doneBody} role="status">
            Selected part(s) successfully added to order list.
            {quoteCount > 0 && " Items that need a quote are saved separately from checkout."}
          </p>
          {quoteCount > 0 && <p><Link href={quoteRequiredHref} onClick={onClose}>Request a quote for remaining items</Link></p>}
          <button type="button" className={styles.primary} onClick={onClose} autoFocus>
            OK
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      className={styles.overlay}
      role="dialog"
      aria-modal="true"
      aria-label="Confirm parts to add to the cart"
      onClick={() => { if (status !== "adding") onClose(); }}
    >
      <div className={styles.panel} onClick={(event) => event.stopPropagation()}>
        <div className={styles.actions}>
          <p className={styles.title}>Add to cart</p>
          <span className={styles.spacer} />
          <button
            type="button"
            className={styles.secondary}
            onClick={() => downloadRequestCsv({ lines: pricedLines, discountRate, filename: "cart-addition" })}
            disabled={!priced || status === "adding"}
          >
            Export to Excel
          </button>
          <button type="button" className={styles.secondary} onClick={onClose} disabled={status === "adding"}>
            Cancel
          </button>
          <button
            type="button"
            className={styles.primary}
            onClick={() => { void confirm(); }}
            disabled={status === "adding"}
          >
            {status === "adding" ? "Adding…" : priced ? "Add to cart" : "Request a quote"}
          </button>
        </div>

        <div className={styles.scroll}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th scope="col">Part no.</th>
                <th scope="col">Part name</th>
                <th scope="col">Confirm qty.</th>
                {priced ? (
                  <>
                    <th scope="col" className={styles.money}>Unit price ({currency})</th>
                    <th scope="col" className={styles.money}>Subtotal ({currency})</th>
                  </>
                ) : null}
              </tr>
            </thead>
            <tbody>
              {lines.map((line) => (
                <tr key={line.partId} data-quote-required={!pricedIds.has(line.partId) || undefined}>
                  <td className={styles.mono}>{line.partNumberSnapshot}</td>
                  <td>{line.descriptionSnapshot}{!pricedIds.has(line.partId) && <span className={styles.quoteRequired}>Quote required</span>}</td>
                  <td className={styles.qty}>
                    <QuantityStepper
                      value={line.qty}
                      min={1}
                      onChange={(next) => setQty((current) => ({ ...current, [line.partId]: next }))}
                      disabled={status === "adding"}
                      label={`Quantity for ${line.partNumberSnapshot}`}
                    />
                  </td>
                  {priced ? (
                    <>
                      <td className={styles.money}>{pricedIds.has(line.partId) ? formatAmount(line.unitPriceSnapshot, currency) : "—"}</td>
                      <td className={styles.money}>{pricedIds.has(line.partId) ? formatAmount(line.lineTotal, currency) : "—"}</td>
                    </>
                  ) : null}
                </tr>
              ))}
            </tbody>
            {priced ? (
              <tfoot>
                {/* Individual customers have no discount, so no discount line (14 Oct). */}
                {totals.discountApplied ? (
                  <>
                    <tr>
                      <th scope="row" colSpan={4}>Subtotal ({currency})</th>
                      <td className={styles.money}>{formatAmount(totals.listTotal, currency)}</td>
                    </tr>
                    <tr>
                      <th scope="row" colSpan={4}>Discount</th>
                      <td className={styles.money}>{formatAmount(totals.discountApplied, currency)}</td>
                    </tr>
                  </>
                ) : null}
                <tr className={styles.total}>
                  <th scope="row" colSpan={4}>Total</th>
                  <td className={styles.money}>{formatAmount(totals.netTotal, currency)}</td>
                </tr>
              </tfoot>
            ) : null}
          </table>
        </div>

        {quoteCount > 0 && <p className={styles.note}>Items marked Quote required stay in your request list and are excluded from checkout.</p>}
        {priced && <p className={styles.note}>Prices exclude taxes, which depend on the province the order ships to.</p>}
      </div>
    </div>
  );
}
