// @vitest-environment jsdom
import { afterEach, expect, test, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { FigureWorkspace } from "@/app/(portal)/figures/[figureId]/FigureWorkspace";
import { getFigureDetail } from "@/data/repository";
import { loadCalloutPreview } from "@/data/callout-preview.server";
import { MachineProvider } from "@/state/MachineContext";
import { RequestProvider } from "@/state/RequestContext";
import chassis from "../tools/callouts/review/quantity-chassis-audit.json";
import cabin from "../tools/callouts/review/quantity-cabin-audit.json";
import engine from "../tools/callouts/review/quantity-engine-electric-audit.json";

vi.mock("next/navigation", () => ({useRouter:()=>({push:vi.fn()})}));
afterEach(cleanup);

// Expected counts come from the independently inspected source audit, not
// buildDrawingMarkers/materializeQuantityOccurrences (the code under test).
interface AuditRow {figurePartId:string;qty:number;found:number}
const cases = [
  ...chassis.figures.map(f=>({figureId:f.figureId,rows:f.rows.map(r=>({figurePartId:r.figurePartId,qty:r.qty,found:r.visibleMapped}))})),
  ...cabin.figures.map(f=>({figureId:f.figureId,rows:f.rows.map(r=>({figurePartId:r.figurePartId,qty:r.qty,found:r.mappedVisible}))})),
  ...engine.figures.map(f=>({figureId:f.figureId,rows:f.rows.map(r=>({figurePartId:r.figurePartId,qty:r.qty,found:r.runtimeDetectedIncludingMarkers}))})),
].filter(f=>f.rows.some(r=>r.qty>1));
const fullscreenRows = new Set(["fp-2-2-04","fp-4-1-04","fp-4-1-14","fp-3-1-02","fp-5-1-04","fp-6-17-18"]);

test.each(cases)("$figureId selects every mapped copy of every multi-quantity row", async ({figureId,rows:audited}) => {
  const original = (await getFigureDetail(figureId))!;
  const {detail} = await loadCalloutPreview(original,"hosted-review");
  const {container} = render(<MachineProvider><RequestProvider>
    <FigureWorkspace detail={detail} usage={{}} sheet="1" index={0} total={1}
      previousId={null} nextId={null} firstId={null} lastId={null} reviewOnly />
  </RequestProvider></MachineProvider>);
  expect(container.querySelectorAll("tbody tr")).toHaveLength(detail.rows.length);
  for (const audit of audited.filter(r=>r.qty>1) as AuditRow[]) {
    const row = detail.rows.find(r=>r.figurePart.id===audit.figurePartId)!;
    const tableRow = container.querySelector(`[data-figure-part-id="${audit.figurePartId}"]`)!;
    expect(container.querySelectorAll(`[data-figure-part-id="${audit.figurePartId}"]`)).toHaveLength(1);
    fireEvent.click(tableRow);
    const samePart = detail.rows.filter(r=>r.part.id===row.part.id);
    const expectedPointers = samePart.reduce((n,r)=>n+audited.find(a=>a.figurePartId===r.figurePart.id)!.found,0);
    const assertGroup = (figure:HTMLElement) => {
      const markers = Array.from(figure.querySelectorAll('button[data-callout-id]'));
      const selected = markers.filter(m=>m.getAttribute("aria-pressed")==="true");
      expect(selected, `${figureId}/${audit.figurePartId}`).toHaveLength(expectedPointers);
      for (const marker of selected) {
        expect(marker.getAttribute("aria-label")).toContain(`: ${row.part.partNumber} — `);
        expect(samePart.flatMap(r=>r.calloutNumbers).map(String)).toContain(marker.textContent);
      }
      for (const shape of figure.querySelectorAll('path[role="button"]')) {
        const belongs = shape.getAttribute("aria-label")?.endsWith(`: ${row.part.partNumber}`) ||
          shape.getAttribute("aria-label")?.includes(`: ${row.part.partNumber} — `);
        expect(shape.getAttribute("aria-pressed"),`${figureId}/${audit.figurePartId} contour`).toBe(belongs ? "true" : "false");
      }
    };
    assertGroup(container.querySelector("figure")!);
    if (fullscreenRows.has(audit.figurePartId)) {
      fireEvent.click(screen.getByRole("button",{name:"Illustration full screen"}));
      assertGroup(screen.getByRole("dialog").querySelector("figure")!);
      fireEvent.click(screen.getByRole("button",{name:"Close the illustration"}));
    }
    // Clicking any copy must clear its whole group, never just that pointer.
    const selectedMarker = container.querySelector('figure button[data-callout-id][aria-pressed="true"]');
    if (selectedMarker) fireEvent.click(selectedMarker);
    else fireEvent.click(tableRow);
    expect(container.querySelectorAll('figure button[data-callout-id][aria-pressed="true"]')).toHaveLength(0);
  }
},30000);

test("the selection audit includes all 268 multi-quantity rows across 40 figures",()=>{
  expect(cases).toHaveLength(40);
  expect(cases.flatMap(f=>f.rows).filter(r=>r.qty>1)).toHaveLength(268);
});
