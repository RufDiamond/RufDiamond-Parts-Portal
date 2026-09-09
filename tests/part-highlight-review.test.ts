import fs from "node:fs/promises";
import { createHash } from "node:crypto";
import { afterEach, expect, test, vi } from "vitest";
import { getFigureDetail } from "@/data/repository";
import { loadCalloutPreview } from "@/data/callout-preview.server";
import { buildDrawingMarkers } from "@/lib/drawing";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { DrawingViewer } from "@/components/DrawingViewer";
import { pointInRegion } from "@rufdiamond/contracts/diagram-geometry";

const hash = (bytes: Buffer) => createHash("sha256").update(bytes).digest("hex");

async function fixture() {
  const detail = (await getFigureDetail("fig-hydraulic-4-4"))!;
  const callout = detail.callouts.find((item) => item.number === 1)!;
  const row = detail.rows.find((item) => item.figurePart.id === callout.figurePartId)!;
  const drawingPath = `public${detail.drawing!.storagePath}`;
  const manifest = {
    schemaVersion: 1,
    status: "NOT_FOR_CUSTOMER_USE",
    reviewer: null,
    catalogueSha256: hash(await fs.readFile("src/data/ft3-wagon.ts")),
    figures: [{
      figureId: detail.figure.id,
      original: { path: drawingPath, sha256: hash(await fs.readFile(drawingPath)), width: detail.drawing!.width, height: detail.drawing!.height },
      annotations: [{
        calloutId: callout.id, figurePartId: callout.figurePartId!, partNumber: row.part.partNumber,
        number: 1, x: 10, y: 20,
        polygons: [[[30, 40], [35, 40], [35, 45], [30, 45]]],
        evidence: "Test-only hand-checked polygon; not catalogue evidence",
      }],
      notes: "Test fixture",
    }],
  };
  return { detail, manifest };
}

function serveManifest(manifest: unknown) {
  const read = fs.readFile.bind(fs);
  vi.spyOn(fs, "readFile").mockImplementation(async (file, options) => {
    if (String(file).endsWith("/part-highlights.json")) return Buffer.from(JSON.stringify(manifest)) as never;
    if (String(file).endsWith("/source-corrections.json")) return Buffer.from(JSON.stringify({ ...manifest as object, figures: [] })) as never;
    return read(file, options as never) as never;
  });
}

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); });

test("Engine 8.6 shroud has valid source-bound activation and excludes the detached coupling", async () => {
  const original = (await getFigureDetail("fig-engine-8-6"))!;
  const result = await loadCalloutPreview(original, "hosted-review");
  const shroud = result.detail.callouts.find((c) => c.number === 1)!;
  expect(shroud.componentGeometry?.regions).toHaveLength(1);
  expect(pointInRegion([158, 290], shroud.componentGeometry!.regions[0])).toBe(true);
  expect(pointInRegion([260, 170], shroud.componentGeometry!.regions[0])).toBe(false);
  expect(result.notice).not.toContain("display-only");
  expect(original.callouts.find((c) => c.number === 1)?.maskPath).toBeNull();
});

test("Filters review supplies six physical contours while preserving the six original labels", async () => {
  const original = (await getFigureDetail("fig-filters-1-1"))!;
  const result = await loadCalloutPreview(original, "hosted-review");
  const interior = [[310, 192], [296, 523], [645, 210], [648, 583], [915, 160], [938, 535]];
  for (const [index, point] of interior.entries()) {
    const occurrence = result.detail.callouts.find((c) => c.number === index + 1)!;
    expect(occurrence.componentGeometry?.regions).toHaveLength(1);
    expect(pointInRegion(point as [number, number], occurrence.componentGeometry!.regions[0])).toBe(true);
    expect(occurrence.x).toBe(original.callouts[index].x);
    expect(occurrence.y).toBe(original.callouts[index].y);
    expect(pointInRegion([430, 40], occurrence.componentGeometry!.regions[0])).toBe(false);
  }
  expect(original.callouts.every((c) => c.maskPath === null)).toBe(true);
});

