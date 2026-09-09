// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { MappingEditorDocument, MappingRevision } from "@rufdiamond/contracts";
import { MappingEditor } from "../src/features/diagram-mapping/MappingEditor";
import { MappingApiError, createMappingApiClient, type MappingApiClient } from "../src/features/diagram-mapping/api-client";

afterEach(cleanup);
const fixture = (): MappingEditorDocument => ({ version: 1, revision: null, sourceConflict: false, document: { schemaVersion: 1, figureId: "figure", drawingFileId: "drawing", drawingSha256: "a".repeat(64), catalogueBindingSha256: "b".repeat(64), imageWidth: 640, imageHeight: 480, occurrences: [{ calloutId: "one", figurePartId: "row", refNo: "7", labelRegion: null, regions: [], evidence: "" }] }, source: { figure: { id: "figure", name: "Frame", version: 1, variantId: "variant", modelId: "model" }, drawing: { id: "drawing", filename: "frame.png", sha256: "a".repeat(64), width: 640, height: 480, fileVersion: 1, validationStatus: "valid", mediaType: "image/png" }, catalogueBindingSha256: "b".repeat(64), rows: [{ id: "row", partId: "part", partNumber: "P1", description: "Bracket", qty: 1, refLabels: ["7"], version: 1 }], occurrences: [{ id: "one", figurePartId: "row", refNo: "7", version: 1 }] } });
const authority = { canEdit: true, canMap: true, canApprove: true };
const drawing = { figureId: "figure", drawingFileId: "drawing", sha256: "a".repeat(64), width: 640, height: 480, url: "/private/drawing.png" };
const api = (initial: MappingEditorDocument): MappingApiClient => ({ loadMapping: async () => initial, saveMapping: async (_id, version, document) => ({ revisionId: "saved", version: version + 1, checksum: "c".repeat(64), document, approval: null }), approveMapping: async () => { throw new Error("Not expected"); }, listRevisions: async () => ({ items: [], nextBefore: null }), loadRevision: async () => { throw new Error("Not expected"); } });
function loadImage() {
  const image = screen.getByRole("img", { name: "Authoritative drawing" });
  Object.defineProperties(image, { naturalWidth: { configurable: true, value: 640 }, naturalHeight: { configurable: true, value: 480 } });
  fireEvent.load(image);
}
function point(x: number, y: number) {
  const canvas = screen.getByTestId("mapping-canvas");
  Object.defineProperty(canvas, "getScreenCTM", { configurable: true, value: () => ({ inverse: () => ({ a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 }) }) });
  fireEvent.click(canvas, { clientX: x, clientY: y });
}
describe("mapping editor", () => {
  it("keeps the old overlay blocked while an attached drawing's source reload is pending", async () => {
    const initial = fixture(), client = api(initial);
    let finish!: (value: MappingEditorDocument) => void;
    client.loadMapping = async () => new Promise(resolve => { finish = resolve; });
    const drawingApi = {
      createIntent: async () => ({ uploadId: "upload", figureId: "figure", figureVersion: 1, url: "https://storage.test/upload", headers: { "Content-Type": "image/png" as const }, expiresAt: "2026-09-08T23:00:00Z" }),
      uploadFile: async () => {}, finalize: async () => ({ figureId: "figure", figureVersion: 2, drawingFileId: "new", fileVersion: 2, sha256: "e".repeat(64), width: 640, height: 480, bytes: 20, filename: "new.png" }),
      loadDrawing: async () => { throw new Error("Not requested"); },
    };
    render(<MappingEditor initial={initial} drawing={drawing} authority={{ ...authority, canUploadDrawing: true }} api={client} drawingApi={drawingApi} />); loadImage();
    fireEvent.change(screen.getByLabelText("Replacement PNG"), { target: { files: [new File(["png"], "new.png", { type: "image/png" })] } });
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Upload replacement PNG" })));
    expect(screen.queryByTestId("mapping-canvas")).toBeNull();
    await act(async () => finish({ ...initial, sourceConflict: true }));
  });
  it("blocks the old overlay after an uncertain finalization and retains a safe retry", async () => {
    const initial = fixture(), client = api(initial);
    const drawingApi = {
      createIntent: async () => ({ uploadId: "upload", figureId: "figure", figureVersion: 1, url: "https://storage.test/upload", headers: { "Content-Type": "image/png" as const }, expiresAt: "2026-09-08T23:00:00Z" }),
      uploadFile: async () => {}, finalize: async () => { throw new TypeError("Network response lost"); },
      loadDrawing: async () => { throw new Error("Not requested"); },
    };
    render(<MappingEditor initial={initial} drawing={drawing} authority={{ ...authority, canUploadDrawing: true }} api={client} drawingApi={drawingApi} />); loadImage();
    fireEvent.change(screen.getByLabelText("Source evidence"), { target: { value: "Retain" } });
    fireEvent.change(screen.getByLabelText("Replacement PNG"), { target: { files: [new File(["png"], "new.png", { type: "image/png" })] } });
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Upload replacement PNG" })));
    expect(screen.queryByTestId("mapping-canvas")).toBeNull();
    expect((screen.getByLabelText("Source evidence") as HTMLTextAreaElement).value).toBe("Retain");
    expect((screen.getByRole("button", { name: "Retry PNG verification" }) as HTMLButtonElement).disabled).toBe(false);
  });
  it("uploads a replacement and requires confirmation before selecting its current version", async () => {
    const initial = fixture(), client = api(initial), confirmDiscard = vi.fn(() => false);
    let replaced = false;
    const replacement = structuredClone(initial); replacement.sourceConflict = true; replacement.source.figure.version = 2; replacement.source.drawing = { ...initial.source.drawing!, id: "new-drawing", sha256: "e".repeat(64), fileVersion: 2 };
    client.loadMapping = async () => replaced ? replacement : initial;
    const drawingApi = {
      createIntent: async () => ({ uploadId: "upload", figureId: "figure", figureVersion: 1, url: "https://storage.test/upload", headers: { "Content-Type": "image/png" as const }, expiresAt: "2026-09-08T23:00:00Z" }),
      uploadFile: async () => {},
      finalize: async () => { replaced = true; return { figureId: "figure", figureVersion: 2, drawingFileId: "new-drawing", fileVersion: 2, sha256: "e".repeat(64), width: 640, height: 480, bytes: 20, filename: "new.png" }; },
      loadDrawing: async () => ({ figureId: "figure", figureVersion: 2, drawingFileId: "new-drawing", fileVersion: 2, sha256: "e".repeat(64), width: 640, height: 480, bytes: 20, filename: "new.png", url: "https://storage.test/new.png", expiresAt: "2026-09-08T23:00:00Z" }),
    };
    render(<MappingEditor initial={initial} drawing={drawing} authority={{ ...authority, canUploadDrawing: true }} api={client} drawingApi={drawingApi} confirmDiscard={confirmDiscard} />); loadImage();
    fireEvent.change(screen.getByLabelText("Source evidence"), { target: { value: "Keep local evidence" } });
    fireEvent.change(screen.getByLabelText("Replacement PNG"), { target: { files: [new File(["png"], "new.png", { type: "image/png" })] } });
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Upload replacement PNG" })));
    expect(screen.queryByTestId("mapping-canvas")).toBeNull();
    expect((screen.getByLabelText("Source evidence") as HTMLTextAreaElement).value).toBe("Keep local evidence");
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Select current drawing version" })));
    expect((screen.getByLabelText("Source evidence") as HTMLTextAreaElement).value).toBe("Keep local evidence");
    confirmDiscard.mockReturnValue(true);
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Select current drawing version" })));
    expect(screen.getByRole("img").getAttribute("src")).toBe("https://storage.test/new.png");
    expect(screen.getByRole("status").textContent).toContain("Unsaved"); expect(screen.getByRole("status").textContent).not.toContain("Approved");
  });
  it("fails closed without a matching authoritative image and after image failure", () => {
    const initial = fixture(); const props = { initial, authority, api: api(initial) };
    const view = render(<MappingEditor {...props} drawing={null} />);
    expect((screen.getByRole("button", { name: "Polygon (G)" }) as HTMLButtonElement).disabled).toBe(true);
    view.rerender(<MappingEditor {...props} drawing={{ ...drawing, sha256: "d".repeat(64) }} />);
    expect(screen.queryByRole("img")).toBeNull();
    view.rerender(<MappingEditor {...props} drawing={drawing} />); loadImage();
    expect((screen.getByRole("button", { name: "Polygon (G)" }) as HTMLButtonElement).disabled).toBe(false);
    fireEvent.error(screen.getByRole("img"));
    expect((screen.getByRole("button", { name: "Polygon (G)" }) as HTMLButtonElement).disabled).toBe(true);
  });
  it("draws and closes rings by keyboard without mutating inputs or source URL; typing ignores shortcuts", () => {
    const initial = fixture(); const original = structuredClone(initial);
    render(<MappingEditor initial={initial} authority={authority} api={api(initial)} drawing={drawing} />); loadImage();
    fireEvent.click(screen.getByRole("button", { name: "Polygon (G)" })); point(10, 10); point(100, 10); point(10, 100);
    fireEvent.keyDown(screen.getByTestId("mapping-editor"), { key: "Enter" });
    expect(screen.getByRole("button", { name: /Component region 1/ })).toBeTruthy();
    expect(screen.getByRole("img").getAttribute("src")).toBe("/private/drawing.png"); expect(initial).toEqual(original);
    const evidence = screen.getByLabelText("Source evidence");
    fireEvent.keyDown(evidence, { key: "p" });
    expect(screen.getByRole("button", { name: "Polygon (G)" }).getAttribute("aria-pressed")).toBe("true");
    fireEvent.keyDown(screen.getByTestId("mapping-editor"), { key: "z", ctrlKey: true });
    expect(screen.queryByRole("button", { name: /Component region 1/ })).toBeNull();
  });
  it("retains open rings on declined tool switch and warns before unloading", () => {
    const initial = fixture(); render(<MappingEditor initial={initial} authority={authority} api={api(initial)} drawing={drawing} />); loadImage();
    fireEvent.click(screen.getByRole("button", { name: "Polygon (G)" })); point(10, 10);
    fireEvent.click(screen.getByRole("button", { name: "Pan (P)" }));
    expect(screen.getByText(/Finish or explicitly cancel/)).toBeTruthy();
    const event = new Event("beforeunload", { cancelable: true }); window.dispatchEvent(event); expect(event.defaultPrevented).toBe(true);
    fireEvent.keyDown(screen.getByTestId("mapping-editor"), { key: "Escape" });
    fireEvent.click(screen.getByRole("button", { name: "Pan (P)" }));
    expect(screen.getByRole("button", { name: "Pan (P)" }).getAttribute("aria-pressed")).toBe("true");
  });
  it("keeps later edits and disables duplicate saves during slow save", async () => {
    const initial = fixture(); const client = api(initial);
    let finish!: (value: MappingRevision) => void;
    let sent!: MappingRevision["document"];
    client.saveMapping = async (_id, _version, doc) => { sent = doc; return new Promise(resolve => { finish = resolve; }); };
    client.loadMapping = async () => ({ ...initial, version: 2, document: sent, revision: { revisionId: "saved", version: 2, checksum: "c".repeat(64), document: sent, approval: null } });
    render(<MappingEditor initial={initial} authority={authority} api={client} drawing={drawing} />); loadImage();
    fireEvent.change(screen.getByLabelText("Source evidence"), { target: { value: "First" } });
    fireEvent.click(screen.getByRole("button", { name: "Save draft" }));
    expect((screen.getByRole("button", { name: "Save draft" }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(screen.getByLabelText("Source evidence"), { target: { value: "Later" } });
    await act(async () => finish({ revisionId: "saved", version: 2, checksum: "c".repeat(64), document: sent, approval: null }));
    expect((screen.getByLabelText("Source evidence") as HTMLTextAreaElement).value).toBe("Later"); expect(screen.getByRole("status").textContent).toContain("Unsaved");
  });
  it("never overlays a source-conflicted historical document or advertises its approval", () => {
    const initial = fixture(); initial.sourceConflict = true;
    initial.revision = { revisionId: "old", version: 2, checksum: "c".repeat(64), document: initial.document, approval: { reviewerId: "actor", reviewedAt: "today" } }; initial.version = 2;
    render(<MappingEditor initial={initial} authority={authority} api={api(initial)} drawing={drawing} />);
    expect(screen.queryByTestId("mapping-canvas")).toBeNull(); expect(screen.queryByText("Approved revision")).toBeNull();
    expect((screen.getByRole("button", { name: "Approve exact saved revision" }) as HTMLButtonElement).disabled).toBe(true);
  });
  it("retains unsaved work when a figure switch is declined", () => {
    const initial = fixture(); const client = api(initial); const confirmDiscard = vi.fn(() => false);
    const view = render(<MappingEditor initial={initial} authority={authority} api={client} drawing={drawing} confirmDiscard={confirmDiscard} />); loadImage();
    fireEvent.change(screen.getByLabelText("Source evidence"), { target: { value: "Keep me" } });
    const next = structuredClone(initial); next.document.figureId = "second"; next.source.figure.id = "second";
    view.rerender(<MappingEditor initial={next} authority={authority} api={client} drawing={drawing} confirmDiscard={confirmDiscard} />);
    fireEvent.click(screen.getByRole("button", { name: "Switch to requested figure" }));
    expect((screen.getByLabelText("Source evidence") as HTMLTextAreaElement).value).toBe("Keep me");
  });
  it("immediately removes old overlay when a new source envelope arrives for the same figure", () => {
    const initial = fixture(); const view = render(<MappingEditor initial={initial} authority={authority} api={api(initial)} drawing={drawing} />); loadImage();
    const changed = structuredClone(initial); changed.sourceConflict = true; changed.source.drawing!.id = "replacement";
    view.rerender(<MappingEditor initial={changed} authority={authority} api={api(initial)} drawing={drawing} />);
    expect(screen.queryByTestId("mapping-canvas")).toBeNull();
  });
  it("preserves work on failed saves, maps field issues, and blocks editing after expired authorization", async () => {
    const initial = fixture(); const client = api(initial);
    client.saveMapping = async () => { throw new MappingApiError(422, "Invalid geometry", [{ path: 'occurrences["one"].regions["bad"]', code: "invalid", message: "Check contour" }]); };
    render(<MappingEditor initial={initial} authority={authority} api={client} drawing={drawing} />); loadImage();
    fireEvent.change(screen.getByLabelText("Source evidence"), { target: { value: "Keep" } });
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Save draft" })));
    expect(screen.getByText(/Check contour/)).toBeTruthy(); expect((screen.getByLabelText("Source evidence") as HTMLTextAreaElement).value).toBe("Keep");
    client.saveMapping = async () => { throw new MappingApiError(401, "Session expired"); };
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Save draft" })));
    expect((screen.getByRole("button", { name: "Polygon (G)" }) as HTMLButtonElement).disabled).toBe(true); expect((screen.getByLabelText("Source evidence") as HTMLTextAreaElement).value).toBe("Keep");
  });
  it("confirms historical draft replacement after loading and retains a declined open ring", async () => {
    const initial = fixture(); const client = api(initial); const confirmDiscard = vi.fn(() => false);
    const historical: MappingRevision = { revisionId: "old", version: 2, checksum: "c".repeat(64), document: initial.document, approval: { reviewerId: "actor", reviewedAt: "today" } };
    client.listRevisions = async () => ({ items: [{ revisionId: "old", revisionNumber: 1, checksum: historical.checksum, createdAt: "today", approval: historical.approval }], nextBefore: null });
    client.loadRevision = async () => ({ revision: historical, currentVersion: 1, source: initial.source, sourceConflict: false });
    render(<MappingEditor initial={initial} authority={authority} api={client} drawing={drawing} confirmDiscard={confirmDiscard} />); loadImage();
    fireEvent.click(screen.getByRole("button", { name: "Polygon (G)" })); point(10, 10);
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Saved revisions" })));
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Load revision 1 as new draft" })));
    expect((screen.getByRole("button", { name: "Close ring" }) as HTMLButtonElement).disabled).toBe(false);
    expect(screen.getByRole("status").textContent).toContain("Unsaved");
    confirmDiscard.mockReturnValue(true);
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Load revision 1 as new draft" })));
    expect((screen.getByRole("button", { name: "Close ring" }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByRole("status").textContent).not.toContain("Approved"); expect(screen.getByRole("status").textContent).toContain("Unsaved");
  });
  it("uses canonical binding and current version for the next save while retaining later edits", async () => {
    const initial = fixture(); const client = api(initial); let finish!: (r: MappingRevision) => void; let sent!: MappingRevision["document"];
    client.saveMapping = async (_id, _version, document) => { sent = document; return new Promise(resolve => { finish = resolve; }); };
    let canonical!: MappingRevision;
    client.loadMapping = async () => ({ ...initial, version: canonical.version, revision: canonical, document: canonical.document, source: { ...initial.source, catalogueBindingSha256: "d".repeat(64) } });
    render(<MappingEditor initial={initial} authority={authority} api={client} drawing={drawing} />); loadImage();
    fireEvent.change(screen.getByLabelText("Associated parts row"), { target: { value: "" } });
    fireEvent.click(screen.getByRole("button", { name: "Save draft" }));
    fireEvent.change(screen.getByLabelText("Source evidence"), { target: { value: "Later" } });
    canonical = { revisionId: "saved", version: 2, checksum: "c".repeat(64), document: { ...sent, catalogueBindingSha256: "d".repeat(64) }, approval: null };
    await act(async () => finish(canonical));
    let nextVersion = 0; let nextDocument: MappingRevision["document"] | null = null;
    client.saveMapping = async (_id, version, document) => { nextVersion = version; nextDocument = document; canonical = { ...canonical, version: 3, document }; return canonical; };
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Save draft" })));
    expect(nextVersion).toBe(2); expect(nextDocument).toMatchObject({ catalogueBindingSha256: "d".repeat(64), occurrences: [{ evidence: "Later", figurePartId: null }] });
  });
  it("supports label rectangle, hole creation, vertex keyboard edits and redraw cancellation", () => {
    const initial = fixture(); initial.document.occurrences[0].regions = [{ id: "outer", outer: [[10, 10], [100, 10], [100, 100], [10, 100]], holes: [] }];
    render(<MappingEditor initial={initial} authority={authority} api={api(initial)} drawing={drawing} />); loadImage();
    for (const [key, value] of Object.entries({ x: "5", y: "5", width: "10", height: "10" })) fireEvent.change(screen.getByLabelText(`Label ${key}`), { target: { value } });
    fireEvent.click(screen.getByRole("button", { name: "Apply label rectangle" })); expect(screen.getByText("Current: 5, 5; 10 × 10")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /Component region 1/ }));
    fireEvent.keyDown(screen.getByRole("button", { name: "Outer vertex 1" }), { key: "ArrowRight" });
    expect(screen.getByRole("button", { name: "Outer vertex 1" }).getAttribute("cx")).toBe("11");
    fireEvent.click(screen.getByRole("button", { name: "Add hole" })); point(20, 20); point(30, 20); point(20, 30); fireEvent.keyDown(screen.getByTestId("mapping-editor"), { key: "Enter" });
    expect(screen.getByText(/1 holes/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Redraw selected region" })); point(0, 0); fireEvent.keyDown(screen.getByTestId("mapping-editor"), { key: "Escape" });
    expect(screen.getByRole("button", { name: /Component region 1/ }).getAttribute("d")).toContain("M 11 10");
  });
  it("rejects malformed runtime envelopes and absent session transport without demo fallback", async () => {
    expect(() => createMappingApiClient({ csrfToken: "" })).toThrow(/authenticated/);
    const client = createMappingApiClient({ csrfToken: "session", fetch: async () => new Response(JSON.stringify({ document: fixture().document }), { status: 200 }) });
    await expect(client.loadMapping("00000000-0000-0000-0000-000000000001")).rejects.toMatchObject({ status: 502 });
  });
  it("protects unapplied label input as unsaved work until explicit apply or discard", () => {
    const initial = fixture(); initial.document.occurrences.push({ ...initial.document.occurrences[0], calloutId: "two", refNo: "8" });
    render(<MappingEditor initial={initial} authority={authority} api={api(initial)} drawing={drawing} />); loadImage();
    fireEvent.change(screen.getByLabelText("Label x"), { target: { value: "12" } });
    expect(screen.getByRole("status").textContent).toContain("Unsaved");
    fireEvent.change(screen.getByLabelText("Exact occurrence"), { target: { value: "two" } });
    expect((screen.getByLabelText("Exact occurrence") as HTMLSelectElement).value).toBe("one");
    expect((screen.getByLabelText("Label x") as HTMLInputElement).value).toBe("12");
    const event = new Event("beforeunload", { cancelable: true }); window.dispatchEvent(event); expect(event.defaultPrevented).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Discard label input" }));
    expect(screen.getByRole("status").textContent).not.toContain("Unsaved");
  });
  it("blocks stale canvas when the source changes between historical and current reads while preserving local work", async () => {
    const initial = fixture(); const client = api(initial);
    const historical: MappingRevision = { revisionId: "old", version: 2, checksum: "c".repeat(64), document: initial.document, approval: null };
    client.listRevisions = async () => ({ items: [{ revisionId: "old", revisionNumber: 1, checksum: historical.checksum, createdAt: "today", approval: null }], nextBefore: null });
    client.loadRevision = async () => ({ revision: historical, currentVersion: 1, source: initial.source, sourceConflict: false });
    const changed = structuredClone(initial); changed.sourceConflict = true; changed.source.drawing!.id = "replacement"; changed.source.drawing!.sha256 = "d".repeat(64);
    client.loadMapping = async () => changed;
    render(<MappingEditor initial={initial} authority={authority} api={client} drawing={drawing} />); loadImage();
    fireEvent.change(screen.getByLabelText("Source evidence"), { target: { value: "Local work to retain" } });
    fireEvent.click(screen.getByRole("button", { name: "Polygon (G)" })); point(10, 10);
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Saved revisions" })));
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Load revision 1 as new draft" })));
    expect(screen.queryByTestId("mapping-canvas")).toBeNull();
    expect(screen.getByRole("status").textContent).toBe("Conflict");
    expect((screen.getByRole("button", { name: "Polygon (G)" }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole("button", { name: "Save draft" }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByLabelText("Source evidence") as HTMLTextAreaElement).value).toBe("Local work to retain");
    expect((screen.getByRole("button", { name: "Cancel unfinished ring" }) as HTMLButtonElement).disabled).toBe(false);
  });
});
