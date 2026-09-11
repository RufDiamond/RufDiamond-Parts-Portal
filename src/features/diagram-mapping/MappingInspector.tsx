"use client";

import { type Dispatch } from "react";
import type { OccurrenceMapping } from "@rufdiamond/contracts";
import type { EditorAction, EditorState } from "./editor-state";
import styles from "./mapping-editor.module.css";

export function occurrenceReadiness(o: OccurrenceMapping): string[] {
  return [...(!o.figurePartId ? ["Unmapped row"] : []), ...(!o.labelRegion ? ["Missing label"] : []), ...(!o.regions.length ? ["Missing component shape"] : []), ...(!o.evidence.trim() ? ["Missing source evidence"] : [])];
}
function LabelFields({ occurrence, disabled, dispatch, state }: { occurrence: OccurrenceMapping; disabled: boolean; dispatch: Dispatch<EditorAction>; state: EditorState }) {
  const values = state.labelInput ?? { x: "", y: "", width: "", height: "" };
  return <fieldset disabled={disabled}><legend>Label rectangle in original image pixels</legend>
    <p>{occurrence.labelRegion ? `Current: ${occurrence.labelRegion.x}, ${occurrence.labelRegion.y}; ${occurrence.labelRegion.width} × ${occurrence.labelRegion.height}` : "No label rectangle established"}</p>
    {(["x", "y", "width", "height"] as const).map(key => <label key={key}>Label {key}<input type="number" value={values[key]} onChange={event => dispatch({ type: "setLabelInput", values: { ...values, [key]: event.target.value } })} /></label>)}
    <button disabled={Object.values(values).some(v => !v.trim())} onClick={() => dispatch({ type: "applyLabelInput" })}>Apply label rectangle</button>
    <button disabled={!state.labelInput} onClick={() => dispatch({ type: "discardLabelInput" })}>Discard label input</button>
    <button onClick={() => dispatch({ type: "setLabel", label: null })}>Remove label rectangle</button>
  </fieldset>;
}
export function MappingInspector({ state, disabled, canMap, dispatch }: { state: EditorState; disabled: boolean; canMap: boolean; dispatch: Dispatch<EditorAction> }) {
  const selected = state.document.occurrences.find(o => o.calloutId === state.selectedOccurrence);
  const row = state.source.rows.find(r => r.id === selected?.figurePartId);
  return <aside className={styles.inspector} aria-label="Mapping inspector">
    <label>Exact occurrence<select value={state.selectedOccurrence ?? ""} onChange={event => dispatch({ type: "selectOccurrence", calloutId: event.target.value })}>
      {state.document.occurrences.map(o => <option key={o.calloutId} value={o.calloutId}>{o.refNo} — {o.calloutId}</option>)}
    </select></label>
    {selected ? <>
      <p>Reference {selected.refNo} · occurrence {selected.calloutId}</p>
      <p>{row ? `${row.partNumber} — ${row.description} (part ${row.partId}; row ${row.id})` : "No established parts row. Resolve identity from the source."}</p>
      <p>{state.sourceConflict ? "Source conflict" : occurrenceReadiness(selected).join(" · ") || "Ready for review"}</p>
      <label>Associated parts row<select disabled={disabled || !canMap} value={selected.figurePartId ?? ""} onChange={event => dispatch({ type: "setAssociation", figurePartId: event.target.value || null })}>
        <option value="">Unresolved — no established association</option>
        {state.source.rows.map(r => <option key={r.id} value={r.id}>{r.partNumber} — {r.description} — row {r.id}</option>)}
      </select></label>
      <label>Source evidence<textarea disabled={disabled} value={selected.evidence} onChange={event => dispatch({ type: "setEvidence", evidence: event.target.value })} /></label>
      <LabelFields state={state} key={selected.calloutId} occurrence={selected} disabled={disabled || !!state.openRing} dispatch={dispatch} />
      <fieldset disabled={disabled}><legend>Component polygons</legend>
        {selected.regions.map((r, index) => <label key={r.id}><input type="radio" name="selected-region" checked={state.selectedRegion === r.id} onChange={() => dispatch({ type: "selectRegion", regionId: r.id })} />Region {index + 1} · {r.outer.length} vertices · {r.holes.length} holes</label>)}
        <button onClick={() => dispatch({ type: "startRing", kind: "polygon", regionId: crypto.randomUUID() })} disabled={!!state.openRing}>Add region</button>
        <button onClick={() => state.selectedRegion && dispatch({ type: "startRing", kind: "hole", regionId: state.selectedRegion })} disabled={!state.selectedRegion || !!state.openRing}>Add hole</button>
        <button onClick={() => state.selectedRegion && dispatch({ type: "startRing", kind: "redraw", regionId: state.selectedRegion })} disabled={!state.selectedRegion || !!state.openRing}>Redraw selected region</button>
        <button onClick={() => state.selectedRegion && dispatch({ type: "deleteRegion", regionId: state.selectedRegion })} disabled={!state.selectedRegion || !!state.openRing}>Remove selected region</button>
        <button onClick={() => state.selectedVertex && dispatch({ type: "removeVertex", ...state.selectedVertex })} disabled={!state.selectedVertex || !!state.openRing}>Remove selected vertex</button>
      </fieldset>
    </> : <p>No source occurrences. Mapping cannot be approved.</p>}
    <ul aria-label="Occurrence completeness">{state.document.occurrences.map(o => <li key={o.calloutId}>{o.refNo} ({o.calloutId}): {state.sourceConflict ? "Source conflict" : occurrenceReadiness(o).join(", ") || "Ready for review"}</li>)}</ul>
    {state.source.occurrences.filter(o => !state.document.occurrences.some(d => d.calloutId === o.id)).map(o => <p key={o.id}>Unmapped source occurrence: {o.refNo} ({o.id}). Reset to current source to include missing occurrences.</p>)}
  </aside>;
}
