"use client";

import { useEffect, useReducer, useRef, useState, type KeyboardEvent } from "react";
import type { DrawingUploadIntent, MappingEditorDocument, MappingHistory } from "@rufdiamond/contracts";
import type { DrawingApiClient } from "./drawing-api-client";
import { MappingApiError, type MappingApiClient } from "./api-client";
import { createEditorState, editorReducer, hasUnsavedChanges, matchesSource, usableSource, type Tool } from "./editor-state";
import { drawingMatches, MappingCanvas, type MappingDrawing } from "./MappingCanvas";
import { MappingInspector, occurrenceReadiness } from "./MappingInspector";
import styles from "./mapping-editor.module.css";

export type MappingAuthority = { canEdit: boolean; canMap: boolean; canApprove: boolean; canUploadDrawing?: boolean };
export type MappingEditorProps = {
  initial: MappingEditorDocument; authority: MappingAuthority; drawing: MappingDrawing | null; api: MappingApiClient;
  drawingApi?: DrawingApiClient;
  confirmDiscard?: (message: string) => boolean;
};
const tools: { tool: Tool; label: string; key: string }[] = [
  { tool: "select", label: "Select (V)", key: "v" }, { tool: "label", label: "Label (L)", key: "l" }, { tool: "polygon", label: "Polygon (G)", key: "g" }, { tool: "hole", label: "Hole (H)", key: "h" }, { tool: "pan", label: "Pan (P)", key: "p" },
];
export function MappingEditor({ initial, authority, drawing, api, drawingApi, confirmDiscard = message => window.confirm(message) }: MappingEditorProps) {
  const [state, dispatch] = useReducer(editorReducer, initial, createEditorState);
  const current = useRef(state);
  const [readyImage, setReadyImage] = useState<string | null>(null);
  const [authenticationLost, setAuthenticationLost] = useState(false);
  const [busy, setBusy] = useState(false);
  const active = useRef<AbortController | null>(null);
  const [history, setHistory] = useState<MappingHistory | null>(null);
  const [historyNotice, setHistoryNotice] = useState("");
  const [replacementFile, setReplacementFile] = useState<File | null>(null);
  const [pendingUpload, setPendingUpload] = useState<DrawingUploadIntent | null>(null);
  const [selectedDrawing, setSelectedDrawing] = useState<MappingDrawing | null>(null);
  const [uploadNotice, setUploadNotice] = useState("");
  const [acceptedInput, setAcceptedInput] = useState(() => JSON.stringify(initial));
  const incomingChanged = JSON.stringify(initial) !== acceptedInput;
  const currentDrawing = selectedDrawing ?? drawing;
  const sourceImage = drawingMatches(state, currentDrawing) && !state.sourceConflict && !incomingChanged && !pendingUpload ? currentDrawing : null;
  const imageKey = sourceImage ? JSON.stringify(sourceImage) : null;
  const requestedFigureChanged = initial.document.figureId !== state.document.figureId;
  const enabled = authority.canEdit && !authenticationLost && !!sourceImage && readyImage === imageKey && !state.sourceConflict && state.saveStatus !== "conflict" && !requestedFigureChanged;
  const unsaved = hasUnsavedChanges(state);
  const complete = state.document.occurrences.length > 0 && state.document.occurrences.every(o => !occurrenceReadiness(o).length) && state.source.occurrences.every(o => state.document.occurrences.some(d => d.calloutId === o.id));
  const approveEnabled = enabled && authority.canMap && authority.canApprove && complete && !unsaved && !!state.revision && !busy;
  const approved = !incomingChanged && !pendingUpload && !state.sourceConflict && !unsaved && matchesSource(state.document, state.source) && state.revision?.approval;
  useEffect(() => { current.current = state; }, [state]);
  useEffect(() => () => { active.current?.abort(); }, []);
  useEffect(() => {
    if (!unsaved && !busy) return;
    const beforeUnload = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    const navigate = (event: MouseEvent) => {
      const link = event.target instanceof Element ? event.target.closest("a[href]") : null;
      if (link && !confirmDiscard("Leave the editor? Unsaved in-memory work will be lost.")) { event.preventDefault(); event.stopPropagation(); }
    };
    window.addEventListener("beforeunload", beforeUnload); document.addEventListener("click", navigate, true);
    return () => { window.removeEventListener("beforeunload", beforeUnload); document.removeEventListener("click", navigate, true); };
  }, [unsaved, busy, confirmDiscard]);
  function problem(error: unknown, token?: string) {
    if (error instanceof DOMException && error.name === "AbortError") return;
    if (error instanceof MappingApiError && [401, 403].includes(error.status)) setAuthenticationLost(true);
    dispatch({ type: "saveFailed", token, message: error instanceof Error ? error.message : "The request failed. Your work remains in memory.", conflict: error instanceof MappingApiError && [409, 412].includes(error.status), issues: error instanceof MappingApiError ? error.issues : [] });
  }
  function begin() {
    if (active.current) return null;
    const controller = new AbortController(); active.current = controller; setBusy(true); return controller;
  }
  function end(controller: AbortController) {
    if (active.current === controller) { active.current = null; setBusy(false); }
  }
  async function uploadReplacement(retry = false) {
    if (!drawingApi || !authority.canUploadDrawing || authenticationLost || requestedFigureChanged || incomingChanged || (!retry && !replacementFile)) return;
    const controller = begin(); if (!controller) return;
    let attached = false;
    try {
      let intent = pendingUpload;
      if (!retry) {
        intent = await drawingApi.createIntent(state.document.figureId, state.source.figure.version, replacementFile!, controller.signal);
        await drawingApi.uploadFile(intent, replacementFile!, controller.signal);
        if (controller.signal.aborted) return;
        setPendingUpload(intent);
      }
      if (!intent || intent.figureId !== state.document.figureId) return;
      await drawingApi.finalize(intent.figureId, intent.uploadId, intent.figureVersion, controller.signal);
      attached = true;
      if (controller.signal.aborted) return;
      const envelope = await api.loadMapping(intent.figureId, controller.signal);
      if (controller.signal.aborted) return;
      dispatch({ type: "serverChecked", envelope });
      setPendingUpload(null); setReplacementFile(null);
      setUploadNotice("PNG attached. Select the current drawing version to reconcile your draft. Saved history remains available.");
    } catch (error) {
      problem(error);
      if (attached) dispatch({ type: "saveFailed", message: "The PNG was attached, but its current source could not be verified. Select the current drawing version before editing.", conflict: true });
      setUploadNotice("Upload or verification did not complete. Your local work remains in memory. A pending verification can be retried safely.");
    } finally { end(controller); }
  }
  async function selectCurrentDrawing() {
    if (!drawingApi || requestedFigureChanged || incomingChanged) return;
    const controller = begin(); if (!controller) return;
    try {
      const envelope = await api.loadMapping(state.document.figureId, controller.signal);
      if (controller.signal.aborted) return;
      dispatch({ type: "serverChecked", envelope });
      const delivered = await drawingApi.loadDrawing(state.document.figureId, controller.signal);
      if (controller.signal.aborted) return;
      const source = envelope.source.drawing;
      if (!source || delivered.figureId !== envelope.source.figure.id || delivered.figureVersion !== envelope.source.figure.version || delivered.drawingFileId !== source.id || delivered.sha256 !== source.sha256 || delivered.width !== source.width || delivered.height !== source.height) throw new MappingApiError(409, "The drawing changed while loading. Select its current version again.");
      if ((hasUnsavedChanges(current.current) || envelope.sourceConflict) && !confirmDiscard("Select the current drawing and replace local work? A changed source starts a new empty draft. Saved history remains unchanged.")) return;
      dispatch({ type: "replaceEnvelope", envelope });
      if (envelope.sourceConflict) dispatch({ type: "resetToSource" });
      setSelectedDrawing(delivered); setReadyImage(null); setPendingUpload(null); setReplacementFile(null); setUploadNotice(""); setAuthenticationLost(false);
    } catch (error) { problem(error); } finally { end(controller); }
  }
  async function save() {
    if (!enabled || state.openRing || state.labelInput || !state.dirty) return;
    const controller = begin(); if (!controller) return;
    const token = crypto.randomUUID();
    dispatch({ type: "saveStarted", token });
    let saved = false;
    try {
      const revision = await api.saveMapping(state.document.figureId, state.version, state.document, token, controller.signal);
      if (controller.signal.aborted) return;
      dispatch({ type: "saveSucceeded", token, revision }); saved = true;
      // Read current source after possible association canonicalization and idempotent replay.
      const envelope = await api.loadMapping(state.document.figureId, controller.signal);
      if (!controller.signal.aborted) dispatch({ type: "serverChecked", envelope });
    } catch (error) {
      problem(error, saved ? undefined : token);
      if (saved) dispatch({ type: "saveFailed", message: "Saved revision exists, but current source could not be verified. Reload/reconcile before the next save or review.", conflict: true });
    } finally { end(controller); }
  }
  async function approve() {
    if (!approveEnabled || !state.revision) return;
    const controller = begin(); if (!controller) return;
    try {
      const revision = await api.approveMapping(state.document.figureId, state.version, state.revision.revisionId, state.revision.checksum, crypto.randomUUID(), controller.signal);
      const envelope = await api.loadMapping(state.document.figureId, controller.signal);
      if (!controller.signal.aborted) { dispatch({ type: "serverChecked", envelope }); if (!envelope.sourceConflict && envelope.revision?.revisionId === revision.revisionId) dispatch({ type: "approvalSucceeded", revision }); }
    } catch (error) { problem(error); } finally { end(controller); }
  }
  async function reload(reset: boolean) {
    const controller = begin(); if (!controller) return;
    try {
      const envelope = await api.loadMapping(state.document.figureId, controller.signal);
      if (controller.signal.aborted) return;
      // Confirm after the read, so edits made while it was pending are also protected.
      if ((hasUnsavedChanges(current.current) || reset) && !confirmDiscard(reset ? "Start a new empty draft from the current authoritative source? Current local work will be replaced. Saved history remains unchanged." : "Replace local edits with the current saved revision?")) return;
      dispatch({ type: "replaceEnvelope", envelope });
      if (reset) dispatch({ type: "resetToSource" });
      setAuthenticationLost(false); setHistoryNotice("");
    } catch (error) { problem(error); } finally { end(controller); }
  }
  async function listHistory(before?: number) {
    const controller = begin(); if (!controller) return;
    try { const result = await api.listRevisions(state.document.figureId, before, controller.signal); if (!controller.signal.aborted) setHistory(result); }
    catch (error) { problem(error); } finally { end(controller); }
  }
  async function loadHistory(revisionId: string) {
    const controller = begin(); if (!controller) return;
    try {
      const old = await api.loadRevision(state.document.figureId, revisionId, controller.signal);
      if (controller.signal.aborted) return;
      const envelope = await api.loadMapping(state.document.figureId, controller.signal);
      if (controller.signal.aborted) return;
      dispatch({ type: "serverChecked", envelope });
      if (old.sourceConflict) { setHistoryNotice(`Revision ${old.revision.revisionId} belongs to an older source. Historical checksum: ${old.revision.checksum}. Geometry and historical approval cannot be used on the current drawing.`); return; }
      if (envelope.sourceConflict || !matchesSource(old.revision.document, envelope.source)) { setHistoryNotice("The source changed while loading this revision. Historical geometry was not loaded; local work is retained."); return; }
      if (hasUnsavedChanges(current.current) && !confirmDiscard("Replace unsaved work and any open ring with this saved revision as a NEW draft?")) return;
      dispatch({ type: "loadDraft", document: old.revision.document, current: envelope }); setHistoryNotice("Loaded as a new unsaved draft. No approval is inherited; saving appends a revision.");
    } catch (error) { problem(error); } finally { end(controller); }
  }
  function setTool(tool: Tool) {
    if (!enabled) return;
    if (state.openRing) { dispatch({ type: "setTool", tool }); return; }
    if (tool === "polygon") dispatch({ type: "startRing", kind: "polygon", regionId: crypto.randomUUID() });
    else if (tool === "hole") dispatch({ type: "startRing", kind: "hole", regionId: state.selectedRegion ?? "" });
    else dispatch({ type: "setTool", tool });
  }
  function keyboard(event: KeyboardEvent) {
    if ((event.target as HTMLElement).closest("input,textarea,select,[contenteditable=true]")) return;
    if (!enabled) return;
    const key = event.key.toLowerCase();
    if ((event.ctrlKey || event.metaKey) && key === "s") { event.preventDefault(); void save(); return; }
    if ((event.ctrlKey || event.metaKey) && key === "z") { event.preventDefault(); dispatch({ type: event.shiftKey ? "redo" : "undo" }); return; }
    if ((event.ctrlKey || event.metaKey) && key === "y") { event.preventDefault(); dispatch({ type: "redo" }); return; }
    if (event.ctrlKey || event.metaKey || event.altKey) return;
    if (key === "escape") { event.preventDefault(); dispatch({ type: "cancelRing" }); }
    else if (key === "enter" && state.openRing) { event.preventDefault(); dispatch({ type: "closeRing" }); }
    else if (key === "delete" && state.selectedVertex) { event.preventDefault(); dispatch({ type: "removeVertex", ...state.selectedVertex }); }
    else { const tool = tools.find(t => t.key === key); if (tool) { event.preventDefault(); setTool(tool.tool); } }
  }
  return <main className={styles.editor} data-testid="mapping-editor" onKeyDown={keyboard}>
    <h1>Map {state.source.figure.name}</h1>
    {drawingApi && <section aria-label="Private PNG source">
      <p>Current drawing version: {state.source.drawing?.fileVersion ?? "none"}. PNG limit: 20 MiB, 40 million pixels, 16,384 pixels per side.</p>
      <label>Replacement PNG <input type="file" accept="image/png,.png" disabled={!authority.canUploadDrawing || authenticationLost || busy || incomingChanged || !!pendingUpload} onChange={event => setReplacementFile(event.target.files?.[0] ?? null)} /></label>
      <button disabled={!authority.canUploadDrawing || authenticationLost || busy || incomingChanged || !replacementFile || !!pendingUpload} onClick={() => void uploadReplacement()}>Upload replacement PNG</button>
      {pendingUpload && <button disabled={!authority.canUploadDrawing || authenticationLost || busy || incomingChanged} onClick={() => void uploadReplacement(true)}>Retry PNG verification</button>}
      <button disabled={busy || incomingChanged} onClick={() => void selectCurrentDrawing()}>Select current drawing version</button>
      {uploadNotice && <p>{uploadNotice}</p>}
    </section>}
    <p role="status" aria-live="polite">{state.sourceConflict || state.saveStatus === "conflict" ? "Conflict" : state.saveStatus === "saving" ? "Saving" : state.saveStatus === "error" ? `Save failed${unsaved ? " · Unsaved" : ""}` : unsaved ? "Unsaved" : state.revision ? "Saved" : "New draft"}{approved ? " · Approved revision" : ""}</p>
    {incomingChanged && <div className={styles.warning}>A new authoritative document was received. Local work is retained.<button disabled={busy} onClick={() => { if (!unsaved || confirmDiscard("Replace unsaved work with the requested document?")) { dispatch({ type: "replaceEnvelope", envelope: initial }); setAcceptedInput(JSON.stringify(initial)); setHistory(null); setHistoryNotice(""); setReadyImage(null); setSelectedDrawing(null); setPendingUpload(null); setReplacementFile(null); setUploadNotice(""); } }}>{requestedFigureChanged ? "Switch to requested figure" : "Load requested document"}</button></div>}
    {(!sourceImage || readyImage !== imageKey || authenticationLost) && <p className={styles.warning}>{authenticationLost ? "Session or permission unavailable. Editing is disabled; sign in again and reload to verify access." : "Editing requires a successfully loaded authoritative PNG matching this document's identity, hash and dimensions."}</p>}
    {state.sourceConflict && <p className={styles.warning}>Source conflict. Historical geometry and approval are retained in saved history but cannot be used on the current drawing.</p>}
    <div className={styles.toolbar} role="toolbar" aria-label="Mapping tools">{tools.map(t => <button key={t.tool} disabled={!enabled} aria-pressed={state.tool === t.tool} onClick={() => setTool(t.tool)}>{t.label}</button>)}</div>
    <p id="mapping-instructions">Select an exact occurrence. Label: drag a rectangle or enter image coordinates. Polygon/Hole: click vertices; Enter or the first vertex closes; Escape cancels. Select a region to drag vertices; arrow keys move by 1 pixel (Shift: 10); Delete removes a vertex only if three remain. Pan: drag. Ctrl/Cmd+Z undoes geometry, Shift+Z redoes; Ctrl/Cmd+S saves.</p>
    <div className={styles.actions}>
      <button disabled={!enabled || !state.history.length || !!state.openRing} onClick={() => dispatch({ type: "undo" })}>Undo geometry</button>
      <button disabled={!enabled || !state.future.length || !!state.openRing} onClick={() => dispatch({ type: "redo" })}>Redo geometry</button>
      <button disabled={!enabled || !state.openRing} onClick={() => dispatch({ type: "closeRing" })}>Close ring</button>
      <button disabled={!state.openRing} onClick={() => dispatch({ type: "cancelRing" })}>Cancel unfinished ring</button>
      <button disabled={!enabled || !state.dirty || !!state.openRing || !!state.labelInput || busy} onClick={() => void save()}>Save draft</button>
      <button disabled={!approveEnabled} onClick={() => void approve()}>Approve exact saved revision</button>
      <button disabled={busy} onClick={() => void reload(false)}>Reload saved revision</button>
      <button disabled={busy || !authority.canEdit || !usableSource(state.source)} onClick={() => void reload(true)}>Reset to current source</button>
      <button disabled={busy || authenticationLost} onClick={() => void listHistory()}>Saved revisions</button>
    </div>
    {state.message && <p role="alert" className={styles.warning}>{state.message}</p>}
    {state.fieldIssues.length > 0 && <ul className={styles.issues} aria-label="Mapping field issues">{state.fieldIssues.map((issue, index) => <li key={index}>{issue.path}: {issue.message} ({issue.code})</li>)}</ul>}
    {history && <section aria-label="Saved revision history"><p>Load a compatible revision as a new draft. History stays immutable.</p><ul>{history.items.map(item => <li key={item.revisionId}>Revision {item.revisionNumber} · {item.createdAt} · {item.checksum}{item.approval ? " · historically reviewed" : ""} <button disabled={busy} onClick={() => void loadHistory(item.revisionId)}>Load revision {item.revisionNumber} as new draft</button></li>)}</ul>{history.nextBefore !== null && <button disabled={busy} onClick={() => void listHistory(history.nextBefore!)}>Older revisions</button>}</section>}
    {historyNotice && <p className={styles.warning}>{historyNotice}</p>}
    <div className={styles.workspace}>
      {sourceImage ? <MappingCanvas key={imageKey} state={state} drawing={sourceImage} enabled={enabled} dispatch={dispatch} onImageReady={ready => setReadyImage(ready ? imageKey : null)} /> : <p>Authoritative drawing unavailable for this mapping.</p>}
      <MappingInspector state={state} disabled={!enabled} canMap={authority.canMap} dispatch={dispatch} />
    </div>
  </main>;
}
