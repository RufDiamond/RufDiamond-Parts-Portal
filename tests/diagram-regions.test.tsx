// @vitest-environment jsdom
import { afterEach, expect, test } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { DrawingViewer } from "@/components/DrawingViewer";
import { DiagramRegions } from "@/components/DiagramRegions";
import type { DiagramRegionDocument } from "@/lib/drawing";
import { buildDiagramRegions, buildDrawingMarkers } from "@/lib/drawing";
import { getFigureDetail } from "@/data/repository";

afterEach(cleanup);
function screenMatrix(svg: Element, invert = () => ({ a:1, b:0, c:0, d:1, e:0, f:0 })) {
  Object.defineProperty(svg, "getScreenCTM", { configurable:true, value:() => ({ inverse:invert }) });
}
const document: DiagramRegionDocument = {
  imageWidth: 100, imageHeight: 100,
  occurrences: [
    { calloutId: "c-a", figurePartId: "row-a", partId: "part-a", partNumber: "A", refNo: "13", regions: [{ id: "a", outer: [[10,10],[80,10],[80,80],[10,80]], holes: [[[20,20],[30,20],[30,30],[20,30]]] }] },
    { calloutId: "c-b", figurePartId: "row-b", partId: "part-b", partNumber: "B", refNo: "13", regions: [{ id: "b", outer: [[50,50],[90,50],[90,90],[50,90]], holes: [] }] },
  ],
};
function Viewer() {
  const [selected, setSelected] = useState<string | null>(null);
  const [zoom, setZoom] = useState(2);
  return <><output>{selected ?? "none"}</output><output>Zoom {zoom}</output><DrawingViewer label="Test" src="/test.png" width={100} height={100}
    markers={[{ id:"c-a", figurePartId:"row-a", partId:"part-a", number:13, x:60, y:60 }]}
    document={document} zoom={zoom} onZoomChange={setZoom} onSelectPart={setSelected} /></>;
}
function mount() {
  const view = render(<Viewer />);
  const svg = view.container.querySelector('svg[data-diagram-regions]')!;
  expect(svg, "numeric hit layer must exist even with no selection").not.toBeNull();
  Object.defineProperty(svg, "getBoundingClientRect", { value: () => ({ left: 0, top: 0, width: 100, height: 100 }) });
  screenMatrix(svg);
  return { ...view, svg, path: svg.querySelector("path")! };
}
test("overlapping distinct parts require explicit choice; holes exclude activation and labels take priority", () => {
  const { path, svg } = mount();
  fireEvent.click(path, { clientX: 60, clientY: 60, detail: 1 });
  expect(screen.getByText("none")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Ref 13 — B" }));
  expect(screen.getByText("row-b")).toBeTruthy();
  fireEvent.click(svg, { clientX: 25, clientY: 25, detail: 1 });
  expect(screen.getByText("row-b")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Callout 13" }));
  expect(screen.getByText("row-a")).toBeTruthy();
});

test("pointerup displacement without intermediate move still cancels activation; next label activation works", () => {
  const { path } = mount();
  fireEvent(path, new MouseEvent("pointerdown", { bubbles:true, clientX:12, clientY:12 }));
  fireEvent(path, new MouseEvent("pointerup", { bubbles:true, clientX:25, clientY:12 }));
  fireEvent.click(path, { clientX:25, clientY:12, detail:1 });
  expect(screen.getByText("none")).toBeTruthy();
  const label = screen.getByRole("button", { name: "Callout 13" });
  fireEvent.pointerDown(label);
  fireEvent.click(label);
  expect(screen.getByText("row-a")).toBeTruthy();
});

test("a label can activate after an earlier uncaptured component gesture leaves the drawing", () => {
  const { path } = mount();
  fireEvent(path, new MouseEvent("pointerdown", { bubbles:true, clientX:12, clientY:12 }));
  // Pointer release happened outside the sheet, so the sheet did not receive it.
  const label = screen.getByRole("button", { name: "Callout 13" });
  fireEvent(label, new MouseEvent("pointerdown", { bubbles:true, clientX:60, clientY:60 }));
  fireEvent(label, new MouseEvent("pointerup", { bubbles:true, clientX:60, clientY:60 }));
  fireEvent.click(label);
  expect(screen.getByText("row-a")).toBeTruthy();
});

test("native wheel event over a component reaches the common zoom handler", () => {
  const { path } = mount();
  const wheel = new WheelEvent("wheel", { bubbles:true, cancelable:true, deltaY:-120 });
  fireEvent(path, wheel);
  expect(wheel.defaultPrevented).toBe(true);
  expect(screen.getByText("Zoom 3")).toBeTruthy();
});

test("source replacement discards an open overlap chooser instead of keeping stale candidates", () => {
  const view = render(<DiagramRegions document={document} selectedPartIds={new Set()} onSelect={() => {}} />);
  const svg = view.container.querySelector("svg")!;
  Object.defineProperty(svg, "getBoundingClientRect", { value: () => ({ left:0, top:0, width:100, height:100 }) });
  screenMatrix(svg);
  fireEvent.click(svg.querySelector("path")!, { clientX:60, clientY:60, detail:1 });
  expect(screen.getByRole("group", { name:"Choose overlapping component" })).toBeTruthy();
  view.rerender(<DiagramRegions document={{ ...document, occurrences:[] }} selectedPartIds={new Set()} onSelect={() => {}} />);
  expect(screen.queryByRole("group", { name:"Choose overlapping component" })).toBeNull();
});

test("component picking uses the live inverse screen matrix, and ignores unavailable or singular matrices", () => {
  const { svg, path } = mount();
  // Screen (160, 120) maps to image (15, 15), outside the old rect-ratio hit.
  screenMatrix(svg, () => ({ a:0.5, b:0, c:0, d:0.5, e:-65, f:-45 }));
  fireEvent.click(path, { clientX:160, clientY:120, detail:1 });
  expect(screen.getByText("row-a")).toBeTruthy();
  cleanup();
  const other = mount();
  Object.defineProperty(other.svg, "getScreenCTM", { configurable:true, value:() => null });
  fireEvent.click(other.path, { clientX:15, clientY:15, detail:1 });
  expect(screen.getByText("none")).toBeTruthy();
  screenMatrix(other.svg, () => { throw new Error("singular"); });
  fireEvent.click(other.path, { clientX:15, clientY:15, detail:1 });
  expect(screen.getByText("none")).toBeTruthy();
});

test("numeric source projection refuses mismatched artwork, and the viewer paints only one selected fill", async () => {
  const detail = structuredClone((await getFigureDetail("fig-hydraulic-4-4"))!);
  const callout = detail.callouts[0];
  callout.x = 10; callout.y = 10; callout.maskPath = "M 1 1 L 2 1 L 2 2 Z";
  callout.componentGeometry = {
    drawingPath: detail.drawing!.storagePath, drawingSha256:"a".repeat(64), imageWidth:1280, imageHeight:720,
    regions: [{ id:"numeric", outer:[[10,10],[20,10],[20,20]], holes:[] }],
  };
  expect(buildDiagramRegions(detail.rows, detail.callouts, { ...detail.drawing!, storagePath:"/other.png" })?.occurrences).toHaveLength(0);
  expect(buildDiagramRegions(detail.rows, detail.callouts, { ...detail.drawing!, width:640 })?.occurrences).toHaveLength(0);
  const document = buildDiagramRegions(detail.rows, detail.callouts, detail.drawing)!;
  const { container } = render(<DrawingViewer label="one fill" src={detail.drawing!.storagePath} width={1280} height={720}
    markers={buildDrawingMarkers(detail.rows, detail.callouts)} document={document}
    selectedPartIds={new Set([document.occurrences[0].partId])} />);
  expect(container.querySelectorAll("path")).toHaveLength(1);
});
test("click under five CSS pixels activates; larger drag and pointercancel never activate", () => {
  const { path } = mount();
  // jsdom has no PointerEvent implementation; MouseEvent supplies real coordinates.
  const pointer = (type: string, x: number, y: number) => fireEvent(path, new MouseEvent(type, { bubbles: true, clientX:x, clientY:y, button:0 }));
  pointer("pointerdown", 12, 12); pointer("pointermove", 15, 15); pointer("pointerup", 15, 15);
  fireEvent.click(path, { clientX:15, clientY:15, detail:1 });
  expect(screen.getByText("row-a")).toBeTruthy();
  cleanup();
  const second = mount();
  fireEvent(second.path, new MouseEvent("pointerdown", { bubbles:true, clientX:12, clientY:12 }));
  fireEvent(second.path, new MouseEvent("pointermove", { bubbles:true, clientX:18, clientY:12 }));
  fireEvent(second.path, new MouseEvent("pointerup", { bubbles:true, clientX:18, clientY:12 }));
  fireEvent.click(second.path, { clientX:18, clientY:12, detail:1 });
  expect(screen.getByText("none")).toBeTruthy();
  fireEvent(second.path, new MouseEvent("pointerdown", { bubbles:true, clientX:12, clientY:12 }));
  fireEvent.pointerCancel(second.path);
  fireEvent.click(second.path, { clientX:12, clientY:12, detail:1 });
  expect(screen.getByText("none")).toBeTruthy();
});
