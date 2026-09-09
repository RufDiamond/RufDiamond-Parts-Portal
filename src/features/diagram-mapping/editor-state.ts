import type { DiagramMappingDocument, ImagePoint, MappingEditorDocument, MappingIssue, MappingRevision, MappingSource, OccurrenceMapping } from "@rufdiamond/contracts";
import { validateMappingGeometry } from "@rufdiamond/contracts/diagram-geometry";

export type Tool = "select" | "label" | "polygon" | "hole" | "pan";
type Geometry = Pick<OccurrenceMapping, "calloutId" | "labelRegion" | "regions">[];
type OpenRing = { kind: "polygon" | "hole" | "redraw"; regionId: string; points: ImagePoint[] };
export type Vertex = { regionId: string; holeIndex: number | null; index: number };
export type LabelInput = { x: string; y: string; width: string; height: string };
export type EditorState = {
  document: DiagramMappingDocument; checkpoint: DiagramMappingDocument; version: number;
  revision: MappingRevision | null; source: MappingSource; sourceConflict: boolean;
  tool: Tool; selectedOccurrence: string | null; selectedRegion: string | null; selectedVertex: Vertex | null;
  openRing: OpenRing | null; labelInput: LabelInput | null; history: Geometry[]; future: Geometry[]; dirty: boolean; forceDraft: boolean;
  saveStatus: "idle" | "saving" | "saved" | "error" | "conflict"; fieldIssues: MappingIssue[]; message: string;
  pendingSave: { token: string; document: DiagramMappingDocument } | null;
};
export type EditorAction =
  | { type: "setTool"; tool: Tool }
  | { type: "selectOccurrence"; calloutId: string }
  | { type: "selectRegion"; regionId: string | null }
  | { type: "selectVertex"; vertex: Vertex | null }
  | { type: "startRing"; kind: OpenRing["kind"]; regionId: string }
  | { type: "addPoint"; point: ImagePoint }
  | { type: "closeRing" | "cancelRing" | "undo" | "redo" | "resetToSource" }
  | ({ type: "moveVertex"; point: ImagePoint } & Vertex)
  | ({ type: "removeVertex" } & Vertex)
  | { type: "deleteRegion"; regionId: string }
  | { type: "setLabel"; label: OccurrenceMapping["labelRegion"] }
  | { type: "setLabelInput"; values: LabelInput }
  | { type: "applyLabelInput" | "discardLabelInput" }
  | { type: "setEvidence"; evidence: string }
  | { type: "setAssociation"; figurePartId: string | null }
  | { type: "saveStarted"; token: string }
  | { type: "saveSucceeded"; token: string; revision: MappingRevision }
  | { type: "saveFailed"; token?: string; message: string; conflict?: boolean; issues?: MappingIssue[] }
  | { type: "serverChecked"; envelope: MappingEditorDocument }
  | { type: "loadDraft"; document: DiagramMappingDocument; current: MappingEditorDocument }
  | { type: "replaceEnvelope"; envelope: MappingEditorDocument }
  | { type: "approvalSucceeded"; revision: MappingRevision };

