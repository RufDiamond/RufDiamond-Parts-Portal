"use client";

import Image from "next/image";
import Link from "next/link";
import { useMemo, useState } from "react";
import { AddToCartDialog, CheckCart, EmptyState } from "@/components";
import { downloadCsv } from "@/lib/adminCsv";
import { formatAmount } from "@/lib/format";
import { PRICE_VALIDITY_DAYS } from "@/lib/quote-status";
import { useRequest, type RequestPartInput } from "@/state/RequestContext";
import { useRequestAddition } from "@/state/useRequestAddition";
import type { Part } from "@/types/catalog";
import type { Availability, CustomerQuoteLine } from "@/types/quotes";
import styles from "./quotes.module.css";

const PAGE_SIZE = 15;
const NONE = "—";

const AVAILABLE: Record<Availability, string> = { yes: "Yes", partial: "Partial", no: "No" };

/** "11-Jun-2026", as the deck prints dates. */
function formatDate(iso: string | null): string {
  if (!iso) return NONE;
  const date = new Date(`${iso}T00:00:00Z`);
  const month = date.toLocaleString("en-CA", { month: "short", timeZone: "UTC" });
  return `${String(date.getUTCDate()).padStart(2, "0")}-${month}-${date.getUTCFullYear()}`;
}

/** Cart identity for a quoted line, kept apart from the catalogue part at list price. */
const cartId = (line: CustomerQuoteLine) => `quote:${line.id}`;

function toCartPart(line: CustomerQuoteLine): RequestPartInput {
  const order = line.orderable!;
  const part: Part = {
    id: cartId(line),
    partNumber: order.partNumber,
    description: order.description,
    manufacturer: null,
    listPrice: order.unitPrice,
    currency: "CAD",
    status: "active",
    supersededByPartId: null,
    requires: [],
  };
  return { part, qty: order.qty, quoteNo: line.quoteNo };
}

function toCsv(lines: CustomerQuoteLine[]): string {
  const quote = (value: string | number | null) => `"${String(value ?? "").replace(/"/g, '""')}"`;
  const head = ["Date Request", "Quote No.", "Customer", "User", "Part No.", "Description", "Qty", "Available",
    "Est. Availability", "New Part No.", "New Description", "New Qty", "Unit Price (CAD)", "Total Price (CAD)", "Comments"];
  return [head, ...lines.map((line) => [
    line.requestDate, line.quoteNo, line.customer, line.user, line.partNumber, line.description, line.qty,
    line.response?.available ? AVAILABLE[line.response.available] : "", line.response?.estAvailability ?? "",
    line.response?.newPartNumber ?? "", line.response?.newDescription ?? "", line.response?.newQty ?? "",
    line.response?.unitPrice ?? "", line.response?.totalPrice ?? "", line.response?.comments ?? "",
  ])].map((row) => row.map(quote).join(",")).join("\n");
}

/**
 * The customer's Quote Status — 12 Oct deck, p59.
 *
 * Every line the account has asked a quote for, newest request first, with
 * what RUF Diamond has answered. Lines that can be ordered as quoted are ticked
 * and added to the cart at the quoted price; the record stays here either way.
 */