test("Hydraulic 4.2 shroud retains its solid left side face outside the circular opening", async () => {
  const result = await loadCalloutPreview((await getFigureDetail("fig-hydraulic-4-2"))!,"hosted-review");
  const geometry = result.detail.callouts.find((c) => c.number === 2)!.componentGeometry!;
  expect(geometry.regions.some((r) => pointInRegion([171,363],r))).toBe(true);
  expect(geometry.regions.some((r) => pointInRegion([248,320],r))).toBe(false);
});

test("Console 6.10 retains neck arms and interior metal without filling its T-shaped opening", async () => {
  const result = await loadCalloutPreview((await getFigureDetail("fig-cabin-6-10"))!,"hosted-review");
  const geometry = result.detail.callouts.find((c) => c.number === 9)!.componentGeometry!;
  expect(geometry.regions.some((r) => pointInRegion([778,425],r))).toBe(false);
  expect(geometry.regions.some((r) => pointInRegion([753,462],r))).toBe(true);
  expect(geometry.regions.some((r) => pointInRegion([609,659],r))).toBe(true);
});

test("Electrical 11.3 scopes the directly labelled fuse holder and excludes panel windows", async () => {
  const result = await loadCalloutPreview((await getFigureDetail("fig-electric-11-3"))!, "hosted-review");
  const contains = (ref: number, point: [number, number]) => result.detail.callouts.find(c => c.number === ref)!.componentGeometry!.regions.some(r => pointInRegion(point, r));
  expect(contains(2, [296, 210])).toBe(true);
  expect(contains(2, [345, 198])).toBe(false);
  expect(contains(15, [765, 157])).toBe(false);
  expect(contains(15, [790, 120])).toBe(false);
  expect(contains(15, [747, 170])).toBe(true);
});

test("Hydraulic 4.1 fittings do not infer similar copies or fill established bores", async () => {
  const result = await loadCalloutPreview((await getFigureDetail("fig-hydraulic-4-1"))!, "hosted-review");
  const contains = (ref: number, point: [number, number]) => result.detail.callouts.find(c => c.number === ref)!.componentGeometry!.regions.some(r => pointInRegion(point, r));
  for (const [ref, point] of [[7,[210,284]],[10,[350,696]],[11,[259,291]],[18,[680,285]]] as const)
    expect(contains(ref, [...point])).toBe(false);
  for (const [ref, point] of [[9,[418,664]],[10,[347,666]],[11,[167,255]],[16,[611,216]],[17,[611,343]]] as const)
    expect(contains(ref, [...point])).toBe(false);
  for (const ref of [7,9,10,11,12,13,14,15,16,17,18])
    expect(result.detail.callouts.find(c => c.number === ref)!.componentGeometry!.regions.length).toBeGreaterThan(0);
});

test("Hydraulic 4.2 hoses retain bend background and only labelled clips", async () => {
  const result = await loadCalloutPreview((await getFigureDetail("fig-hydraulic-4-2"))!, "hosted-review");
  const contains = (ref: number, point: [number, number]) => result.detail.callouts.find(c => c.number === ref)!.componentGeometry!.regions.some(r => pointInRegion(point, r));
  for (const [ref, point] of [[10,[539,391]],[11,[571,394]],[13,[828,278]],[16,[1010,326]],[20,[572,259]],[22,[1169,415]],[24,[656,577]]] as const)
    expect(contains(ref, [...point])).toBe(false);
  expect(contains(16,[900,269])).toBe(true);
  expect(contains(24,[650,603])).toBe(true);
});

test("Windshield frame keeps its narrow right rail separate from the attached bracket", async () => {
  const result = await loadCalloutPreview((await getFigureDetail("fig-cabin-6-2"))!, "hosted-review");
  const frame = result.detail.callouts.find(c => c.number === 26)!.componentGeometry!;
  expect(frame.regions.some(r => pointInRegion([934,340],r))).toBe(false);
  expect(frame.regions.some(r => pointInRegion([944,340],r))).toBe(true);
  for (const point of [[850,400],[783,530],[819,622],[801,565]] as [number,number][])
    expect(frame.regions.some(r => pointInRegion(point,r))).toBe(false);
});

