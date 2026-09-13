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
  expect((screen.getAllByRole("checkbox", { name: "Add A to the cart" })[0] as HTMLInputElement).checked).toBe(true);
  fireEvent.click(tableRows()[1]);
  expect(regions()[1].getAttribute("aria-pressed")).toBe("true");
  expect(regions()[0].getAttribute("aria-pressed")).toBe("true");
  expect(regions()[2].getAttribute("aria-pressed")).toBe("true");
  expect((screen.getAllByRole("checkbox", { name: "Add B to the cart" })[0] as HTMLInputElement).checked).toBe(true);
  fireEvent.keyDown(regions()[0], { key: "Enter" });
  fireEvent.keyDown(regions()[0], { key: " " });
  fireEvent.mouseLeave(figure);
  expect(tableRows()[0].getAttribute("data-active")).toBe("true");
  expect(tableRows()[1].getAttribute("data-active")).toBe("true");
  expect((screen.getAllByRole("checkbox", { name: "Add A to the cart" })[0] as HTMLInputElement).checked).toBe(true);
  fireEvent.click(screen.getByRole("button", { name: "Clear selection" }));
  expect(regions()[0].getAttribute("aria-pressed")).toBe("false");
  expect(regions()[1].getAttribute("aria-pressed")).toBe("false");
  expect((screen.getAllByRole("checkbox", { name: "Add A to the cart" })[0] as HTMLInputElement).checked).toBe(true);
  expect((screen.getAllByRole("checkbox", { name: "Add B to the cart" })[0] as HTMLInputElement).checked).toBe(true);
  fireEvent.click(screen.getByRole("button", { name: /Add to cart/ }));
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
    expect(within(scope).getByRole("status").textContent).toContain(`All ${qty} instances highlighted`);
  };
  assertSelected(container.querySelector("figure")!);
  fireEvent.click(screen.getByRole("button", { name: "Illustration full screen" }));
  assertSelected(screen.getByRole("dialog").querySelector("figure")!);
});

test.each([{found:3,status:"Needs Review"},{found:4,status:"Complete"},{found:5,status:"Needs Review"}])(
  "Quantity 4 with $found physical instances displays $status without duplicating its row",
  async ({found,status}) => {
    const detail = await fixture();
    detail.rows = [detail.rows[0]];
    detail.rows[0].figurePart.qty = 4;
    detail.callouts = Array.from({length:found},(_,i)=>({...detail.callouts[0],id:`physical-${i}`,x:10+i*10,y:20}));
    const {container} = render(workspace(detail));
    const rows = container.querySelectorAll("tbody tr");
    expect(rows).toHaveLength(1);
    expect(within(rows[0] as HTMLElement).getByText(status)).toBeTruthy();
    fireEvent.click(rows[0]);
    const assertValidation = (scope:HTMLElement) => {
      const message = within(scope).getByRole("status").textContent!;
      expect(message).toContain("Expected quantity: 4");
      expect(message).toContain(`Instances found: ${found}`);
      expect(message).toContain(`Status: ${status}`);
      expect(scope.querySelectorAll('button[data-callout-id][aria-pressed="true"]')).toHaveLength(found);
    };
    assertValidation(container.querySelector("figure")!);
    fireEvent.click(screen.getByRole("button",{name:"Illustration full screen"}));
    assertValidation(screen.getByRole("dialog").querySelector("figure")!);
  },
);