export function QuoteStatus({ lines }: { lines: CustomerQuoteLine[] }) {
  const { lines: cart, currency, discountRate } = useRequest();
  const addition = useRequestAddition("quote-status");

  const pages = Math.max(1, Math.ceil(lines.length / PAGE_SIZE));
  const [page, setPage] = useState(0);
  const visible = lines.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  const onCart = useMemo(() => new Set(cart.map((line) => line.partId)), [cart]);
  const [ticked, setTicked] = useState<ReadonlySet<string>>(new Set());
  const toggle = (id: string) =>
    setTicked((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  /** Ticked lines that can be ordered and are not already on the cart. */
  const toAdd = lines.filter((line) => ticked.has(line.id) && line.orderable && !onCart.has(cartId(line)));
  const [confirming, setConfirming] = useState<RequestPartInput[] | null>(null);

  const email = () => {
    const chosen = lines.filter((line) => ticked.has(line.id));
    const body = [
      "Quote status",
      "",
      "Quote no.\tPart no.\tDescription\tQty\tAvailable\tUnit price (CAD)",
      ...(chosen.length ? chosen : lines).map((line) =>
        [line.quoteNo, line.response?.newPartNumber ?? line.partNumber, line.response?.newDescription ?? line.description,
          line.response?.newQty ?? line.qty, line.response?.available ? AVAILABLE[line.response.available] : "Awaiting response",
          line.response?.unitPrice ?? ""].join("\t")),
    ].join("\n");
    window.location.href = `mailto:?subject=${encodeURIComponent("Quote status")}&body=${encodeURIComponent(body)}`;
  };

  return (
    <div className={styles.screen}>
      <div className={styles.bar}>
        <h1 className={styles.title}>Quote Status</h1>
        <span className={styles.spacer} />
        <nav className={styles.pager} aria-label="Pages">
          <button type="button" className={styles.button} onClick={() => setPage(0)} disabled={page === 0} aria-label="First page">«</button>
          <button type="button" className={styles.button} onClick={() => setPage(page - 1)} disabled={page === 0} aria-label="Previous page">‹</button>
          <span className={styles.pageOf}>{page + 1} of {pages}</span>
          <button type="button" className={styles.button} onClick={() => setPage(page + 1)} disabled={page >= pages - 1} aria-label="Next page">›</button>
          <button type="button" className={styles.button} onClick={() => setPage(pages - 1)} disabled={page >= pages - 1} aria-label="Last page">»</button>
        </nav>
        <button type="button" className={styles.button} onClick={() => downloadCsv("quote-status", toCsv(lines))} disabled={lines.length === 0}>
          Export to Excel
        </button>
        <button type="button" className={styles.button} onClick={email} disabled={lines.length === 0}>
          <Image src="/toolbar/email.png" alt="" width={40} height={28} className={styles.buttonIcon} />
          Email
        </button>
        <button type="button" className={styles.button} onClick={() => window.print()}>
          <Image src="/toolbar/print.png" alt="" width={40} height={40} className={styles.buttonIcon} />
          Print
        </button>
        <Link href="/" className={`${styles.button} ${styles.home}`}>Home</Link>
      </div>

      <div className={styles.surface}>
        <p className={styles.notice}>
          <strong>Price Validity Notice:</strong> All prices provided or updated through this portal are valid for{" "}
          <strong>{PRICE_VALIDITY_DAYS} calendar days from the date the quotation request was submitted (Date Request)</strong>.
          After this period, prices and availability may be subject to change and should be reconfirmed before placing an order.
        </p>

        {addition.error ? <p role="alert" className={styles.error}>{addition.error}</p> : null}

        {lines.length === 0 ? (
          <EmptyState title="No quote requests yet" description="Quote requests you submit will be listed here with RUF Diamond's response." />
        ) : (
          <div className={styles.scroller}>
            <table className={styles.table}>
              <thead className={styles.head}>
                <tr>
                  <th scope="col">Select</th>
                  <th scope="col">Date Request</th>
                  <th scope="col">Quote No.</th>
                  <th scope="col">Customer</th>
                  <th scope="col">User</th>
                  <th scope="col">Part No.</th>
                  <th scope="col">Description</th>
                  <th scope="col">Qty</th>
                  <th scope="col">Available</th>
                  <th scope="col">Est. Availability</th>
                  <th scope="col">New Part No.</th>
                  <th scope="col">New Description</th>
                  <th scope="col">New Qty</th>
                  <th scope="col">Unit Price ({currency})</th>
                  <th scope="col">Total Price ({currency})</th>
                  <th scope="col">Comments</th>
                  <th scope="col">Add to Cart?</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((line) => {
                  const response = line.response;
                  const added = onCart.has(cartId(line));
                  return (
                    <tr key={line.id} className={styles.row} data-available={response?.available ?? undefined}>
                      <td className={styles.tick}>
                        <input
                          type="checkbox"
                          className={styles.checkbox}
                          checked={ticked.has(line.id) || added}
                          disabled={!line.orderable || added}
                          onChange={() => toggle(line.id)}
                          aria-label={`Select ${line.response?.newPartNumber ?? line.partNumber ?? "line"} from ${line.quoteNo}`}
                          title={
                            added ? "Already on the cart"
                              : line.expired ? "This price has expired — request a new quote"
                                : !response ? "Awaiting RUF Diamond's response"
                                  : !line.orderable ? "This line cannot be ordered as quoted" : undefined
                          }
                        />
                      </td>
                      <td className={styles.mono}>{formatDate(line.requestDate)}</td>
                      <td className={styles.mono}>{line.quoteNo}</td>
                      <td>{line.customer}</td>
                      <td>{line.user}</td>
                      <td className={styles.mono}>{line.partNumber ?? NONE}</td>
                      <td className={styles.text}>{line.description ?? NONE}</td>
                      <td className={styles.num}>{line.qty ?? NONE}</td>
                      {response ? (
                        <>
                          <td className={styles.center}>{response.available ? AVAILABLE[response.available] : NONE}</td>
                          <td className={styles.mono}>{formatDate(response.estAvailability)}</td>
                          <td className={styles.mono}>{response.newPartNumber ?? NONE}</td>
                          <td className={styles.text}>{response.newDescription ?? NONE}</td>
                          <td className={styles.num}>{response.newQty ?? NONE}</td>
                          <td className={styles.money}>{response.unitPrice ? `$${formatAmount(response.unitPrice, "CAD")}` : NONE}</td>
                          <td className={styles.money}>{response.totalPrice ? `$${formatAmount(response.totalPrice, "CAD")}` : NONE}</td>
                          <td className={styles.text}>{response.comments}</td>
                        </>
                      ) : (
                        <td colSpan={8} className={styles.awaiting}>Awaiting RUF Diamond&rsquo;s response</td>
                      )}
                      <td className={styles.center}>
                        {added ? "Yes" : line.expired && response ? "Expired" : response ? "No" : NONE}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        <div className={styles.actions}>
          <button
            type="button"
            className={styles.button}
            onClick={() => setConfirming(toAdd.map(toCartPart))}
            disabled={addition.pending || toAdd.length === 0}
            title={toAdd.length === 0 ? "Tick a quoted line first" : `Add ${toAdd.length} quoted line${toAdd.length === 1 ? "" : "s"} to the cart`}
          >
            <Image src="/toolbar/cart-add.png" alt="" width={40} height={40} className={styles.buttonIcon} />
            Add to cart{toAdd.length > 0 ? ` · ${toAdd.length}` : ""}
          </button>
          <CheckCart buttonClassName={styles.button} iconClassName={styles.buttonIcon} placement="above" />
        </div>
      </div>

      {confirming ? (
        <AddToCartDialog
          parts={confirming}
          currency={currency}
          discountRate={discountRate}
          onConfirm={(parts) => addition.add(parts, () => setTicked(new Set()))}
          onClose={() => setConfirming(null)}
        />
      ) : null}
    </div>
  );
}