const equal = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
const geometry = (d: DiagramMappingDocument): Geometry => d.occurrences.map(({ calloutId, labelRegion, regions }) => ({ calloutId, labelRegion, regions }));
const applyGeometry = (d: DiagramMappingDocument, value: Geometry): DiagramMappingDocument => ({ ...d, occurrences: d.occurrences.map(o => ({ ...o, ...value.find(g => g.calloutId === o.calloutId) })) });
export function usableSource(source: MappingSource): boolean {
  const d = source.drawing;
  return !!d && d.validationStatus === "valid" && d.mediaType === "image/png" && !!d.width && !!d.height && d.width <= 16384 && d.height <= 16384 && d.width * d.height <= 40_000_000;
}
export function matchesSource(d: DiagramMappingDocument, s: MappingSource): boolean {
  return usableSource(s) && d.figureId === s.figure.id && d.drawingFileId === s.drawing!.id && d.drawingSha256 === s.drawing!.sha256 && d.imageWidth === s.drawing!.width && d.imageHeight === s.drawing!.height && d.catalogueBindingSha256 === s.catalogueBindingSha256;
}
export function createEditorState(input: MappingEditorDocument): EditorState {
  const envelope = structuredClone(input);
  return { document: envelope.document, checkpoint: envelope.document, version: envelope.version, revision: envelope.revision, source: envelope.source, sourceConflict: envelope.sourceConflict || !matchesSource(envelope.document, envelope.source), tool: "select", selectedOccurrence: envelope.document.occurrences[0]?.calloutId ?? null, selectedRegion: null, selectedVertex: null, openRing: null, labelInput: null, history: [], future: [], dirty: false, forceDraft: false, saveStatus: "idle", message: "", fieldIssues: [], pendingSave: null };
}
export const hasUnsavedChanges = (state: EditorState) => state.dirty || !!state.openRing || !!state.labelInput;
const fail = (s: EditorState, message: string, fieldIssues: MappingIssue[] = s.fieldIssues): EditorState => ({ ...s, message, fieldIssues });
function changed(s: EditorState, document: DiagramMappingDocument, record = true): EditorState {
  const issues = validateMappingGeometry(document);
  if (issues.length) return fail(s, issues[0].message, issues);
  if (equal(document, s.document)) return { ...s, fieldIssues: [], message: "" };
  return { ...s, document, dirty: s.forceDraft || !equal(document, s.checkpoint), history: record ? [...s.history, geometry(s.document)].slice(-100) : s.history, future: record ? [] : s.future, fieldIssues: [], message: "", saveStatus: s.pendingSave ? "saving" : s.saveStatus === "conflict" ? "conflict" : "idle" };
}
function updateOccurrence(s: EditorState, fn: (o: OccurrenceMapping) => OccurrenceMapping, record = true) {
  return changed(s, { ...s.document, occurrences: s.document.occurrences.map(o => o.calloutId === s.selectedOccurrence ? fn(o) : o) }, record);
}
export function editorReducer(s: EditorState, a: EditorAction): EditorState {
  switch (a.type) {
    case "replaceEnvelope": return s.pendingSave ? s : createEditorState(a.envelope);
    case "saveStarted": return s.pendingSave || s.openRing || s.labelInput || s.sourceConflict ? s : { ...s, pendingSave: { token: a.token, document: structuredClone(s.document) }, saveStatus: "saving", message: "", fieldIssues: [] };
    case "saveSucceeded": {
      if (s.pendingSave?.token !== a.token || a.revision.document.figureId !== s.document.figureId) return s;
      // A reassociation changes server binding; keep work made after the request started.
      const document = equal(s.document, s.pendingSave.document) ? structuredClone(a.revision.document) : { ...s.document, catalogueBindingSha256: a.revision.document.catalogueBindingSha256 };
      return { ...s, document, checkpoint: structuredClone(a.revision.document), version: a.revision.version, revision: a.revision, pendingSave: null, forceDraft: false, dirty: !equal(document, a.revision.document), saveStatus: "saved", message: "" };
    }
    case "saveFailed": return a.token && s.pendingSave?.token !== a.token ? s : { ...s, pendingSave: null, saveStatus: a.conflict ? "conflict" : "error", message: a.message, fieldIssues: a.issues ?? [] };
    case "serverChecked": {
      if (a.envelope.document.figureId !== s.document.figureId) return s;
      const conflict = a.envelope.sourceConflict || a.envelope.version !== s.version || !matchesSource(s.document, a.envelope.source);
      return { ...s, source: structuredClone(a.envelope.source), sourceConflict: conflict, ...(conflict ? { saveStatus: "conflict" as const, message: "The authoritative source or revision changed. Reconcile or reload explicitly; local work is preserved." } : {}) };
    }
    case "approvalSucceeded": return !hasUnsavedChanges(s) && !s.sourceConflict && s.revision?.revisionId === a.revision.revisionId && s.version === a.revision.version ? { ...s, revision: a.revision } : s;
    case "loadDraft": {
      if (s.pendingSave || a.current.sourceConflict || !matchesSource(a.document, a.current.source)) return fail(s, "This revision belongs to a different source. It cannot be overlaid or loaded onto the current drawing.");
      const next = createEditorState(a.current);
      return { ...next, document: structuredClone(a.document), revision: null, dirty: true, forceDraft: true };
    }
    case "resetToSource": {
      if (s.pendingSave || !usableSource(s.source)) return fail(s, "A validated authoritative PNG is required before resetting.");
      const drawing = s.source.drawing!;
      const document: DiagramMappingDocument = { schemaVersion: 1, figureId: s.source.figure.id, drawingFileId: drawing.id, drawingSha256: drawing.sha256, imageWidth: drawing.width!, imageHeight: drawing.height!, catalogueBindingSha256: s.source.catalogueBindingSha256, occurrences: s.source.occurrences.map(o => ({ calloutId: o.id, figurePartId: o.figurePartId, refNo: o.refNo, labelRegion: null, regions: [], evidence: "" })) };
      return { ...s, document, sourceConflict: false, history: [], future: [], openRing: null, labelInput: null, selectedOccurrence: document.occurrences[0]?.calloutId ?? null, selectedRegion: null, selectedVertex: null, dirty: true, forceDraft: true, saveStatus: "idle", fieldIssues: [], message: "New draft from current source. Prior saved revisions remain unchanged." };
    }
    case "setTool": return s.openRing ? fail(s, "Finish or explicitly cancel the open ring before changing tools.") : { ...s, tool: a.tool, selectedVertex: null, message: "" };
    case "selectOccurrence": return s.openRing || s.labelInput ? fail(s, "Finish or cancel the open ring; apply or discard label input before changing occurrence.") : s.document.occurrences.some(o => o.calloutId === a.calloutId) ? { ...s, selectedOccurrence: a.calloutId, selectedRegion: null, selectedVertex: null } : s;
    case "selectRegion": return s.openRing ? s : { ...s, selectedRegion: a.regionId, selectedVertex: null };
    case "selectVertex": return { ...s, selectedVertex: a.vertex, selectedRegion: a.vertex?.regionId ?? s.selectedRegion };
    case "cancelRing": return { ...s, openRing: null, fieldIssues: [], message: "" };
    case "discardLabelInput": return { ...s, labelInput: null, fieldIssues: [], message: "" };
  }
  if (s.sourceConflict || !usableSource(s.source) || s.saveStatus === "conflict") return fail(s, "Resolve the source or revision conflict before editing.");
  switch (a.type) {
    case "setLabelInput": return { ...s, labelInput: a.values };
    case "applyLabelInput": {
      if (!s.labelInput || Object.values(s.labelInput).some(v => !v.trim())) return fail(s, "Enter all four label coordinates and dimensions.");
      const next = editorReducer(s, { type: "setLabel", label: { x: Number(s.labelInput.x), y: Number(s.labelInput.y), width: Number(s.labelInput.width), height: Number(s.labelInput.height) } });
      return next.fieldIssues.length ? next : { ...next, labelInput: null };
    }
    case "setEvidence": return updateOccurrence(s, o => ({ ...o, evidence: a.evidence }), false);
    case "setAssociation": return a.figurePartId !== null && !s.source.rows.some(row => row.id === a.figurePartId) ? s : updateOccurrence(s, o => ({ ...o, figurePartId: a.figurePartId }), false);
    case "startRing": {
      if (s.openRing || !s.selectedOccurrence) return s;
      if (a.kind !== "polygon" && !s.document.occurrences.find(o => o.calloutId === s.selectedOccurrence)?.regions.some(r => r.id === a.regionId)) return fail(s, "Select a component region first.");
      return { ...s, tool: a.kind === "hole" ? "hole" : "polygon", openRing: { kind: a.kind, regionId: a.regionId, points: [] }, selectedRegion: a.regionId, selectedVertex: null, message: "", fieldIssues: [] };
    }
    case "addPoint": {
      if (!s.openRing) return s;
      const [x, y] = a.point;
      if (!Number.isFinite(x) || !Number.isFinite(y) || x < 0 || y < 0 || x > s.document.imageWidth || y > s.document.imageHeight || s.openRing.points.length >= 512) return fail(s, "Vertices must lie inside the image; a ring supports at most 512 vertices.");
      return { ...s, openRing: { ...s.openRing, points: [...s.openRing.points, a.point] }, message: "", fieldIssues: [] };
    }
    case "closeRing": {
      const ring = s.openRing; if (!ring) return s;
      const next = updateOccurrence(s, o => ({ ...o, regions: ring.kind === "polygon" ? [...o.regions, { id: ring.regionId, outer: ring.points, holes: [] }] : o.regions.map(r => r.id !== ring.regionId ? r : ring.kind === "hole" ? { ...r, holes: [...r.holes, ring.points] } : { ...r, outer: ring.points }) }));
      return next.document === s.document ? next : { ...next, openRing: null };
    }
    case "setLabel": return s.openRing ? s : updateOccurrence(s, o => ({ ...o, labelRegion: a.label }));
    case "deleteRegion": return s.openRing ? s : { ...updateOccurrence(s, o => ({ ...o, regions: o.regions.filter(r => r.id !== a.regionId) })), selectedRegion: null, selectedVertex: null };
    case "moveVertex":
    case "removeVertex": {
      if (s.openRing) return s;
      return updateOccurrence(s, o => ({ ...o, regions: o.regions.map(r => {
        if (r.id !== a.regionId) return r;
        const ring = a.holeIndex === null ? r.outer : r.holes[a.holeIndex];
        if (!ring || !ring[a.index] || (a.type === "removeVertex" && ring.length <= 3)) return r;
        const edited = a.type === "removeVertex" ? ring.filter((_, i) => i !== a.index) : ring.map((p, i) => i === a.index ? a.point : p);
        return a.holeIndex === null ? { ...r, outer: edited } : { ...r, holes: r.holes.map((h, i) => i === a.holeIndex ? edited : h) };
      }) }));
    }
    case "undo":
    case "redo": {
      if (s.openRing) return fail(s, "Finish or cancel the open ring before undo or redo.");
      const stack = a.type === "undo" ? s.history : s.future; if (!stack.length) return s;
      const next = changed(s, applyGeometry(s.document, stack[stack.length - 1]), false);
      return a.type === "undo" ? { ...next, history: s.history.slice(0, -1), future: [...s.future, geometry(s.document)], selectedVertex: null } : { ...next, future: s.future.slice(0, -1), history: [...s.history, geometry(s.document)], selectedVertex: null };
    }
  }
}
