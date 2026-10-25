"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { EmptyState } from "@/components";
import { downloadCsv } from "@/lib/adminCsv";
import { formatAmount } from "@/lib/format";
import {
  adminTotal,
  missingBeforeNotify,
  responseDays,
  sortAdminRecords,
} from "@/lib/quote-status";
import { apiLineToRecord, createQuoteApi } from "@/state/quote-api";
import { useCustomerSession } from "@/state/SessionBoundary";
import type { Availability, QuoteStatusRecord } from "@/types/quotes";
import base from "../quotes.module.css";
import styles from "./admin.module.css";

const PAGE_SIZE = 15;
const NONE = "—";
const LINES = ["Fat Truck", "IronHorse", "Agilis"] as const;
const AVAILABLE: Record<Availability, string> = { yes: "Yes", partial: "Partial", no: "No" };

function formatDate(iso: string | null): string {
  if (!iso) return NONE;
  const date = new Date(`${iso}T00:00:00Z`);
  const month = date.toLocaleString("en-CA", { month: "short", timeZone: "UTC" });
  return `${String(date.getUTCDate()).padStart(2, "0")}-${month}-${date.getUTCFullYear()}`;
}

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

function EditCell({ value, label, kind = "text", onSave }: {
  value: string;
  label: string;
  kind?: "text" | "price" | "qty";
  onSave: (raw: string) => void;
}) {
  return (
    <input
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
 * Persists through the quote API when the session has `orders.quote`.
 */
export function AdminQuoteStatus({ seed, today }: { seed: QuoteStatusRecord[]; today: string }) {
  const session = useCustomerSession();
  const api = useMemo(() => (session ? createQuoteApi(session.csrfToken) : null), [session]);
  const [all, setAll] = useState(() => sortAdminRecords(seed));
  const [loading, setLoading] = useState(Boolean(api));
  const [message, setMessage] = useState<{ kind: "done" | "error"; text: string } | null>(null);

  const reload = useCallback(async () => {
    if (!api) {
      setAll(sortAdminRecords(seed));
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const page = await api.listAdmin();
      setAll(sortAdminRecords(page.items.map(apiLineToRecord)));
    } catch (error) {
      setMessage({ kind: "error", text: error instanceof Error ? error.message : "Could not load quotes." });
      setAll(sortAdminRecords(seed));
    } finally {
      setLoading(false);
    }
  }, [api, seed]);

  useEffect(() => {
    void reload();
  }, [reload]);

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

  const save = async (record: QuoteStatusRecord, patch: Partial<QuoteStatusRecord>) => {
    if (!api || record.version == null) {
      setAll((current) => sortAdminRecords(current.map((row) => (row.id === record.id ? { ...row, ...patch } : row))));
      return;
    }
    try {
      const updated = await api.patchLine(record.id, {
        version: record.version,
        available: patch.available !== undefined ? patch.available : undefined,
        estAvailability: patch.estAvailability !== undefined ? patch.estAvailability : undefined,
        newPartNumber: patch.newPartNumber !== undefined ? patch.newPartNumber : undefined,
        newDescription: patch.newDescription !== undefined ? patch.newDescription : undefined,
        newQty: patch.newQty !== undefined ? patch.newQty : undefined,
        factoryPrice: patch.factoryPrice !== undefined ? patch.factoryPrice : undefined,
        customerPrice: patch.customerPrice !== undefined ? patch.customerPrice : undefined,
        comments: patch.comments !== undefined ? patch.comments : undefined,
        responseDate: patch.responseDate !== undefined ? patch.responseDate : undefined,
      });
      setAll((current) => sortAdminRecords(current.map((row) => (row.id === record.id ? apiLineToRecord(updated) : row))));
    } catch (error) {
      setMessage({ kind: "error", text: error instanceof Error ? error.message : "Save failed." });
      await reload();
    }
  };

  const notify = async () => {
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
    if (!api) {
      setMessage({ kind: "error", text: "Sign in with a RUF Diamond quote capability to notify customers." });
      return;
    }
    try {
      const { notices } = await api.notify({ lineIds: selected.map((record) => record.id) });
      setTicked(new Set());
      await reload();
      setMessage({
        kind: "done",
        text: `Notified ${notices
          .map((notice) => `${notice.customer} about ${notice.quoteNo} (${notice.lineIds.length} ${notice.lineIds.length === 1 ? "line" : "lines"})`)
          .join(", ")}. One notice and email per quote.`,
      });
    } catch (error) {
      setMessage({ kind: "error", text: error instanceof Error ? error.message : "Notify failed." });
    }
  };

  const oneQuote =
    selected.length > 0 &&
    selected.every((record) => record.quoteNo === selected[0].quoteNo && record.companyId === selected[0].companyId);

  const addFactoryLine = async () => {
    if (!api || !oneQuote) return;
    const base = selected[0];
    try {
      const added = await api.addFactoryLine({
        quoteNo: base.quoteNo,
        companyId: base.companyId,
        productLine: base.productLine,
        newPartNumber: "TBD",
        newDescription: "Factory-added line",
        newQty: 1,
        available: "yes",
        comments: "",
      });
      setAll((current) => sortAdminRecords([...current, apiLineToRecord(added)]));
      setMessage({ kind: "done", text: `Added a factory line to ${added.quoteNo}. Fill in its part, price and availability.` });
    } catch (error) {
      setMessage({ kind: "error", text: error instanceof Error ? error.message : "Could not add factory line." });
    }
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
        <span className={base.spacer} />
        <label className={styles.filter}>
          <span>Product line</span>
          <select value={line} onChange={(event) => { setLine(event.target.value as typeof line); setPage(0); }}>
            <option value="all">All</option>
            {LINES.map((item) => <option key={item} value={item}>{item}</option>)}
          </select>
        </label>
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
        <button type="button" className={base.button} onClick={() => void notify()} disabled={selected.length === 0}>
          Notify Customer
        </button>
        <button type="button" className={base.button} onClick={() => void addFactoryLine()} disabled={!oneQuote}>
          Add factory line
        </button>
        <Link href="/quotes" className={base.button}>Customer view</Link>
        <Link href="/" className={`${base.button} ${base.home}`}>Home</Link>
      </div>

      <div className={base.surface}>
        <p className={base.notice}>
          Factory Price is shown on this screen only.
          {api ? " Changes save to the quote service." : " Sign in with quote capability to persist."}
        </p>
        {loading ? <p className={base.loading}>Loading quotes…</p> : null}
        {message ? <p role={message.kind === "error" ? "alert" : "status"} className={message.kind === "error" ? base.error : base.done}>{message.text}</p> : null}

        {records.length === 0 && !loading ? (
          <EmptyState title="No quote lines" description="Customer quote requests appear here for the factory reply." />
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
                  {/* Where the part sits on the machine. Serial Number matters most:
                      parts differ by VIN, so the person quoting needs it (14 Oct, answer 9). */}
                  <th scope="col">Model</th>
                  <th scope="col">Serial Number</th>
                  <th scope="col">System</th>
                  <th scope="col">Page</th>
                  <th scope="col">Assembly Name</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((record, index) => {
                  /*
                   * Names each control by its part, not just its column. Every row
                   * has the same eight fields, so "Factory price" alone gives a
                   * screen reader — or a test — no way to tell one row from the next.
                   */
                  const part = record.requested?.partNumber ?? record.newPartNumber ?? "factory line";
                  return (
                  <tr key={record.id} className={base.row} data-available={record.available ?? undefined}>
                    <td className={base.tick}>
                      <input type="checkbox" checked={ticked.has(record.id)} onChange={() => toggle(record.id)}
                        aria-label={`Select ${part} from ${record.quoteNo}`} disabled={record.notifyCustomer} />
                    </td>
                    <td className={base.num}>{page * PAGE_SIZE + index + 1}</td>
                    <td>{formatDate(record.requestDate)}</td>
                    <td>{record.quoteNo}</td>
                    <td>{record.customer}</td>
                    <td>{record.user}</td>
                    <td>{record.requested?.partNumber ?? NONE}</td>
                    <td>{record.requested?.description ?? NONE}</td>
                    <td>{record.requested?.qty ?? NONE}</td>
                    <td>
                      <EditCell value={record.factoryPrice ?? ""} label={`Factory price for ${part}`} kind="price"
                        onSave={(raw) => void save(record, { factoryPrice: toPrice(raw) })} />
                    </td>
                    <td>
                      <EditCell value={record.responseDate ?? today} label={`Response date for ${part}`}
                        onSave={(raw) => void save(record, { responseDate: raw.trim() || null })} />
                    </td>
                    <td>{responseDays(record) ?? NONE}</td>
                    <td>
                      <select aria-label={`Availability of ${part}`} value={record.available ?? ""}
                        onChange={(event) => void save(record, { available: (event.target.value || null) as Availability | null })}>
                        <option value="">—</option>
                        {(Object.keys(AVAILABLE) as Availability[]).map((key) => (
                          <option key={key} value={key}>{AVAILABLE[key]}</option>
                        ))}
                      </select>
                    </td>
                    <td>
                      <EditCell value={record.estAvailability ?? ""} label={`Estimated availability of ${part}`}
                        onSave={(raw) => void save(record, { estAvailability: raw.trim() || null })} />
                    </td>
                    <td>
                      <EditCell value={record.newPartNumber ?? ""} label={`New part number for ${part}`}
                        onSave={(raw) => void save(record, { newPartNumber: raw.trim() || null })} />
                    </td>
                    <td>
                      <EditCell value={record.newDescription ?? ""} label={`New description for ${part}`}
                        onSave={(raw) => void save(record, { newDescription: raw.trim() || null })} />
                    </td>
                    <td>
                      <EditCell value={record.newQty == null ? "" : String(record.newQty)} label={`New quantity for ${part}`} kind="qty"
                        onSave={(raw) => void save(record, { newQty: toQty(raw) })} />
                    </td>
                    <td>
                      <EditCell value={record.customerPrice ?? ""} label={`Unit price for ${part}`} kind="price"
                        onSave={(raw) => void save(record, { customerPrice: toPrice(raw) })} />
                    </td>
                    <td>{record.customerPrice && (record.newQty ?? record.requested?.qty) != null
                      ? formatAmount(adminTotal(record)!, "CAD") : NONE}</td>
                    <td>
                      <EditCell value={record.comments} label={`Comments on ${part}`}
                        onSave={(raw) => void save(record, { comments: raw })} />
                    </td>
                    <td>{record.notifyCustomer ? "Yes" : "No"}</td>
                    <td>{record.model}</td>
                    <td>{record.serialNumber}</td>
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
      </div>
    </div>
  );
}
