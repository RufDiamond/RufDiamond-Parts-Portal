"use client";

import Image from "next/image";
import Link from "next/link";
import { useMemo, useState } from "react";
import { EmptyState } from "@/components";
import { downloadCsv } from "@/lib/adminCsv";
import { formatAmount } from "@/lib/format";
import {
  adminTotal,
  factoryAddedLine,
  missingBeforeNotify,
  responseDays,
  sortAdminRecords,
} from "@/lib/quote-status";
import { mergeQuoteRecords, notifyCustomers, saveQuoteRecords, useStoredQuoteRecords } from "@/state/quote-store";
import type { Availability, QuoteStatusRecord } from "@/types/quotes";
import base from "../quotes.module.css";
import styles from "./admin.module.css";

const PAGE_SIZE = 15;
const NONE = "—";
const LINES = ["Fat Truck", "IronHorse", "Agilis"] as const;
const AVAILABLE: Record<Availability, string> = { yes: "Yes", partial: "Partial", no: "No" };

/** "11-Jun-2026", as the deck prints dates. */
function formatDate(iso: string | null): string {
  if (!iso) return NONE;
  const date = new Date(`${iso}T00:00:00Z`);
  const month = date.toLocaleString("en-CA", { month: "short", timeZone: "UTC" });
  return `${String(date.getUTCDate()).padStart(2, "0")}-${month}-${date.getUTCFullYear()}`;
}

/** A price as typed, made a two-place decimal string, or null when cleared or not a price. */
function toPrice(raw: string): string | null {
  const trimmed = raw.trim().replace(/[$,\s]/g, "");
  if (trimmed === "") return null;
  const value = Number(trimmed);
  return Number.isFinite(value) && value >= 0 ? value.toFixed(2) : null;
}

function toQty(raw: string): number | null {
  const value = Number(raw.trim());
  return raw.trim() !== "" && Number.isInteger(value) && value > 0 ? value : null;
}

/**
 * A cell the administrator types into. Kept uncontrolled and saved when the
 * field is left (or on Enter), not on every keystroke: each save rewrites the
 * stored quotes and redraws both Quote Status screens.
 */
function EditCell({ value, label, kind = "text", onSave }: {
  value: string;
  label: string;
  kind?: "text" | "price" | "qty";
  onSave: (raw: string) => void;
}) {
  return (
    <input
      // Re-mount when the stored value changes elsewhere (another tab, a reset).
      key={value}
      defaultValue={value}
      aria-label={label}
      inputMode={kind === "text" ? undefined : "decimal"}
      className={`${styles.cellInput} ${kind === "text" ? styles.cellText : styles.cellNumber}`}
      onBlur={(event) => {
        if (event.currentTarget.value !== value) onSave(event.currentTarget.value);
      }}
      onKeyDown={(event) => {
        if (event.key === "Enter") event.currentTarget.blur();
      }}
    />
  );
}

function toCsv(records: QuoteStatusRecord[]): string {
  const quote = (value: string | number | null) => `"${String(value ?? "").replace(/"/g, '""')}"`;
  const head = ["No.", "Date Request", "Quote No.", "Customer", "User", "Part No.", "Description", "Qty",
    "Factory Price (CAD)", "Response Date", "Response Days", "Available", "Est. Availability", "New Part No.",
    "New Description", "New Qty", "Unit Price (CAD)", "Total Price (CAD)", "Comments", "Notify Customer",
    "Model", "Serial Number", "System", "Page", "Assembly Name"];
  return [head, ...records.map((record, index) => [
    index + 1, record.requestDate, record.quoteNo, record.customer, record.user,
    record.requested?.partNumber ?? "", record.requested?.description ?? "", record.requested?.qty ?? "",
    record.factoryPrice ?? "", record.responseDate ?? "", responseDays(record) ?? "",
    record.available ? AVAILABLE[record.available] : "", record.estAvailability ?? "",
    record.newPartNumber ?? "", record.newDescription ?? "", record.newQty ?? "",
    record.customerPrice ?? "", adminTotal(record) ?? "", record.comments, record.notifyCustomer ? "Yes" : "No",
    record.model, record.serialNumber, record.system, record.figure, record.assemblyName,
  ])].map((row) => row.map(quote).join(",")).join("\n");
}

