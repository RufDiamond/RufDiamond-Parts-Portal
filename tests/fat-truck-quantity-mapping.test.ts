import fs from "node:fs/promises";
import { createHash } from "node:crypto";
import { afterEach, expect, test, vi } from "vitest";
import { getFigureDetail } from "@/data/repository";
import { loadCalloutPreview } from "@/data/callout-preview.server";
import { buildDrawingMarkers } from "@/lib/drawing";
import { reportQuantityOccurrences } from "@/lib/quantity-occurrences";
import { pointInRegion } from "@rufdiamond/contracts/diagram-geometry";
import { figures } from "@/data/ft3-wagon";

const hash = (bytes: Buffer) => createHash("sha256").update(bytes).digest("hex");
afterEach(() => vi.restoreAllMocks());

test("quantity supplements add all physical pointers through the validated loader", async () => {
  const original = (await getFigureDetail("fig-hydraulic-4-4"))!;
  const callout = original.callouts[0];
  const row = original.rows.find(r=>r.figurePart.id===callout.figurePartId)!;
  const figure = {
    figureId: original.figure.id,
    original: { path: `public${original.drawing!.storagePath}`, sha256: hash(await fs.readFile(`public${original.drawing!.storagePath}`)), width: original.drawing!.width, height: original.drawing!.height },
    annotations: [{ calloutId: callout.id, figurePartId:row.figurePart.id, partNumber:row.part.partNumber,
      number:callout.number, x:10, y:10, polygons:[[[10,10],[15,10],[15,15],[10,15]],[[40,40],[45,40],[45,45],[40,45]]],
      instanceIds:["first","second"], evidence:"Test fixture with two explicitly separate source components" }],
    notes:"Test only",
  };
  const manifest={schemaVersion:1,status:"NOT_FOR_CUSTOMER_USE",reviewer:null,catalogueSha256:hash(await fs.readFile("src/data/ft3-wagon.ts")),figures:[figure]};
  const read=fs.readFile.bind(fs);
  vi.spyOn(fs,"readFile").mockImplementation(async (file,options)=> {
    if(String(file).endsWith("/part-highlights-quantity-chassis.json")) return Buffer.from(JSON.stringify(manifest)) as never;
    return read(file,options as never) as never;
  });
  const result=await loadCalloutPreview(original,"hosted-review");
  expect(buildDrawingMarkers(result.detail.rows,result.detail.callouts).filter(m=>m.figurePartId===row.figurePart.id)).toHaveLength(2);
  expect(reportQuantityOccurrences(result.detail.rows,result.detail.callouts).find(r=>r.figurePartId===row.figurePart.id)?.detected).toBe(2);
  expect(original.callouts[0].componentGeometry).toBeUndefined();
});

const supplements = ["chassis", "cabin", "engine-electric"];

test("Frame 2.2 Ref 4 maps all four actual studs, excluding the fairlead and blank offsets", async () => {
  const result = await loadCalloutPreview((await getFigureDetail("fig-frame-assy-2-2"))!, "hosted-review");
  const callout = result.detail.callouts.find(c=>c.number===4)!;
  expect(result.detail.rows.find(r=>r.figurePart.id===callout.figurePartId)!.part.partNumber).toBe("10-710050-145");
  const geometry = callout.componentGeometry!;
  // Independently inspected source PNG pixels: two upper-right studs and two
  // lower-left studs. A count-only assertion misses translated, misplaced masks.
  for (const point of [[905,437],[867,459],[717,564],[679,589]] as [number,number][]) {
    expect(geometry.regions.filter(r=>pointInRegion(point,r)), `actual stud ${point}`).toHaveLength(1);
  }
  for (const point of [[890,460],[900,478],[792,401]] as [number,number][]) {
    expect(geometry.regions.some(r=>pointInRegion(point,r)), `not a stud ${point}`).toBe(false);
  }
  expect(buildDrawingMarkers(result.detail.rows,result.detail.callouts).filter(m=>m.figurePartId===callout.figurePartId)).toHaveLength(4);
});

test("quantity geometry cannot bind to the old image when replacement evidence is missing", async () => {
  const read = fs.readFile.bind(fs);
  vi.spyOn(fs, "readFile").mockImplementation(async (file, options) => {
    const bytes = await read(file, options as never);
    if (!String(file).endsWith("/part-highlights-quantity-chassis.json")) return bytes as never;
    const manifest = JSON.parse(bytes.toString());
    delete manifest.figures.find((f: {figureId:string}) => f.figureId === "fig-drive-system-3-1").replacement;
    return Buffer.from(JSON.stringify(manifest)) as never;
  });
  const result = await loadCalloutPreview((await getFigureDetail("fig-drive-system-3-1"))!, "hosted-review");
  expect(result.notice).toContain("Part highlights unavailable");
  for (const callout of result.detail.callouts) {
    if (callout.componentGeometry) expect(callout.componentGeometry.drawingPath).toBe(result.detail.drawing!.storagePath);
  }
  expect(reportQuantityOccurrences(result.detail.rows, result.detail.callouts).find(r=>r.refNumbers.includes(2))!.detected).toBe(1);
});

