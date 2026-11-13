"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { createQuoteApi } from "@/state/quote-api";
import { useCustomerSession } from "@/state/SessionBoundary";
import type { SubmitQuoteInput } from "@rufdiamond/contracts";

type Row = SubmitQuoteInput["lines"][number] & { id: string; references: string };

export function PreviewQuote({ rows }: { rows: Row[] }) {
  const session = useCustomerSession();
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [error, setError] = useState("");
  const [reference, setReference] = useState("");
  const [busy, setBusy] = useState(false);
  const submitting = useRef(false);
  const api = useRef<ReturnType<typeof createQuoteApi> | null>(null);
  const allowed = !!session?.capabilities.includes("orders.submit");
  const selected = rows.filter(row => quantities[row.id] > 0);
  return <form onSubmit={async event => {
    event.preventDefault();
    if (!allowed || !session || !selected.length || submitting.current) return;
    submitting.current = true;
    setBusy(true);
    setError("");
    setReference("");
    try {
      api.current ??= createQuoteApi(session.csrfToken);
      const lines = selected.map(({ id, references, ...line }) => ({
        ...line, qty: quantities[id],
        description: references === "—" ? line.description : `${line.description} (ref. ${references})`,
      }));
      const result = await api.current.submitQuote({
        productLine: "Fat Truck",
        shipping: null,
        generalComment: "Meeting preview request — do not fulfill. Verify parts against the approved catalogue.",
        lines,
      });
      setReference(result.quoteNo);
      setQuantities({});
    } catch (err) {
      setError(err instanceof Error ? err.message : "Quote could not be saved.");
    } finally {
      submitting.current = false;
      setBusy(false);
    }
  }}>
    <table style={{ width: "100%", textAlign: "left", borderCollapse: "collapse", color: "#202020" }}>
      <thead><tr><th>Ref.</th><th>Part number</th><th>Description</th>{allowed && <th>Quote quantity</th>}</tr></thead>
      <tbody>{rows.map(row => <tr key={row.id} style={{ borderTop: "1px solid #ccc" }}>
        <td>{row.references}</td><td>{row.partNumber}</td><td>{row.description}</td>
        {allowed && <td><input type="number" min={0} max={100000} step={1} aria-label={`Quantity for ${row.partNumber}`}
          value={quantities[row.id] || ""} disabled={busy}
          onChange={event => setQuantities({ ...quantities, [row.id]: Number(event.target.value) })} /></td>}
      </tr>)}</tbody>
    </table>
    {allowed ? <button type="submit" disabled={busy || !selected.length}>{busy ? "Saving…" : "Submit quote request"}</button>
      : <p>A Purchaser can submit a quote request for these parts.</p>}
    {error && <p role="alert">{error}</p>}
    {reference && <p role="status">Quote {reference} saved. <Link href="/quotes">Open Quote Status</Link></p>}
  </form>;
}