/**
 * Quote Status as RUF Diamond's administrator sees it — 12 Oct deck, p58.
 *
 * Every account's quote lines, newest request first. A request arrives here
 * blank; the administrator types in the factory's quotation, then ticks the
 * lines that are ready and presses Notify Customer, which releases them to
 * the customer's own Quote Status as one notice per quote (14 Oct, answer 3).
 *
 * Factory Price is the tenth column, straight after Qty (14 Oct, answer 1).
 * It is on this screen only: the customer's lines are built from a type that
 * has no Factory Price at all.
 */
export function AdminQuoteStatus({ seed, today }: { seed: QuoteStatusRecord[]; today: string }) {
  const stored = useStoredQuoteRecords();
  const all = useMemo(() => sortAdminRecords(mergeQuoteRecords(seed, stored)), [seed, stored]);

  const [line, setLine] = useState<(typeof LINES)[number] | "all">("all");
  const records = line === "all" ? all : all.filter((record) => record.productLine === line);

  const pages = Math.max(1, Math.ceil(records.length / PAGE_SIZE));
  const [pageState, setPage] = useState(0);
  const page = Math.min(pageState, pages - 1);
  const visible = records.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  const [ticked, setTicked] = useState<ReadonlySet<string>>(new Set());
  const toggle = (id: string) =>
    setTicked((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const selected = all.filter((record) => ticked.has(record.id));

  const [message, setMessage] = useState<{ kind: "done" | "error"; text: string } | null>(null);

  const save = (record: QuoteStatusRecord, patch: Partial<QuoteStatusRecord>) => {
    saveQuoteRecords([{ ...record, ...patch }]);
  };

  const notify = () => {
    const unready = selected
      .map((record) => ({ record, missing: missingBeforeNotify(record) }))
      .filter(({ missing }) => missing.length > 0);
    if (unready.length > 0) {
      setMessage({
        kind: "error",
        text: `Not notified. Fill these in first — ${unready
          .map(({ record, missing }) => `${record.quoteNo} ${record.requested?.partNumber ?? record.newPartNumber ?? "factory line"}: ${missing.join(", ")}`)
          .join("; ")}.`,
      });
      return;
    }
    const notices = notifyCustomers(selected, today);
    setTicked(new Set());
    setMessage({
      kind: "done",
      text: `Notified ${notices
        .map((notice) => `${notice.customer} about ${notice.quoteNo} (${notice.lineIds.length} ${notice.lineIds.length === 1 ? "line" : "lines"})`)
        .join(", ")}. One notice per quote. The customer sees it in the portal; no email is sent from this demonstration yet.`,
    });
  };

  /** All ticked lines belong to one quote, so a factory line knows where it goes. */
  const oneQuote =
    selected.length > 0 &&
    selected.every((record) => record.quoteNo === selected[0].quoteNo && record.companyId === selected[0].companyId);

  const addFactoryLine = () => {
    const added = factoryAddedLine(selected[0], new Set(all.map((record) => record.id)));
    saveQuoteRecords([added]);
    setMessage({ kind: "done", text: `Added a factory line to ${added.quoteNo}. Fill in its part, price and availability.` });
  };

  const email = () => {
    const chosen = selected.length ? selected : records;
    const body = [
      "Quote status",
      "",
      "Quote no.\tCustomer\tPart no.\tQty\tAvailable\tUnit price (CAD)",
      ...chosen.map((record) =>
        [record.quoteNo, record.customer, record.newPartNumber ?? record.requested?.partNumber ?? "",
          record.newQty ?? record.requested?.qty ?? "", record.available ? AVAILABLE[record.available] : "Awaiting factory",
          record.customerPrice ?? ""].join("\t")),
    ].join("\n");
    window.location.href = `mailto:?subject=${encodeURIComponent("Quote status")}&body=${encodeURIComponent(body)}`;
  };

  return (
    <div className={base.screen}>
      <div className={base.bar}>
        <h1 className={base.title}>Quote Status — RUF Diamond</h1>
        <nav className={styles.lines} aria-label="Product line">
          {(["all", ...LINES] as const).map((value) => (
            <button
              key={value}
              type="button"
              className={`${base.button} ${line === value ? styles.lineActive : ""}`}
              aria-pressed={line === value}
              onClick={() => { setLine(value); setPage(0); }}
            >
              {value === "all" ? "All" : value}
            </button>
          ))}
        </nav>
        <span className={base.spacer} />
        <nav className={base.pager} aria-label="Pages">
          <button type="button" className={base.button} onClick={() => setPage(0)} disabled={page === 0} aria-label="First page">«</button>
          <button type="button" className={base.button} onClick={() => setPage(page - 1)} disabled={page === 0} aria-label="Previous page">‹</button>
          <span className={base.pageOf}>{page + 1} of {pages}</span>
          <button type="button" className={base.button} onClick={() => setPage(page + 1)} disabled={page >= pages - 1} aria-label="Next page">›</button>
          <button type="button" className={base.button} onClick={() => setPage(pages - 1)} disabled={page >= pages - 1} aria-label="Last page">»</button>
        </nav>
        <button type="button" className={base.button} onClick={() => downloadCsv("quote-status-admin", toCsv(records))} disabled={records.length === 0}>
          Export to Excel
        </button>
        <button type="button" className={base.button} onClick={email} disabled={records.length === 0}>
          <Image src="/toolbar/email.png" alt="" width={40} height={28} className={base.buttonIcon} />
          Email
        </button>
        <button type="button" className={base.button} onClick={() => window.print()}>
          <Image src="/toolbar/print.png" alt="" width={40} height={40} className={base.buttonIcon} />
          Print
        </button>
        <Link href="/quotes" className={base.button}>Customer view</Link>
        <Link href="/" className={`${base.button} ${base.home}`}>Home</Link>
      </div>

      <div className={base.surface}>
        <p className={base.notice}>
          Requests arrive here blank. Enter the factory&rsquo;s quotation on each line, tick the lines that are ready, then
          press <strong>Notify Customer</strong>: the customer is told once per quote, however many lines it releases.
          Factory Price is shown on this screen only.
        </p>

        {message ? (
          <p role={message.kind === "error" ? "alert" : "status"} className={message.kind === "error" ? base.error : base.done}>
            {message.text}
          </p>
        ) : <span />}

        {records.length === 0 ? (
          <EmptyState title="No quote requests" description="Quote requests customers submit are listed here." />
        ) : (
          <div className={base.scroller}>
            <table className={`${base.table} ${styles.table}`}>
              <thead className={base.head}>
                <tr>
                  <th scope="col">Select</th>
                  <th scope="col">No.</th>
                  <th scope="col">Date Request</th>
                  <th scope="col">Quote No.</th>
                  <th scope="col">Customer</th>
                  <th scope="col">User</th>
                  <th scope="col">Part No.</th>
                  <th scope="col">Description</th>
                  <th scope="col">Qty</th>
                  <th scope="col">Factory Price (CAD)</th>
                  <th scope="col">Response Date</th>
                  <th scope="col">Response Days</th>
                  <th scope="col">Available</th>
                  <th scope="col">Est. Availability</th>
                  <th scope="col">New Part No.</th>
                  <th scope="col">New Description</th>
                  <th scope="col">New Qty</th>
                  <th scope="col">Unit Price (CAD)</th>
                  <th scope="col">Total Price (CAD)</th>
                  <th scope="col">Comments</th>
                  <th scope="col">Notify Customer</th>
                  <th scope="col">Model</th>
                  <th scope="col">Serial Number</th>
                  <th scope="col">System</th>
                  <th scope="col">Page</th>
                  <th scope="col">Assembly Name</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((record, index) => {
                  const part = record.requested?.partNumber ?? record.newPartNumber ?? "factory line";
                  const total = adminTotal(record);
                  const days = responseDays(record);
                  return (
                    <tr key={record.id} className={base.row} data-available={record.available ?? undefined}>
                      <td className={base.tick}>
                        <input
                          type="checkbox"
                          className={base.checkbox}
                          checked={ticked.has(record.id)}
                          onChange={() => toggle(record.id)}
                          aria-label={`Select ${part} from ${record.quoteNo}`}
                        />
                      </td>
                      <td className={base.num}>{page * PAGE_SIZE + index + 1}</td>
                      <td className={base.mono}>{formatDate(record.requestDate)}</td>
                      <td className={base.mono}>{record.quoteNo}</td>
                      <td className={base.text}>{record.customer}</td>
                      <td>{record.user}</td>
                      <td className={base.mono}>{record.requested?.partNumber ?? <em className={styles.added}>Added by factory</em>}</td>
                      <td className={base.text}>{record.requested?.description ?? NONE}</td>
                      <td className={base.num}>{record.requested?.qty ?? NONE}</td>
                      <td className={base.money}>
                        <EditCell value={record.factoryPrice ?? ""} kind="price" label={`Factory price for ${part}`}
                          onSave={(raw) => save(record, { factoryPrice: toPrice(raw) })} />
                      </td>
                      <td className={base.mono}>{formatDate(record.responseDate)}</td>
                      <td className={base.num}>{days ?? NONE}</td>
                      <td className={base.center}>
                        <select
                          className={styles.cellInput}
                          aria-label={`Availability of ${part}`}
                          value={record.available ?? ""}
                          onChange={(event) => save(record, { available: (event.target.value || null) as Availability | null })}
                        >
                          <option value="">—</option>
                          <option value="yes">Yes</option>
                          <option value="partial">Partial</option>
                          <option value="no">No</option>
                        </select>
                      </td>
                      <td>
                        <input
                          type="date"
                          className={styles.cellInput}
                          aria-label={`Estimated availability of ${part}`}
                          value={record.estAvailability ?? ""}
                          onChange={(event) => save(record, { estAvailability: event.target.value || null })}
                        />
                      </td>
                      <td>
                        <EditCell value={record.newPartNumber ?? ""} label={`New part number for ${part}`}
                          onSave={(raw) => save(record, { newPartNumber: raw.trim() || null })} />
                      </td>
                      <td>
                        <EditCell value={record.newDescription ?? ""} label={`New description for ${part}`}
                          onSave={(raw) => save(record, { newDescription: raw.trim() || null })} />
                      </td>
                      <td className={base.num}>
                        <EditCell value={record.newQty === null ? "" : String(record.newQty)} kind="qty" label={`New quantity for ${part}`}
                          onSave={(raw) => save(record, { newQty: toQty(raw) })} />
                      </td>
                      <td className={base.money}>
                        <EditCell value={record.customerPrice ?? ""} kind="price" label={`Unit price for ${part}`}
                          onSave={(raw) => save(record, { customerPrice: toPrice(raw) })} />
                      </td>
                      <td className={base.money}>{total ? `$${formatAmount(total, "CAD")}` : NONE}</td>
                      <td>
                        <EditCell value={record.comments} label={`Comments on ${part}`}
                          onSave={(raw) => save(record, { comments: raw.trim() })} />
                      </td>
                      <td className={base.center}>{record.notifyCustomer ? "Yes" : "No"}</td>
                      <td>{record.model}</td>
                      <td className={base.mono}>{record.serialNumber}</td>
                      <td>{record.system}</td>
                      <td>{record.figure}</td>
                      <td>{record.assemblyName}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        <div className={base.actions}>
          <button
            type="button"
            className={`${base.button} ${styles.notify}`}
            onClick={notify}
            disabled={selected.length === 0}
            title={selected.length === 0 ? "Tick the lines that are ready" : undefined}
          >
            Notify Customer{selected.length > 0 ? ` · ${selected.length}` : ""}
          </button>
          <button
            type="button"
            className={base.button}
            onClick={addFactoryLine}
            disabled={!oneQuote}
            title={oneQuote ? `Add a line the factory quoted to ${selected[0].quoteNo}` : "Tick a line of the quote the factory added a part to"}
          >
            Add factory line
          </button>
        </div>
      </div>
    </div>
  );
}