test("Fuel 9.1 excludes unlabelled lookalikes and source-visible clamp bores", async () => {
  const result = await loadCalloutPreview((await getFigureDetail("fig-fuel-system-9-1"))!, "hosted-review");
  const contains = (ref: number, point: [number,number]) => result.detail.callouts.find(c=>c.number===ref)!.componentGeometry!.regions.some(region=>pointInRegion(point,region));
  for (const [ref,point] of [[10,[386,511]],[12,[219,613]],[16,[429,610]],[16,[444,622]],[18,[589,317]],[19,[585,261]],[3,[695,443]],[3,[804,396]]] as [number,[number,number]][]) expect(contains(ref,point)).toBe(false);
  expect(contains(3,[744,412])).toBe(true);
  expect(contains(13,[332,612])).toBe(true);
});

test("Fuel tank and neck corrections exclude foreground cover and established openings", async () => {
  const result = await loadCalloutPreview((await getFigureDetail("fig-fuel-system-9-1"))!, "hosted-review");
  const contains = (ref: number, point: [number,number]) => result.detail.callouts.find(c=>c.number===ref)!.componentGeometry!.regions.some(region=>pointInRegion(point,region));
  for (const [ref,point] of [[2,[780,147]],[6,[744,412]],[6,[575,577]],[6,[561,512]],[8,[491,376]]] as [number,[number,number]][]) expect(contains(ref,point)).toBe(false);
  expect(contains(2,[786,117])).toBe(true);
  expect(contains(6,[715,555])).toBe(true);
});

test("Engine 8.3 removes established support voids but retains visible rear material", async () => {
  const result = await loadCalloutPreview((await getFigureDetail("fig-engine-8-3"))!, "hosted-review");
  const contains = (ref: number, point: [number,number]) => result.detail.callouts.find(c => c.number === ref)!.componentGeometry!.regions.some(r => pointInRegion(point,r));
  for (const point of [[319,269],[340,287],[312,237],[322,322],[333,364]] as [number,number][])
    expect(contains(1,point)).toBe(false);
  expect(contains(1,[329,281])).toBe(true);
  expect(contains(1,[335,375])).toBe(true);
  expect(contains(2,[953,271])).toBe(false);
  expect(contains(3,[684,644])).toBe(false);
  expect(contains(3,[684,695])).toBe(true);
  expect(contains(3,[684,715])).toBe(false);
});

test.each([
  {figure:"fig-hydraulic-4-3",ref:2,inside:[460,240],outside:[510,433]},
  {figure:"fig-cabin-6-4",ref:7,inside:[745,430],outside:[962,356]},
  {figure:"fig-cabin-6-5",ref:7,inside:[715,445],outside:[835,280]},
])("new $figure ref$ref preserves source apertures and foreground occlusions", async ({figure,ref,outside}) => {
  const result = await loadCalloutPreview((await getFigureDetail(figure))!,"hosted-review");
  const geometry = result.detail.callouts.find((c) => c.number === ref)!.componentGeometry!;
  expect(geometry.regions.length).toBeGreaterThan(0);
  expect(geometry.regions.some((r) => pointInRegion(outside as [number,number],r))).toBe(false);
});

