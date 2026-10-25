// @vitest-environment jsdom
import { afterEach, expect, test, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { FigureWorkspace } from "@/app/(portal)/figures/[figureId]/FigureWorkspace";
import { getFigureDetail } from "@/data/repository";
import { MachineProvider } from "@/state/MachineContext";
import { RequestProvider } from "@/state/RequestContext";
import { resolveDiagramSelection, useDiagramSelection } from "@/state/useDiagramSelection";
import type { FigureDetail } from "@/types/catalog";
import userEvent from "@testing-library/user-event";
import { DrawingViewer, type DrawingMarker } from "@/components/DrawingViewer";
import markerStyles from "@/components/CalloutMarker.module.css";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
afterEach(() => {
  cleanup();
  window.localStorage?.clear?.();
  window.sessionStorage?.clear?.();
});

async function fixture() {
  const detail = structuredClone((await getFigureDetail("fig-filters-1-1"))!);
  const base = detail.rows[0];
  detail.rows = ["a", "b", "c"].map((key) => ({
    ...base, figurePart: { ...base.figurePart, id: `row-${key}`, partId: key === "c" ? "part-a" : `part-${key}` },
    part: { ...base.part, id: key === "c" ? "part-a" : `part-${key}`, partNumber: key === "c" ? "A" : key.toUpperCase() },
    calloutNumbers: [13],
  }));
  detail.callouts = detail.rows.map((row, i) => ({
    id: `callout-${i}`, figureId: detail.figure.id, figurePartId: row.figurePart.id, number: 13,
    x: 10 + i * 30, y: 10, maskPath: null,
    componentGeometry: {
      drawingPath: detail.drawing!.storagePath, drawingSha256: "a".repeat(64),
      imageWidth: detail.drawing!.width, imageHeight: detail.drawing!.height,
      regions: [{ id: `region-${i}`, outer: [[10 + i * 100, 20], [70 + i * 100, 20], [70 + i * 100, 80]], holes: [] }],
    },
  }));
  return detail;
}

function workspace(detail: FigureDetail) {
  return <MachineProvider><RequestProvider><FigureWorkspace detail={detail} usage={{}} sheet="1" index={0} total={1}
    previousId={null} nextId={null} firstId={null} lastId={null} /></RequestProvider></MachineProvider>;
}

test("resolves exact row identity despite duplicate printed references, rejecting unknown or foreign rows", async () => {
  const detail = await fixture();
  expect(resolveDiagramSelection(detail.figure.id, "row-a", detail.rows)).toEqual({ figureId: detail.figure.id, figurePartId: "row-a" });
  expect(resolveDiagramSelection(detail.figure.id, "missing", detail.rows)).toBeNull();
  expect(resolveDiagramSelection("other", "row-a", detail.rows)).toBeNull();
});

test("label, component, and table focus converge; selecting a part also ticks its cart checkbox", async () => {
  const detail = await fixture();
  const { container } = render(workspace(detail));
  const tableRows = () => container.querySelectorAll("tbody tr");
  const regions = () => container.querySelectorAll('path[role="button"]');
  const figure = container.querySelector("figure")!;
  const markerA = within(figure).getAllByRole("button", { name: /Callout 13: A/ })[0];
  fireEvent.mouseEnter(markerA);
  expect(markerA.getAttribute("aria-pressed")).toBe("false");
  fireEvent.mouseLeave(markerA);
  fireEvent.click(within(figure).getAllByRole("button", { name: /Callout 13: A/ })[0]);
  expect(tableRows()[0].getAttribute("data-active")).toBe("true");
  expect(tableRows()[2].getAttribute("data-active")).toBe("true");
  expect(tableRows()[1].hasAttribute("data-active")).toBe(false);
  expect(regions()[0].getAttribute("aria-pressed")).toBe("true");
  expect(regions()[2].getAttribute("aria-pressed")).toBe("true");
  expect((screen.getAllByRole("checkbox", { name: "Select A on the drawing" })[0] as HTMLInputElement).checked).toBe(true);
  fireEvent.click(tableRows()[1]);
  expect(regions()[1].getAttribute("aria-pressed")).toBe("true");
  expect(regions()[0].getAttribute("aria-pressed")).toBe("true");
  expect(regions()[2].getAttribute("aria-pressed")).toBe("true");
  expect((screen.getAllByRole("checkbox", { name: "Select B on the drawing" })[0] as HTMLInputElement).checked).toBe(true);
  fireEvent.keyDown(regions()[0], { key: "Enter" });
  fireEvent.keyDown(regions()[0], { key: " " });
  fireEvent.mouseLeave(figure);
  expect(tableRows()[0].getAttribute("data-active")).toBe("true");
  expect(tableRows()[1].getAttribute("data-active")).toBe("true");
  expect((screen.getAllByRole("checkbox", { name: "Select A on the drawing" })[0] as HTMLInputElement).checked).toBe(true);
  fireEvent.click(screen.getByRole("button", { name: "Clear selection" }));
  expect(regions()[0].getAttribute("aria-pressed")).toBe("false");
  expect(regions()[1].getAttribute("aria-pressed")).toBe("false");
  expect((screen.getAllByRole("checkbox", { name: "Select A on the drawing" })[0] as HTMLInputElement).checked).toBe(false);
  expect((screen.getAllByRole("checkbox", { name: "Select B on the drawing" })[0] as HTMLInputElement).checked).toBe(false);
  fireEvent.click(tableRows()[0]);
  fireEvent.click(tableRows()[1]);
  fireEvent.click(screen.getByRole("button", { name: /Add to cart/ }));
  const confirm = screen.getByRole("dialog", { name: "Confirm parts to add to the cart" });
  fireEvent.click(within(confirm).getByRole("button", { name: "Add to cart" }));
  fireEvent.click(within(await screen.findByRole("dialog", { name: "Parts Portal" })).getByRole("button", { name: "OK" }));
  expect(screen.getByRole("button", { name: /Check cart · 2/ })).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Clear selection" }));
  expect(screen.getByRole("button", { name: /Check cart · 2/ })).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Illustration full screen" }));
  const full = screen.getByRole("dialog");
  fireEvent.keyDown(full.querySelectorAll('path[role="button"]')[1], { key: "Enter" });
  fireEvent.click(screen.getByRole("button", { name: "Close the illustration" }));
  expect(tableRows()[1].getAttribute("data-active")).toBe("true");
  expect(tableRows()[0].hasAttribute("data-active")).toBe(false);
});

test("keyboard table references focus exact rows and select-all quote checkbox handles shared parts once", async () => {
  const detail = await fixture();
  const user = userEvent.setup();
  const { container } = render(workspace(detail));
  const rows = container.querySelectorAll("tbody tr");
  const reference = within(rows[1] as HTMLElement).getByRole("button", { name: /Callout/ });
  reference.focus();
  await user.keyboard("{Enter}");
  expect(rows[1].getAttribute("data-active")).toBe("true");
  await user.click(screen.getByRole("checkbox", { name: "Select every part on this figure" }));
  expect(screen.getAllByRole("checkbox").every((box) => (box as HTMLInputElement).checked)).toBe(true);
  expect(rows[1].getAttribute("data-active")).toBe("true");
});

test("clicking another occurrence of an already-selected part clears that whole group and keeps other parts", async () => {
  const detail = await fixture();
  const {container} = render(workspace(detail));
  const rows = container.querySelectorAll("tbody tr");
  fireEvent.click(rows[2]); // Same part as row 0, but a different source row.
  fireEvent.click(rows[1]); // Unrelated part remains selected.
  const firstOccurrence = within(container.querySelector("figure")!).getAllByRole("button",{name:/Callout 13: A/})[0];
  fireEvent.click(firstOccurrence);
  expect(rows[0].hasAttribute("data-active")).toBe(false);
  expect(rows[2].hasAttribute("data-active")).toBe(false);
  expect(rows[1].getAttribute("data-active")).toBe("true");
});

test.each(["fig-cabin-6-1", "fig-filters-1-1"])("legacy %s keeps supplied markers and read-only masks", async (id) => {
  const detail = (await getFigureDetail(id))!;
  const { container } = render(workspace(detail));
  const figure = container.querySelector("figure")!;
  const occurrence = detail.callouts.find((item) => item.maskPath) ?? detail.callouts[0];
  const marker = within(figure).getByRole("button", { name: new RegExp(`^Callout ${occurrence.number}:`) });
  fireEvent.click(marker);
  fireEvent.mouseLeave(marker);
  expect(marker.getAttribute("aria-pressed")).toBe("true");
  expect(figure.querySelectorAll('[data-diagram-regions] path[role="button"]')).toHaveLength(0);
  if (occurrence.maskPath) {
    expect(figure.querySelector(`path[d="${occurrence.maskPath}"]`)).toBeTruthy();
    expect(figure.querySelector(`path[d="${occurrence.maskPath}"]`)?.getAttribute("data-active")).toBe("true");
  }
});

test("focus resets on figure or source release handoff without resurrecting prior focus", async () => {
  const detail = await fixture();
  function Probe({ id, release }: { id: string; release: string }) {
    const focus = useDiagramSelection({ figureId: id, releaseKey: release, rows: detail.rows });
    return <><button onClick={() => focus.selectPart("row-a", "table")}>Focus</button><output>{focus.selection?.figurePartId ?? "none"}</output></>;
  }
  const view = render(<Probe id={detail.figure.id} release="1" />);
  fireEvent.click(screen.getByText("Focus"));
  expect(screen.getByText("row-a")).toBeTruthy();
  view.rerender(<Probe id={detail.figure.id} release="2" />);
  expect(screen.getByText("none")).toBeTruthy();
  fireEvent.click(screen.getByText("Focus"));
  expect(screen.getByText("row-a")).toBeTruthy();
  view.rerender(<Probe id="other-figure" release="2" />);
  expect(screen.getByText("none")).toBeTruthy();
});


test.each([1, 2, 3, 4, 10])("selecting a row highlights all %i Quantity instances in normal and fullscreen views", async (qty) => {
  const detail = await fixture();
  detail.rows = [detail.rows[0]];
  detail.rows[0].figurePart.qty = qty;
  detail.callouts = Array.from({ length: qty }, (_, i) => ({ ...detail.callouts[0],
    id: `physical-${i}`, x: 5 + i * 8, y: 40,
    componentGeometry: { ...detail.callouts[0].componentGeometry!, regions: [{ id: `r-${i}`,
      outer: [[10+i*80,20],[60+i*80,20],[60+i*80,70],[10+i*80,70]], holes: [] }] },
  }));
  const { container } = render(workspace(detail));
  fireEvent.click(container.querySelector("tbody tr")!);
  const assertSelected = (scope: HTMLElement) => {
    const markers = scope.querySelectorAll('button[data-callout-id]');
    expect(markers).toHaveLength(qty);
    for (const marker of markers) { expect(marker.getAttribute("aria-pressed")).toBe("true"); expect(marker.textContent).toBe("13"); }
    expect(scope.querySelectorAll('[data-diagram-regions] path[data-selected]')).toHaveLength(qty);
    const badges = scope.querySelectorAll('button[data-selected-part-number]');
    expect(badges).toHaveLength(1);
    expect(badges[0].getAttribute("data-selected-part-number")).toBe("A");
    expect(badges[0].textContent).toContain(`${qty} occurrence${qty === 1 ? "" : "s"}`);
  };
  assertSelected(container.querySelector("figure")!);
  fireEvent.click(screen.getByRole("button", { name: "Illustration full screen" }));
  assertSelected(screen.getByRole("dialog").querySelector("figure")!);
});

test.each([{found:3,status:"Needs Review"},{found:4,status:"Complete"},{found:5,status:"Needs Review"}])(
  "Quantity 4 with $found physical instances displays $status only in marker review",
  async ({found,status}) => {
    const detail = await fixture();
    detail.rows = [detail.rows[0]];
    detail.rows[0].figurePart.qty = 4;
    detail.callouts = Array.from({length:found},(_,i)=>({...detail.callouts[0],id:`physical-${i}`,x:10+i*10,y:20}));
    const customer = render(workspace(detail));
    expect(customer.container.querySelectorAll("tbody tr")).toHaveLength(1);
    expect(within(customer.container.querySelector("tbody tr") as HTMLElement).queryByText(status)).toBeNull();
    customer.unmount();

    const {container} = render(
      <MachineProvider><RequestProvider><FigureWorkspace detail={detail} usage={{}} sheet="1" index={0} total={1}
        previousId={null} nextId={null} firstId={null} lastId={null} reviewOnly /></RequestProvider></MachineProvider>,
    );
    const rows = container.querySelectorAll("tbody tr");
    expect(rows).toHaveLength(1);
    expect(within(rows[0] as HTMLElement).getByText(status)).toBeTruthy();
    fireEvent.click(rows[0]);
    const assertHighlights = (scope:HTMLElement) => {
      expect(scope.querySelectorAll('button[data-callout-id][aria-pressed="true"]')).toHaveLength(found);
    };
    assertHighlights(container.querySelector("figure")!);
    fireEvent.click(screen.getByRole("button",{name:"Illustration full screen"}));
    assertHighlights(screen.getByRole("dialog").querySelector("figure")!);
  },
);

test("customer figure hides marker-review notices", async () => {
  const { container } = render(workspace(await fixture()));
  expect(container.textContent).not.toMatch(/marker review|unapproved|local preview|Expected quantity/i);
});

 test("checkbox, diagram deselection, and fullscreen clear share one selection", async () => {
  const { container } = render(workspace(await fixture()));
  const boxes = screen.getAllByRole("checkbox", { name: "Select A on the drawing" }) as HTMLInputElement[];
  fireEvent.click(boxes[0]);
  const marker = within(container.querySelector("figure")!).getAllByRole("button", {name:/Callout 13: A/})[0];
  expect(marker.getAttribute("aria-pressed")).toBe("true");
  expect(boxes.every(box => box.checked)).toBe(true);
  fireEvent.click(marker);
  expect(boxes.every(box => !box.checked)).toBe(true);
  fireEvent.click(boxes[0]);
  fireEvent.click(screen.getByRole("button", {name:"Illustration full screen"}));
  fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", {name:"Clear selection"}));
  expect(boxes.every(box => !box.checked)).toBe(true);
});


test("one selected part badge covers different original references, stays outside artwork, and deselects the whole part", async () => {
  const detail = await fixture();
  detail.callouts[2].number = 27;
  detail.rows[2].calloutNumbers = [27];
  const {container} = render(workspace(detail));
  const rows = container.querySelectorAll("tbody tr");
  fireEvent.click(rows[2]);
  fireEvent.click(rows[1]); // A and B share Ref 13 but require separate badges.
  const figure = container.querySelector("figure")!;
  const badges = figure.querySelectorAll('button[data-selected-part-number]');
  expect(Array.from(badges, badge => badge.getAttribute("data-selected-part-number"))).toEqual(["A", "B"]);
  const badge = within(figure).getByRole("button", {name:"Deselect part A"});
  expect(badge.textContent).toContain("Ref 13, 27");
  expect(badge.textContent).toContain("2 occurrences");
  // The strip is a sibling before the scrolling drawing, never an overlay.
  const strip = within(figure).getByRole("group", {name:"Selected parts"});
  const stage = figure.querySelector("img")!.parentElement!;
  expect(stage.contains(strip)).toBe(false);
  expect(strip.nextElementSibling?.contains(stage)).toBe(true);
  const markers = figure.querySelectorAll('button[data-callout-id][aria-pressed="true"]');
  expect(markers).toHaveLength(3);
  for (const marker of markers) {
    fireEvent.mouseEnter(marker);
    expect(marker.classList.contains(markerStyles.active)).toBe(false);
    expect(marker.hasAttribute("data-multi-instance")).toBe(false);
  }
  expect(figure.querySelectorAll('[data-diagram-regions] path[data-selected]')).toHaveLength(3);
  const user = userEvent.setup();
  badge.focus();
  await user.keyboard("{Enter}");
  expect(rows[0].hasAttribute("data-active")).toBe(false);
  expect(rows[2].hasAttribute("data-active")).toBe(false);
  expect(rows[1].getAttribute("data-active")).toBe("true");
  expect(figure.querySelectorAll('button[data-selected-part-number]')).toHaveLength(1);
  expect(figure.querySelectorAll('button[data-callout-id]')).toHaveLength(3);
  fireEvent.click(screen.getByRole("button", {name:"Illustration full screen"}));
  const full = screen.getByRole("dialog");
  expect(full.querySelectorAll('button[data-selected-part-number]')).toHaveLength(1);
  fireEvent.click(within(full).getByRole("button", {name:"Clear selection"}));
  expect(full.querySelectorAll('button[data-selected-part-number]')).toHaveLength(0);
  fireEvent.click(within(full).getByRole("button", {name:"Close the illustration"}));
  expect(figure.querySelectorAll('button[data-selected-part-number]')).toHaveLength(0);
});

test("deduplicates actual part numbers even across part IDs and removes every selected identity through the badge", async () => {
  const detail = await fixture();
  detail.rows[2].part.id = "part-c";
  detail.rows[2].figurePart.partId = "part-c";
  detail.rows[2].part.partNumber = "A";
  const {container} = render(workspace(detail));
  const rows = container.querySelectorAll("tbody tr");
  fireEvent.click(rows[0]);
  fireEvent.click(rows[1]);
  fireEvent.click(rows[2]);
  const figure = container.querySelector("figure")!;
  expect(figure.querySelectorAll('button[data-selected-part-number]')).toHaveLength(2);
  const badge = within(figure).getByRole("button", {name:"Deselect part A"});
  expect(badge.textContent).toContain("2 occurrences");
  fireEvent.click(badge);
  expect(rows[0].hasAttribute("data-active")).toBe(false);
  expect(rows[2].hasAttribute("data-active")).toBe(false);
  expect(rows[1].getAttribute("data-active")).toBe("true");
});

test("synthetic legacy markers retain all component fills and use part identity when part-number metadata is unavailable", () => {
  const markers: DrawingMarker[] = [
    {id:"left",number:7,partId:"fixture-part",x:10,y:20,maskPath:"M 1 1 L 5 1 L 5 5 Z"},
    {id:"right",number:8,partId:"fixture-part",x:70,y:20,maskPath:"M 60 1 L 65 1 L 65 5 Z"},
  ];
  const toggle = vi.fn();
  const {container} = render(<DrawingViewer label="Fixture" src="/fixture.png" width={100} height={100}
    markers={markers} selectedPartIds={new Set(["fixture-part"])} hoveredPartId="fixture-part" onTogglePart={toggle} />);
  expect(container.querySelectorAll('path[data-legacy-selected]')).toHaveLength(2);
  expect(container.querySelectorAll('button[data-callout-id][aria-pressed="true"]')).toHaveLength(2);
  expect(container.querySelectorAll('button[data-selected-part-number]')).toHaveLength(1);
  const badge = screen.getByRole("button", {name:"Deselect part fixture-part"});
  expect(badge.textContent).toContain("Ref 7, 8");
  fireEvent.click(badge);
  expect(toggle).toHaveBeenCalledExactlyOnceWith("fixture-part");
});


test("selected rows without positioned markers have a source-reference badge in normal and fullscreen views", async () => {
  const detail = await fixture();
  detail.rows = detail.rows.slice(0, 2);
  detail.rows[0].calloutNumbers = ["NOT SHOWN"];
  detail.callouts = [detail.callouts[1]];
  const {container} = render(workspace(detail));
  const rows = container.querySelectorAll("tbody tr");
  fireEvent.click(rows[0]);
  fireEvent.click(rows[1]);
  const figure = container.querySelector("figure")!;
  expect(figure.querySelectorAll('button[data-selected-part-number]')).toHaveLength(2);
  const badge = within(figure).getByRole("button", {name:"Deselect part A"});
  expect(badge.textContent).toContain("Ref NOT SHOWN");
  expect(badge.textContent).toContain("No mapped highlight");
  expect(badge.textContent).not.toContain("0 occurrences");
  expect(figure.querySelectorAll('button[data-callout-id]')).toHaveLength(1);
  expect(figure.querySelectorAll('[data-diagram-regions] path[data-selected]')).toHaveLength(1);
  fireEvent.click(screen.getByRole("button", {name:"Illustration full screen"}));
  const full = screen.getByRole("dialog");
  expect(full.querySelectorAll('button[data-selected-part-number]')).toHaveLength(2);
  fireEvent.click(within(full).getByRole("button", {name:"Deselect part A"}));
  expect(full.querySelectorAll('button[data-selected-part-number]')).toHaveLength(1);
  fireEvent.click(within(full).getByRole("button", {name:"Close the illustration"}));
  expect(rows[0].hasAttribute("data-active")).toBe(false);
  expect(rows[1].getAttribute("data-active")).toBe("true");
  expect(figure.querySelectorAll('[data-diagram-regions] path[data-selected]')).toHaveLength(1);
});

test("unpositioned Cabin 6.13 selection has a removable badge without inventing drawing mappings", async () => {
  const detail = structuredClone((await getFigureDetail("fig-cabin-6-13"))!);
  const {container} = render(workspace(detail));
  fireEvent.click(container.querySelector("tbody tr")!);
  const figure = container.querySelector("figure")!;
  const badge = within(figure).getByRole("button", {name:`Deselect part ${detail.rows[0].part.partNumber}`});
  expect(badge.textContent).toContain("No mapped highlight");
  expect(figure.querySelectorAll('button[data-callout-id], path[role="button"]')).toHaveLength(0);
  fireEvent.click(badge);
  expect(figure.querySelectorAll('button[data-selected-part-number]')).toHaveLength(0);
});
