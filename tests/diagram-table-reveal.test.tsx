// @vitest-environment jsdom
import { afterEach, expect, test, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { DrawingViewer } from "@/components/DrawingViewer";
import { PartsTable } from "@/components/PartsTable";
import { getFigureDetail } from "@/data/repository";
import { useDiagramSelection } from "@/state/useDiagramSelection";

afterEach(cleanup);
test("pins only the exact filtered-out selected row, retains filters, and removes the exception on clear", async () => {
  const detail = (await getFigureDetail("fig-filters-1-1"))!;
  const rows = detail.rows.slice(0, 3);
  function Table() {
    const focus = useDiagramSelection({ figureId:detail.figure.id, releaseKey:"1", rows });
    return <><button onClick={() => focus.selectPart(rows[1].figurePart.id, "label")}>Image selection</button>
      <button onClick={focus.clear}>Clear</button><PartsTable rows={rows} selectedPartIds={focus.selectedPartIds}
        selectedFigurePartId={focus.selection?.figurePartId} selectionActivation={focus.activation} onSelectPart={focus.selectPart} /></>;
  }
  const { container } = render(<Table />);
  const input = screen.getByLabelText("Filter by description");
  fireEvent.change(input, { target:{ value:"does not match" } });
  fireEvent.click(screen.getByText("Image selection"));
  expect(screen.getByText("Selected part is outside these filters")).toBeTruthy();
  expect((input as HTMLInputElement).value).toBe("does not match");
  expect(container.querySelectorAll("tr[data-figure-part-id]")).toHaveLength(1);
  expect(container.querySelector("tr[data-figure-part-id]")?.getAttribute("data-figure-part-id")).toBe(rows[1].figurePart.id);
  fireEvent.change(input, { target:{ value:"" } });
  expect(screen.queryByText("Selected part is outside these filters")).toBeNull();
  expect(container.querySelectorAll("tr[data-figure-part-id]")).toHaveLength(3);
  fireEvent.change(input, { target:{ value:"does not match" } });
  fireEvent.click(screen.getByText("Clear"));
  expect(container.querySelectorAll("tr[data-figure-part-id]")).toHaveLength(0);
});

test("image activation scrolls its own table only, by the nearest edge, including a repeated activation", async () => {
  const detail = (await getFigureDetail("fig-filters-1-1"))!;
  const row = detail.rows[0];
  const props = { rows:detail.rows, selectedPartIds:new Set([row.part.id]), selectedFigurePartId:row.figurePart.id };
  const view = render(<PartsTable {...props} />);
  const scroller = view.container.firstElementChild as HTMLElement;
  const target = view.container.querySelector("tbody tr") as HTMLElement;
  Object.defineProperty(scroller, "clientHeight", { value:100 });
  Object.defineProperty(scroller, "clientWidth", { value:200 });
  scroller.getBoundingClientRect = () => ({ left:0, top:0, right:200, bottom:100, width:200, height:100 }) as DOMRect;
  target.getBoundingClientRect = () => ({ left:0, top:150, right:200, bottom:170, width:200, height:20 }) as DOMRect;
  Object.defineProperty(scroller, "scrollBy", { value:({ top = 0, left = 0 }: ScrollToOptions) => { scroller.scrollTop += top; scroller.scrollLeft += left; } });
  view.rerender(<PartsTable {...props} selectionActivation={{ origin:"label", sequence:1 }} />);
  expect(scroller.scrollTop).toBe(70);
  scroller.scrollTop = 0;
  view.rerender(<PartsTable {...props} selectionActivation={{ origin:"label", sequence:2 }} />);
  expect(scroller.scrollTop).toBe(70);
  scroller.scrollTop = 0;
  view.rerender(<PartsTable {...props} selectionActivation={{ origin:"table", sequence:3 }} />);
  expect(scroller.scrollTop).toBe(0);
});

test("table activation and Show selected reveal numeric regions at existing zoom; hover and image activation never pan", async () => {
  const props = { label:"Test", src:"/test.png", width:100, height:100, markers:[], zoom:4,
    selectedPartIds:new Set(["part"]), document:{ imageWidth:100, imageHeight:100, occurrences:[{
      calloutId:"callout", figurePartId:"row", partId:"part", partNumber:"P", refNo:"1",
      regions:[{ id:"region", outer:[[80,80],[90,80],[90,90]] as [number, number][], holes:[] }],
    }] } };
  const view = render(<DrawingViewer {...props} />);
  const stage = view.container.querySelector("img")!.parentElement!;
  const sheet = stage.parentElement!;
  Object.defineProperty(sheet, "clientHeight", { value:100 });
  Object.defineProperty(sheet, "clientWidth", { value:100 });
  sheet.getBoundingClientRect = () => ({ left:0, top:0, width:100, height:100 }) as DOMRect;
  stage.getBoundingClientRect = () => ({ left:-sheet.scrollLeft, top:-sheet.scrollTop, width:400, height:400 }) as DOMRect;
  Object.defineProperty(sheet, "scrollBy", { value:({ top = 0, left = 0 }: ScrollToOptions) => { sheet.scrollTop += top; sheet.scrollLeft += left; } });
  view.rerender(<DrawingViewer {...props} selectionActivation={{ origin:"table", sequence:1 }} />);
  await waitFor(() => expect(sheet.scrollTop).toBe(260));
  expect(sheet.scrollLeft).toBe(260);
  sheet.scrollTop = 0; sheet.scrollLeft = 0;
  const activation = { origin:"label" as const, sequence:2 };
  view.rerender(<DrawingViewer {...props} selectionActivation={activation} hoveredPartId="part" />);
  await new Promise((resolve) => setTimeout(resolve, 80));
  expect(sheet.scrollTop).toBe(0);
  view.rerender(<DrawingViewer {...props} selectionActivation={activation} revealRequest={1} />);
  await waitFor(() => expect(sheet.scrollTop).toBe(260));
});

test("mixed selected occurrences reveal numeric, legacy and marker union once, excluding their lower-priority fallbacks and unrelated parts", async () => {
  const props = { label:"Mixed", src:"/test.png", width:100, height:100, zoom:4, onZoomChange:vi.fn(),
    selectedPartIds:new Set(["part"]), markers:[
      { id:"numeric", number:1, figurePartId:"row", partId:"part", x:1, y:1, maskPath:"M0 0 L100 0 L100 100 Z" },
      { id:"legacy", number:1, figurePartId:"row", partId:"part", x:2, y:2, maskPath:"M85 85 L90 85 L90 90 Z" },
      { id:"marker", number:1, figurePartId:"row", partId:"part", x:92, y:92 },
      { id:"unrelated", number:1, figurePartId:"other", partId:"other", x:0, y:0, maskPath:"M0 0 L100 0 L100 100 Z" },
    ], document:{ imageWidth:100, imageHeight:100, occurrences:[{
      calloutId:"numeric", figurePartId:"row", partId:"part", partNumber:"P", refNo:"1",
      regions:[{ id:"region", outer:[[80,80],[85,80],[85,85]] as [number,number][], holes:[] }],
    }] } };
  const view = render(<DrawingViewer {...props} hoveredPartId="other" />);
  const stage = view.container.querySelector("img")!.parentElement!;
  const sheet = stage.parentElement!;
  Object.defineProperty(sheet, "clientHeight", { value:100 });
  Object.defineProperty(sheet, "clientWidth", { value:100 });
  sheet.getBoundingClientRect = () => ({ left:0, top:0, width:100, height:100 }) as DOMRect;
  stage.getBoundingClientRect = () => ({ left:-sheet.scrollLeft, top:-sheet.scrollTop, width:400, height:400 }) as DOMRect;
  const rect = (low:number, high:number) => ({ left:low-sheet.scrollLeft, top:low-sheet.scrollTop,
    right:high-sheet.scrollLeft, bottom:high-sheet.scrollTop, width:high-low, height:high-low }) as DOMRect;
  for (const path of stage.querySelectorAll("path[data-legacy-selected]")) path.getBoundingClientRect = () => rect(340,360);
  // All references intentionally share the same printed number. DOM order is
  // used only to install this jsdom geometry fixture, never to resolve identity.
  stage.querySelectorAll("button").forEach((button,index) => {
    button.getBoundingClientRect = () => index === 2 ? rect(360,380) : rect(0,20);
  });
  Object.defineProperty(sheet, "scrollBy", { value:({ top=0, left=0 }:ScrollToOptions) => { sheet.scrollTop+=top;sheet.scrollLeft+=left; } });
  view.rerender(<DrawingViewer {...props} hoveredPartId="other" selectionActivation={{ origin:"table", sequence:1 }} />);
  await waitFor(() => expect(sheet.scrollTop).toBe(280));
  expect(sheet.scrollLeft).toBe(280);
  expect(props.onZoomChange).not.toHaveBeenCalled();
});
