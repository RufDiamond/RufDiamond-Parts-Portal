"use client";
import { useState } from "react";
import type { Static } from "@sinclair/typebox";
import type { PublicationQueuePageSchema, PublishInput } from "@rufdiamond/contracts";
import { MappingApiError } from "./api-client";
import type { PublisherApi } from "./admin-api-client";
type Queue = Static<typeof PublicationQueuePageSchema>;
const uuid = "[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}";
export function blockerFigureLink(path: string | undefined, modelId: string) {
  const match = path?.match(new RegExp(`^models\\[(${uuid})\\]\\.variants\\[(${uuid})\\]\\.figures\\[(${uuid})\\]$`));
  return match && match[1] === modelId ? `/admin/figures/${match[3]}/mapping` : null;
}
export function PublisherQueue({ initial, api }: { initial: Queue; api: PublisherApi }) {
  const [queue, setQueue] = useState(initial);
  const [summary, setSummary] = useState("");
  const [pending, setPending] = useState<{ input: PublishInput; key: string } | null>(null);
  const [uncertain, setUncertain] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  async function reload(cursor?: string) {
    if (busy || uncertain) return;
    setBusy(true); setPending(null);
    try { setQueue(await api.queue(cursor)); setError(""); } catch { setQueue({ items: [], nextCursor: null }); setError("Queue unavailable or changed. Reload its first page."); } finally { setBusy(false); }
  }
  async function publish() {
    if (!pending || busy) return;
    setBusy(true); setError("");
    try {
      const result = await api.publish(pending.input, pending.key);
      setPending(null); setUncertain(false); setStatus(`Published release ${result.revision}. It is now the active immutable catalogue.`);
      try { setQueue(await api.queue()); } catch { setQueue({ items: [], nextCursor: null }); setError("Published successfully; reload the queue to see current state."); }
    } catch (failure) {
      const retryable = !(failure instanceof MappingApiError) || failure.status >= 500;
      setUncertain(retryable);
      if (!retryable) { setPending(null); setQueue({ items: [], nextCursor: null }); }
      setError(retryable ? "Publication outcome uncertain. Retry this exact publication safely before starting another." : "Publication rejected or versions changed. Reload the queue and review current blockers and versions.");
    } finally { setBusy(false); }
  }
  return <section><h1>Publisher queue</h1><p>Publishing makes the approved snapshot the active customer catalogue.</p><label>Release summary <input value={summary} disabled={!!pending || busy} maxLength={2000} onChange={event => setSummary(event.target.value)} /></label>
    <button disabled={busy || uncertain} onClick={() => void reload()}>Reload queue</button>
    {queue.items.map(item => <article key={item.modelId}><h2>{item.name}</h2><p>Working version {item.workingVersion} · Publication version {item.publicationVersion}</p>
      {item.blockers.length ? <ul>{item.blockers.map((blocker, index) => { const href = blockerFigureLink(blocker.path, item.modelId); return <li key={index}>{blocker.message} {href && <a href={href}>Inspect figure</a>}</li>; })}</ul> : <button disabled={busy || !!pending || !summary.trim()} onClick={() => setPending({ key: crypto.randomUUID(), input: { modelId: item.modelId, expectedWorkingVersion: item.workingVersion, expectedPublicationVersion: item.publicationVersion, summary: summary.trim() } })}>Review publication</button>}
    </article>)}
    {pending && <section aria-label="Confirm publication"><p>Confirm publishing model {pending.input.modelId} at working version {pending.input.expectedWorkingVersion} and publication version {pending.input.expectedPublicationVersion}. This activates a customer release.</p><button disabled={busy} onClick={() => void publish()}>{uncertain ? "Retry exact publication" : "Confirm publish and activate"}</button>{!uncertain && <button disabled={busy} onClick={() => setPending(null)}>Cancel publication</button>}</section>}
    {queue.nextCursor && <button disabled={busy || !!pending} onClick={() => void reload(queue.nextCursor!)}>Next queue page</button>}
    {error && <p role="alert">{error}</p>}{status && <p role="status">{status}</p>}
  </section>;
}