test.each([
  {figure:"fig-tire-wheel-5-1",ref:1,regions:3,hole:[630,450]},
  {figure:"fig-tire-wheel-5-1",ref:6,regions:1,hole:[137,580]},
  {figure:"fig-electric-11-5",ref:8,regions:1,hole:[1008,666]},
  {figure:"fig-tire-inflation-10-1",ref:12,regions:1,hole:[571,65]},
])("audited $figure ref$ref has active numeric holes and preserves disjoint regions", async ({figure,ref,regions,hole}) => {
  const original = (await getFigureDetail(figure))!;
  const result = await loadCalloutPreview(original,"hosted-review");
  const geometry = result.detail.callouts.find((c) => c.number === ref)!.componentGeometry!;
  expect(geometry.regions).toHaveLength(regions);
  expect(geometry.regions[0].holes).toHaveLength(1);
  expect(pointInRegion(hole as [number,number],geometry.regions[0])).toBe(false);
  expect(pointInRegion(geometry.regions[0].holes[0][0],geometry.regions[0])).toBe(false);
  expect(result.notice).not.toContain("display-only");
});

test("source-bound outlines reach drawing markers only on review, without changing original data", async () => {
  const { detail, manifest } = await fixture();
  const before = structuredClone(detail);
  serveManifest(manifest);
  vi.stubEnv("NODE_ENV", "production");
  const result = await loadCalloutPreview(detail, "hosted-review");
  expect(buildDrawingMarkers(result.detail.rows, result.detail.callouts).find((marker) => marker.number === 1)?.maskPath)
    .toBe("M 30 40 L 35 40 L 35 45 L 30 45 Z");
  expect(result.notice).toContain("unapproved");
  expect(result.detail.callouts.find((item) => item.number === 1)?.componentGeometry).toMatchObject({
    drawingPath: detail.drawing!.storagePath, imageWidth: 1280, imageHeight: 720,
    regions: [{ outer: [[384, 288], [448, 288], [448, 324], [384, 324]], holes: [] }],
  });
  expect(detail).toEqual(before);
  expect(await loadCalloutPreview(detail)).toEqual({ detail: before, notice: null });
});

test("invalid intersecting numeric regions remain display-only while valid sibling occurrences activate", async () => {
  const { detail, manifest } = await fixture();
  const first = detail.callouts[0];
  detail.callouts.push({ ...first, id: "valid-sibling" });
  manifest.figures[0].annotations.push({ ...manifest.figures[0].annotations[0], calloutId: "valid-sibling" });
  manifest.figures[0].annotations[0].polygons = [[[10,10],[40,40],[10,40],[40,10],[50,20]]];
  serveManifest(manifest);
  const result = await loadCalloutPreview(detail, "hosted-review");
  expect(result.detail.callouts.find((item) => item.id === first.id)?.maskPath).toMatch(/^M /);
  expect(result.detail.callouts.find((item) => item.id === first.id)?.componentGeometry).toBeUndefined();
  expect(result.detail.callouts.find((item) => item.id === "valid-sibling")?.componentGeometry?.regions).toHaveLength(1);
  expect(result.notice).toMatch(/1.*display-only.*invalid/i);
});

test("explicit holes exclude fill and component clicks in review", async () => {
  const { detail, manifest } = await fixture();
  Object.assign(manifest.figures[0].annotations[0], { holes: [[[[31,41],[34,41],[34,44],[31,44]]]] });
  serveManifest(manifest);
  const result = await loadCalloutPreview(detail, "hosted-review");
  const c = result.detail.callouts.find((c) => c.number === 1)!;
  expect(c.componentGeometry!.regions[0].holes).toHaveLength(1);
  expect(pointInRegion([416,306], c.componentGeometry!.regions[0])).toBe(false);
  expect(c.maskPath).toContain("M 31 41");
});

test.each([[], [[], []], [[[[31,41],[101,41],[34,44]]]], [[[[31,41],[34,41]]]]].map((holes) => ({holes})))("rejects malformed hole ownership or coordinates: $holes", async ({holes}) => {
  const { detail, manifest } = await fixture();
  Object.assign(manifest.figures[0].annotations[0], { holes });
  serveManifest(manifest);
  const result = await loadCalloutPreview(detail, "hosted-review");
  expect(result.notice).toContain("unavailable");
});