test("a later source correction cannot erase an earlier validation failure or enable supplements", async () => {
  const read = fs.readFile.bind(fs);
  vi.spyOn(fs, "readFile").mockImplementation(async (file, options) => {
    if (String(file).endsWith("/part-highlights.json")) return Buffer.from("invalid JSON") as never;
    return read(file, options as never) as never;
  });
  const result = await loadCalloutPreview((await getFigureDetail("fig-drive-system-3-1"))!, "hosted-review");
  expect(result.notice).toContain("Part highlights unavailable");
  expect(reportQuantityOccurrences(result.detail.rows, result.detail.callouts).find(r=>r.refNumbers.includes(2))!.detected).toBe(1);
});

test.each(supplements)("every %s quantity contour reaches the real viewer with its physical identity", async (group) => {
  const manifest = JSON.parse(await fs.readFile(`tools/callouts/review/part-highlights-quantity-${group}.json`, "utf8")) as {
    figures: { figureId: string; annotations: { calloutId: string; instanceIds?: string[]; polygons: unknown[] }[] }[];
  };
  for (const figure of manifest.figures) {
    const original = (await getFigureDetail(figure.figureId))!;
    const snapshot = structuredClone(original);
    const result = await loadCalloutPreview(original, "hosted-review");
    expect(result.notice, figure.figureId).not.toMatch(/unavailable|display-only/);
    const markers = buildDrawingMarkers(result.detail.rows, result.detail.callouts);
    for (const annotation of figure.annotations) {
      const callout = result.detail.callouts.find(c => c.id === annotation.calloutId)!;
      if (!annotation.polygons.length || original.callouts.find(c=>c.id===callout.id)?.maskPath) continue;
      expect(callout.componentGeometry?.regions.length, `${figure.figureId}/${annotation.calloutId}`).toBe(annotation.polygons.length);
      expect(markers.filter(m=>m.id===callout.id || m.id.startsWith(`${callout.id}__instance-`)).length,
        `${figure.figureId}/${annotation.calloutId} pointers`).toBe(new Set(annotation.instanceIds ?? [callout.id]).size);
    }
    expect(original).toEqual(snapshot);
  }
});

test("the source audit covers every catalogue row and its counts agree with the live loader", async () => {
  const auditedFigures = new Set<string>();
  let auditedRows = 0;
  for (const group of supplements) {
    const audit = JSON.parse(await fs.readFile(`tools/callouts/review/quantity-${group}-audit.json`, "utf8")) as {
      figures: {figureId:string;rows:{figurePartId:string;qty:number;visibleMapped?:number;mappedVisible?:number;runtimeDetectedIncludingMarkers?:number}[]}[];
    };
    for (const figure of audit.figures) {
      expect(auditedFigures.has(figure.figureId)).toBe(false);
      auditedFigures.add(figure.figureId);
      const result = await loadCalloutPreview((await getFigureDetail(figure.figureId))!, "hosted-review");
      const reports = reportQuantityOccurrences(result.detail.rows, result.detail.callouts);
      expect(new Set(figure.rows.map(r=>r.figurePartId))).toEqual(new Set(result.detail.rows.map(r=>r.figurePart.id)));
      for (const row of figure.rows) {
        const report = reports.find(r=>r.figurePartId===row.figurePartId)!;
        expect(report.expected).toBe(row.qty);
        expect(report.detected, `${figure.figureId}/${row.figurePartId}`).toBe(row.runtimeDetectedIncludingMarkers ?? row.visibleMapped ?? row.mappedVisible);
        auditedRows++;
      }
    }
  }
  expect(auditedFigures).toEqual(new Set(figures.map(f=>f.id)));
  expect(auditedRows).toBe(635);
});

test.each(supplements)("%s source probes survive loading and preserve holes", async group => {
  type Probe = {figureId:string;reference?:number;refNo?:number;point:[number,number];expected:string;x?:number;y?:number;polygonIndex?:number};
  const audit = JSON.parse(await fs.readFile(`tools/callouts/review/quantity-${group}-audit.json`, "utf8")) as {probes?:Probe[];geometricProbes?:Probe[]};
  const probes = audit.geometricProbes ?? audit.probes!;
  const byFigure = Map.groupBy(probes, p=>p.figureId);
  for (const [figureId, samples] of byFigure) {
    const result = await loadCalloutPreview((await getFigureDetail(figureId))!, "hosted-review");
    for (const probe of samples) {
      const ref = probe.reference ?? probe.refNo;
      const geometry = result.detail.callouts.find(c=>c.number===ref)!.componentGeometry!;
      expect(geometry, `${figureId}/${ref}`).toBeDefined();
      const point: [number,number] = group === "engine-electric" ? probe.point : [probe.point[0]*geometry.imageWidth/100,probe.point[1]*geometry.imageHeight/100];
      const regions = probe.polygonIndex === undefined ? geometry.regions : [geometry.regions[probe.polygonIndex]];
      expect(regions.some(r=>pointInRegion(point,r)), `${figureId}/${ref} ${point}`).toBe(probe.expected === "inside");
    }
  }
});

test("source identity conflicts remain Review even when all expected pointers are positioned", async () => {
  const result = await loadCalloutPreview((await getFigureDetail("fig-electric-11-3"))!, "hosted-review");
  const report = reportQuantityOccurrences(result.detail.rows,result.detail.callouts).find(r=>r.refNumbers.includes(18))!;
  expect(report).toMatchObject({status:"match",needsReview:true});
  expect(report.reviewReason).toContain("Source conflict");
});
