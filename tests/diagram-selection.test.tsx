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

test("label, component, and table focus converge; multiple items stay selected and quotes remain independent", async () => {
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
  expect((screen.getAllByRole("checkbox", { name: "Add A to the cart" })[0] as HTMLInputElement).checked).toBe(false);
  fireEvent.click(screen.getAllByRole("checkbox", { name: "Add A to the cart" })[0]);
  fireEvent.click(tableRows()[1]);
  expect(regions()[1].getAttribute("aria-pressed")).toBe("true");
  expect(regions()[0].getAttribute("aria-pressed")).toBe("true");
  expect(regions()[2].getAttribute("aria-pressed")).toBe("true");
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
  fireEvent.click(screen.getByRole("button", { name: /Add to cart/ }));
  expect(screen.getByRole("button", { name: /Check cart · 1/ })).toBeTruthy();
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