test.each(["part", "occurrence", "figure-part", "catalogue", "artwork", "bounds", "degenerate", "duplicate", "status"])(
  "does not shade a component with invalid %s evidence", async (fault) => {
    const { detail, manifest } = await fixture();
    const figure = manifest.figures[0];
    const annotation = figure.annotations[0];
    if (fault === "part") annotation.partNumber = "WRONG-PART";
    if (fault === "occurrence") annotation.calloutId = "wrong-occurrence";
    if (fault === "figure-part") annotation.figurePartId = "wrong-row";
    if (fault === "catalogue") manifest.catalogueSha256 = "a".repeat(64);
    if (fault === "artwork") figure.original.sha256 = "a".repeat(64);
    if (fault === "bounds") annotation.polygons[0][0][0] = 101;
    if (fault === "degenerate") annotation.polygons = [[[30, 40], [35, 40], [40, 40]]];
    if (fault === "duplicate") figure.annotations.push(structuredClone(annotation));
    if (fault === "status") manifest.status = "APPROVED";
    serveManifest(manifest);
    const result = await loadCalloutPreview(detail, "hosted-review");
    expect(result.detail.callouts.find((item) => item.number === 1)?.maskPath).toBeNull();
    expect(result.notice).toMatch(/highlight.*unavailable/i);
  },
);

test("preserves supplied positions and an existing component mask", async () => {
  const { detail, manifest } = await fixture();
  detail.callouts[0] = { ...detail.callouts[0], x: 50, y: 60, maskPath: "M 1 1 L 2 1 L 2 2 Z" };
  serveManifest(manifest);
  const result = await loadCalloutPreview(detail, "hosted-review");
  expect(result.detail.callouts[0]).toEqual(detail.callouts[0]);
});

test("uses the corrected bumper artwork and its own coordinates only in review", async () => {
  const detail = (await getFigureDetail("fig-frame-assy-2-1"))!;
  const before = structuredClone(detail);
  const result = await loadCalloutPreview(detail, "hosted-review");
  expect(result.detail.drawing?.storagePath).toBe("/drawings/ft3w/review-source-20260908/ft3w-frame-assy-2-1.png");
  expect(result.detail.drawing?.width).toBe(1010);
  expect(result.detail.callouts).toHaveLength(7);
  expect(result.detail.callouts.find((item) => item.number === 1)).toMatchObject({ x: 53.2673, y: 90.339, maskPath: expect.stringContaining("M ") });
  expect(result.detail.rows).toEqual(before.rows);
  expect(result.notice).toContain("M10");
  expect(result.notice).toContain("M4");
  expect(result.notice).toContain("unapproved");
  expect(detail).toEqual(before);
  vi.stubEnv("NODE_ENV", "production");
  expect(await loadCalloutPreview(detail)).toEqual({ detail: before, notice: null });
});

test("replacement artwork invalidates coordinates from the old motor plate", async () => {
  const detail = (await getFigureDetail("fig-drive-system-3-1"))!;
  const result = await loadCalloutPreview(detail, "hosted-review");
  expect(result.detail.drawing?.width).toBe(1070);
  expect(result.detail.callouts.find((item) => item.number === 2)).toMatchObject({ x: 7.1028, y: 14.3075 });
  expect(result.detail.callouts.filter((item) => item.maskPath)).toHaveLength(4);
});

test.each(["path", "hash", "dimensions", "provenance", "original"])("rejects invalid replacement %s without exposing its coordinates", async (fault) => {
  const source = JSON.parse(await fs.readFile("tools/callouts/review/source-corrections.json", "utf8"));
  const item = source.figures.find((entry: { figureId: string }) => entry.figureId === "fig-frame-assy-2-1");
  if (fault === "path") item.replacement.path = "public/../private.png";
  if (fault === "hash") item.replacement.sha256 = "a".repeat(64);
  if (fault === "dimensions") item.replacement.width = 999;
  if (fault === "provenance") item.replacement.source.crop.x = -1;
  if (fault === "original") item.original.sha256 = "a".repeat(64);
  const read = fs.readFile.bind(fs);
  vi.spyOn(fs, "readFile").mockImplementation(async (file, options) =>
    String(file).endsWith("/source-corrections.json") ? Buffer.from(JSON.stringify(source)) as never : read(file, options as never) as never,
  );
  const detail = (await getFigureDetail("fig-frame-assy-2-1"))!;
  const result = await loadCalloutPreview(detail, "hosted-review");
  expect(result.detail).toEqual(detail);
  expect(result.notice).toMatch(/highlight.*unavailable/i);
});

