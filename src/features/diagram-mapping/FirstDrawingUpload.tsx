"use client";
import { useEffect, useRef, useState } from "react";
import type { DraftFigureMetadata, DrawingUploadIntent } from "@rufdiamond/contracts";
import { MappingApiError } from "./api-client";
import type { DrawingApiClient } from "./drawing-api-client";

export function FirstDrawingUpload({ figure, canUpload, api, onAttached }: { figure: DraftFigureMetadata; canUpload: boolean; api: DrawingApiClient; onAttached: () => Promise<void> | void }) {
  const [file, setFile] = useState<File | null>(null);
  const [pending, setPending] = useState<DrawingUploadIntent | null>(null);
  const [notice, setNotice] = useState("");
  const [blocked, setBlocked] = useState(false);
  const [busy, setBusy] = useState(false);
  const active = useRef<AbortController | null>(null);
  useEffect(() => () => active.current?.abort(), []);
  async function upload() {
    if (!canUpload || blocked || active.current || (!file && !pending)) return;
    const controller = new AbortController(); active.current = controller; setBusy(true);
    let finalizing = false;
    try {
      let intent = pending;
      if (!intent) {
        intent = await api.createIntent(figure.id, figure.version, file!, controller.signal);
        await api.uploadFile(intent, file!, controller.signal);
        if (controller.signal.aborted) return;
        setPending(intent);
      }
      finalizing = true;
      await api.finalize(figure.id, intent.uploadId, intent.figureVersion, controller.signal);
      finalizing = false;
      if (!controller.signal.aborted) await onAttached();
    } catch (error) {
      if (controller.signal.aborted) return;
      const rejected = finalizing && error instanceof MappingApiError && ([413,422].includes(error.status) || error.status === 409 && error.code === "UPLOAD_EXPIRED");
      if (rejected) { setPending(null); setFile(null); }
      if (error instanceof MappingApiError && [401,403,404,409,412].includes(error.status) && !rejected) setBlocked(true);
      setNotice(rejected ? "PNG rejected or expired. Choose a corrected PNG." : "Upload or source verification unavailable. Retry verification, or reload to check current figure access and version.");
    } finally { if (active.current === controller) { active.current = null; setBusy(false); } }
  }
  return <section aria-label="First drawing upload"><h1>{figure.name}</h1><p>This figure has no attached drawing. Upload its source PNG before mapping. Figure version {figure.version}.</p>
    <p>PNG limit: 20 MiB, 40 million pixels, 16,384 pixels per side.</p>
    {canUpload ? <><label>First PNG <input type="file" accept="image/png,.png" disabled={busy || blocked || !!pending} onChange={event => setFile(event.target.files?.[0] ?? null)} /></label>
      <button disabled={busy || blocked || (!file && !pending)} onClick={() => void upload()}>{pending ? "Retry PNG verification" : "Upload first PNG"}</button></> : <p>Your current permissions allow inspection only. An authorized uploader must attach the source.</p>}
    {notice && <p role="alert">{notice} <a href={`/admin/figures/${figure.id}/mapping`}>Reload figure</a></p>}
  </section>;
}
