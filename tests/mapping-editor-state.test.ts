import { describe, expect, it } from "vitest";
import type { MappingEditorDocument, MappingRevision } from "@rufdiamond/contracts";
import { createEditorState, editorReducer, hasUnsavedChanges } from "../src/features/diagram-mapping/editor-state";

export function editorFixture(): MappingEditorDocument {
  return { version: 1, revision: null, sourceConflict: false,
    document: { schemaVersion: 1, figureId: "figure", drawingFileId: "drawing", drawingSha256: "a".repeat(64), imageWidth: 640, imageHeight: 480, catalogueBindingSha256: "b".repeat(64), occurrences: [{ calloutId: "one", figurePartId: "row", refNo: "7", labelRegion: null, regions: [], evidence: "" }] },
    source: { figure: { id: "figure", name: "Frame", version: 1, variantId: "variant", modelId: "model" }, drawing: { id: "drawing", filename: "frame.png", sha256: "a".repeat(64), width: 640, height: 480, fileVersion: 1, mediaType: "image/png", validationStatus: "valid" }, catalogueBindingSha256: "b".repeat(64), rows: [{ id: "row", partId: "part", partNumber: "P1", description: "Bracket", qty: 1, refLabels: ["7"], version: 1 }], occurrences: [{ id: "one", figurePartId: "row", refNo: "7", version: 1 }] } };
}
const start = () => createEditorState(editorFixture());
function triangle(state = start(), kind: "polygon" | "hole" = "polygon", id = "region") {
  state = editorReducer(state, { type: "startRing", kind, regionId: id });
  for (const point of (kind === "hole" ? [[15, 15], [20, 15], [15, 20]] : [[10, 10], [100, 10], [10, 100]]) as [number, number][]) state = editorReducer(state, { type: "addPoint", point });
  return state;
}
describe("mapping editor geometry and checkpoints", () => {
  it("commits valid rings immutably and preserves an invalid open ring", () => {
    const input = editorFixture(); const original = structuredClone(input);
    const open = triangle(createEditorState(input));
    expect(hasUnsavedChanges(open)).toBe(true);
    const closed = editorReducer(open, { type: "closeRing" });
    expect(closed.document.occurrences[0].regions[0].outer).toEqual([[10, 10], [100, 10], [10, 100]]);
    expect(closed.dirty).toBe(true); expect(input).toEqual(original);
    let invalid = editorReducer(start(), { type: "startRing", kind: "polygon", regionId: "bad" });
    invalid = editorReducer(invalid, { type: "addPoint", point: [1, 1] });
    const rejected = editorReducer(invalid, { type: "closeRing" });
    expect(rejected.openRing).toEqual(invalid.openRing); expect(rejected.fieldIssues.length).toBeGreaterThan(0);
    expect(rejected.document.occurrences[0].regions).toEqual([]);
  });
  it("does not discard rings on tool or occurrence change and cancels only explicitly", () => {
    const open = triangle();
    expect(editorReducer(open, { type: "setTool", tool: "pan" }).openRing).toEqual(open.openRing);
    expect(editorReducer(open, { type: "selectOccurrence", calloutId: "other" }).selectedOccurrence).toBe("one");
    const cancel = editorReducer(open, { type: "cancelRing" });
    expect(cancel.openRing).toBeNull(); expect(hasUnsavedChanges(cancel)).toBe(false);
  });
  it("adds holes and regions, rejects invalid vertex edits and supports region redraw", () => {
    let state = editorReducer(triangle(), { type: "closeRing" });
    state = editorReducer(triangle(state, "hole"), { type: "closeRing" });
    expect(state.document.occurrences[0].regions[0].holes).toEqual([[[15, 15], [20, 15], [15, 20]]]);
    const invalid = editorReducer(state, { type: "moveVertex", regionId: "region", holeIndex: null, index: 0, point: [-1, 0] });
    expect(invalid.document).toEqual(state.document); expect(invalid.fieldIssues.length).toBeGreaterThan(0);
    expect(editorReducer(state, { type: "removeVertex", regionId: "region", holeIndex: null, index: 0 }).document).toEqual(state.document);
    state = editorReducer(triangle(state, "polygon", "second"), { type: "closeRing" });
    expect(state.document.occurrences[0].regions).toHaveLength(2);
    const redraw = editorReducer(state, { type: "startRing", kind: "redraw", regionId: "region" });
    expect(redraw.document).toEqual(state.document);
    expect(editorReducer(redraw, { type: "cancelRing" }).document).toEqual(state.document);
    expect(editorReducer(state, { type: "deleteRegion", regionId: "second" }).document.occurrences[0].regions).toHaveLength(1);
  });
  it("undoes geometry only, preserves evidence and supports undo after save", () => {
    let state = editorReducer(triangle(), { type: "closeRing" });
    state = editorReducer(state, { type: "setEvidence", evidence: "Checked original" });
    const revision: MappingRevision = { revisionId: "saved", version: 2, checksum: "c".repeat(64), document: state.document, approval: null };
    state = editorReducer(state, { type: "saveStarted", token: "one" });
    state = editorReducer(state, { type: "saveSucceeded", token: "one", revision });
    expect(state.dirty).toBe(false);
    state = editorReducer(state, { type: "undo" });
    expect(state.document.occurrences[0].regions).toEqual([]); expect(state.document.occurrences[0].evidence).toBe("Checked original"); expect(state.dirty).toBe(true);
    state = editorReducer(state, { type: "redo" }); expect(state.dirty).toBe(false);
  });
  it("preserves edits made during a slow save and ignores stale success/failure", () => {
    let state = editorReducer(triangle(), { type: "closeRing" });
    const snapshot = state.document;
    state = editorReducer(state, { type: "saveStarted", token: "one" });
    state = editorReducer(state, { type: "setEvidence", evidence: "Later edit" });
    const revision = { revisionId: "saved", version: 2, checksum: "c".repeat(64), document: snapshot, approval: null };
    expect(editorReducer(state, { type: "saveSucceeded", token: "old", revision })).toBe(state);
    state = editorReducer(state, { type: "saveSucceeded", token: "one", revision });
    expect(state.document.occurrences[0].evidence).toBe("Later edit"); expect(state.dirty).toBe(true); expect(state.version).toBe(2);
    expect(editorReducer(state, { type: "saveFailed", token: "old", message: "Old failure" })).toBe(state);
    const failed = editorReducer(state, { type: "saveFailed", message: "Network unavailable" });
    expect(failed.document).toEqual(state.document); expect(failed.dirty).toBe(true); expect(failed.saveStatus).toBe("error");
  });
  it("blocks old-source edits, preserves revision and requires explicit reset with fresh source", () => {
    const envelope = editorFixture(); envelope.sourceConflict = true; envelope.source.drawing!.id = "new";
    let state = createEditorState(envelope);
    expect(editorReducer(state, { type: "startRing", kind: "polygon", regionId: "x" }).openRing).toBeNull();
    state = editorReducer(state, { type: "resetToSource" });
    expect(state.document.drawingFileId).toBe("new"); expect(state.sourceConflict).toBe(false); expect(state.dirty).toBe(true); expect(state.history).toEqual([]);
  });
  it("carries server canonical binding through slow-save edits and undo/redo without restoring old preconditions", () => {
    let state = editorReducer(triangle(), { type: "closeRing" });
    state = editorReducer(state, { type: "setAssociation", figurePartId: null });
    state = editorReducer(state, { type: "saveStarted", token: "one" });
    const saved = { ...state.document, catalogueBindingSha256: "d".repeat(64) };
    state = editorReducer(state, { type: "setEvidence", evidence: "Later" });
    state = editorReducer(state, { type: "saveSucceeded", token: "one", revision: { revisionId: "saved", version: 2, checksum: "c".repeat(64), document: saved, approval: null } });
    expect(state.document.catalogueBindingSha256).toBe("d".repeat(64)); expect(state.document.occurrences[0].evidence).toBe("Later");
    state = editorReducer(state, { type: "undo" }); state = editorReducer(state, { type: "redo" });
    expect(state.version).toBe(2); expect(state.document.catalogueBindingSha256).toBe("d".repeat(64)); expect(state.document.occurrences[0].figurePartId).toBeNull();
  });
  it("loads compatible history as a dirty new draft with current precondition and no approval", () => {
    const original = editorFixture(); const old = editorReducer(triangle(), { type: "closeRing" }).document;
    const current: MappingEditorDocument = { ...original, version: 4, revision: { revisionId: "head", version: 4, checksum: "c".repeat(64), document: original.document, approval: { reviewerId: "actor", reviewedAt: "today" } } };
    const next = editorReducer(createEditorState(current), { type: "loadDraft", document: old, current });
    expect(next.document).toEqual(old); expect(next.version).toBe(4); expect(next.revision).toBeNull(); expect(next.dirty).toBe(true); expect(next.history).toEqual([]);
    const blocked = editorReducer(next, { type: "loadDraft", document: { ...old, drawingFileId: "old-source" }, current });
    expect(blocked.document).toEqual(next.document); expect(blocked.message).toContain("different source");
  });
});