test("missing replacement artwork is reported, not silently treated as an absent manifest", async () => {
  const read = fs.readFile.bind(fs);
  vi.spyOn(fs, "readFile").mockImplementation(async (file, options) => {
    if (String(file).includes("review-source-20260908/ft3w-frame-assy-2-1.png")) {
      throw Object.assign(new Error("private artwork path"), { code: "ENOENT" });
    }
    return read(file, options as never) as never;
  });
  const detail = (await getFigureDetail("fig-frame-assy-2-1"))!;
  const result = await loadCalloutPreview(detail, "hosted-review");
  expect(result.detail).toEqual(detail);
  expect(result.notice).toMatch(/highlight.*unavailable/i);
  expect(result.notice).not.toContain("private artwork path");
});

test("selecting one part paints both legitimate occurrence outlines, and clearing it removes both", async () => {
  const { detail, manifest } = await fixture();
  const first = detail.callouts[0];
  detail.callouts.push({ ...first, id: "second-occurrence" });
  manifest.figures[0].annotations.push({
    ...manifest.figures[0].annotations[0], calloutId: "second-occurrence", x: 70, y: 80,
    polygons: [[[60, 70], [65, 70], [65, 75]]],
  });
  serveManifest(manifest);
  const result = await loadCalloutPreview(detail, "hosted-review");
  const markers = buildDrawingMarkers(result.detail.rows, result.detail.callouts);
  const partId = markers.find((marker) => marker.id === first.id)!.partId;
  const render = (selectedPartIds: Set<string>) => renderToStaticMarkup(createElement(DrawingViewer, {
    label: "Occurrence test", src: detail.drawing!.storagePath, width: 1280, height: 720,
    markers, selectedPartIds, zoom: 2,
  }));
  const selected = render(new Set([partId]));
  expect(selected).toContain('fill-rule="evenodd"');
  expect(selected).toContain('d="M 30 40 L 35 40 L 35 45 L 30 45 Z"');
  expect(selected).toContain('d="M 60 70 L 65 70 L 65 75 Z"');
  const cleared = render(new Set());
  expect(cleared).not.toContain('d="M 30 40');
  expect(cleared).not.toContain('d="M 60 70');
});

test.each(["part-highlights.json", "part-highlights-chassis.json", "source-corrections.json"])(
  "every saved outline in %s survives the real runtime validation and reaches its occurrence", async (filename) => {
    const source = JSON.parse(await fs.readFile(`tools/callouts/review/${filename}`, "utf8")) as {
      figures: { figureId: string; annotations: { calloutId: string; polygons: number[][][] }[] }[];
    };
    for (const figure of source.figures) {
      const original = (await getFigureDetail(figure.figureId))!;
      const result = await loadCalloutPreview(original, "hosted-review");
      expect(result.notice, figure.figureId).not.toContain("unavailable");
      for (const item of figure.annotations) {
        const occurrence = result.detail.callouts.find((callout) => callout.id === item.calloutId);
        expect(occurrence, `${figure.figureId}/${item.calloutId}`).toBeDefined();
        if (item.polygons.length) {
          expect(occurrence!.maskPath, item.calloutId).toMatch(/^M /);
          expect(occurrence!.componentGeometry, `${figure.figureId}/${item.calloutId} valid numeric activation`).toBeDefined();
        }
      }
      expect((await getFigureDetail(figure.figureId))!).toEqual(original);
    }
  },
);
