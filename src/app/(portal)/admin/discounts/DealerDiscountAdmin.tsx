"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

/**
 * PATCH a company's discountRate. Starts with the signed-in company;
 * paste another company UUID to edit a dealer account.
 */
export function DealerDiscountAdmin({ companyId, csrfToken }: { companyId: string; csrfToken: string }) {
  const [targetId, setTargetId] = useState(companyId);
  const [name, setName] = useState("");
  const [rate, setRate] = useState("0.10");
  const [version, setVersion] = useState(1);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = async (id: string) => {
    setError(null);
    setMessage(null);
    const response = await fetch(`/api/v1/admin/companies/${id}/discount`, {
      credentials: "same-origin",
      cache: "no-store",
    });
    const body = await response.json().catch(() => null);
    if (!response.ok) {
      setError(typeof body?.detail === "string" ? body.detail : "Could not load company discount.");
      return;
    }
    setName(body.name);
    setRate(body.discountRate);
    setVersion(body.version);
  };

  useEffect(() => {
    void load(targetId);
  }, [targetId]);

  const save = async () => {
    setError(null);
    setMessage(null);
    const response = await fetch(`/api/v1/admin/companies/${targetId}/discount`, {
      method: "PATCH",
      credentials: "same-origin",
      cache: "no-store",
      headers: {
        "content-type": "application/json",
        "x-csrf-token": csrfToken,
        "idempotency-key": `discount-${crypto.randomUUID()}`,
      },
      body: JSON.stringify({ version, discountRate: rate }),
    });
    const body = await response.json().catch(() => null);
    if (!response.ok) {
      setError(typeof body?.detail === "string" ? body.detail : "Could not save discount.");
      return;
    }
    setName(body.name);
    setRate(body.discountRate);
    setVersion(body.version);
    setMessage(`Saved ${body.name} at ${(Number(body.discountRate) * 100).toFixed(0)}% discount.`);
  };

  return (
    <main style={{ padding: 24, maxWidth: 560 }}>
      <h1>Dealer discount rate</h1>
      <p>Sets the company <code>discountRate</code> used on catalogue list-price cart lines. Quoted Customer Price is never re-discounted.</p>
      <label style={{ display: "block", marginTop: 16 }}>
        Company id
        <input style={{ display: "block", width: "100%", marginTop: 4 }} value={targetId}
          onChange={(event) => setTargetId(event.target.value.trim())} />
      </label>
      {name ? <p><strong>{name}</strong> · version {version}</p> : null}
      <label style={{ display: "block", marginTop: 12 }}>
        Discount rate (0–1, e.g. 0.10 = 10%)
        <input style={{ display: "block", width: "100%", marginTop: 4 }} value={rate}
          onChange={(event) => setRate(event.target.value.trim())} />
      </label>
      <div style={{ display: "flex", gap: 12, marginTop: 16 }}>
        <button type="button" onClick={() => void load(targetId)}>Reload</button>
        <button type="button" onClick={() => void save()}>Save</button>
        <Link href="/">Home</Link>
      </div>
      {error ? <p role="alert">{error}</p> : null}
      {message ? <p role="status">{message}</p> : null}
    </main>
  );
}
