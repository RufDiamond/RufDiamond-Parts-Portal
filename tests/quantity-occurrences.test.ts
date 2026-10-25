import { describe, expect, test } from "vitest";
import { buildDrawingMarkers, layoutDrawingMarkers, minimumDrawingWidth } from "@/lib/drawing";
import { applyCalloutPreview } from "@/lib/callout-preview";
import {
  expandCalloutsForQuantity,
  materializeQuantityOccurrences,
  reportQuantityOccurrences,
  quantitySelectionMessage,
  splitCalloutByRegions,
} from "@/lib/quantity-occurrences";
import type { Callout, FigureDetail, FigurePartRow } from "@/types/catalog";

function row(overrides: { id: string; qty: number }): FigurePartRow {
  return {
    figurePart: {
      id: overrides.id,
      figureId: "fig-demo",
      partId: "part-1",
      qty: overrides.qty,
      remarks: null,
      serviceable: true,
    },
    part: {
      id: "part-1",
      partNumber: "10-710050-145",
      description: "M12 threaded rod studs",
      manufacturer: null,
      listPrice: 0,
      currency: "CAD",
      supersededByPartId: null,
      requires: [],
      status: "active",
    },
    calloutNumbers: [4],
  };
}

function callout(partial: Partial<Callout> & Pick<Callout, "id">): Callout {
  return {
    figureId: "fig-demo",
    figurePartId: "fp-4",
    number: 4,
    x: null,
    y: null,
    maskPath: null,
    ...partial,
  };
}

function detail(callouts: Callout[], qty = 4): FigureDetail {
  return {
    figure: {
      id: "fig-demo",
      variantId: "var",
      systemId: "sys",
      name: "Demo",
      groupNo: "2.2",
      drawingFileId: "dwg",
      status: "published",
    },
    drawing: {
      id: "dwg",
      filename: "demo.png",
      format: "png",
      storagePath: "/drawings/demo.png",
      width: 100,
      height: 100,
      uploadedAt: "2026-01-01",
      version: 1,
    },
    system: { id: "sys", name: "Frame", sortOrder: 1 },
    variant: {
      id: "var",
      modelId: "model",
      label: "Demo",
      serialFrom: null,
      serialTo: null,
      catalogRevision: "1",
    },
    rows: [row({ id: "fp-4", qty })],
    callouts,
  };
}

describe("quantity occurrences", () => {
  test("a matching pointer count does not clear an unresolved source identity", () => {
    const sourceRow = { ...row({ id: "fp-4", qty: 1 }), mappingReviewReason: "Printed reference points to a different component." };
    const report = reportQuantityOccurrences([sourceRow], [callout({id:"co-1",x:10,y:20})])[0];
    expect(report).toMatchObject({status:"match",detected:1,needsReview:true,reviewReason:sourceRow.mappingReviewReason});
    expect(quantitySelectionMessage(report)).toContain(sourceRow.mappingReviewReason);
    expect(quantitySelectionMessage(report)).not.toContain("All 1 instances");
  });
  test("Quantity is the expected instance count and shortfalls need review", () => {
    const rows = [row({ id: "fp-4", qty: 4 })];
    const callouts = [callout({ id: "co-1", x: 10, y: 20 })];
    const reports = reportQuantityOccurrences(
      rows,
      expandCalloutsForQuantity(rows, callouts),
    );
    expect(reports[0]).toEqual(
      expect.objectContaining({
        expected: 4,
        detected: 1,
        slots: 4,
        status: "shortfall",
        needsReview: true,
      }),
    );
  });

  test("expandCalloutsForQuantity creates shared Ref. No. slots up to Quantity", () => {
    const rows = [row({ id: "fp-4", qty: 4 })];
    const expanded = expandCalloutsForQuantity(rows, [
      callout({ id: "co-1" }),
    ]);
    expect(expanded).toHaveLength(4);
    expect(expanded.every((item) => item.number === 4)).toBe(true);
    expect(expanded.every((item) => item.figurePartId === "fp-4")).toBe(true);
    expect(expanded.map((item) => item.id)).toEqual([
      "co-1",
      "co-1__qty-2",
      "co-1__qty-3",
      "co-1__qty-4",
    ]);
  });

  test("selecting a part lights every positioned instance for that Quantity", () => {
    const rows = [row({ id: "fp-4", qty: 4 })];
    const callouts = [
      callout({ id: "co-1", x: 10, y: 20 }),
      callout({ id: "co-2", x: 30, y: 40 }),
      callout({ id: "co-3", x: 50, y: 60 }),
      callout({ id: "co-4", x: 70, y: 80 }),
    ];
    const markers = buildDrawingMarkers(rows, callouts);
    expect(markers).toHaveLength(4);
    expect(new Set(markers.map((marker) => marker.partId))).toEqual(new Set(["part-1"]));
    expect(markers.every((marker) => marker.number === 4)).toBe(true);
    expect(
      reportQuantityOccurrences(rows, callouts)[0],
    ).toEqual(expect.objectContaining({ status: "match", needsReview: false }));
  });

  test("multi-region geometry becomes one marker per physical instance", () => {
    const base = callout({
      id: "co-1",
      x: 12,
      y: 18,
      componentGeometry: {
        drawingPath: "/drawings/demo.png",
        drawingSha256: "a".repeat(64),
        imageWidth: 100,
        imageHeight: 100,
        instanceIds: ["left", "right"],
        regions: [
          {
            id: "r1",
            outer: [
              [10, 10],
              [20, 10],
              [20, 20],
              [10, 20],
            ],
            holes: [],
          },
          {
            id: "r2",
            outer: [
              [60, 60],
              [70, 60],
              [70, 70],
              [60, 70],
            ],
            holes: [],
          },
        ],
      },
    });
    const split = splitCalloutByRegions(base);
    expect(split).toHaveLength(2);
    expect(split[0].x).toBe(12);
    expect(split[1].x).toBe(65);
    expect(materializeQuantityOccurrences([row({ id: "fp-4", qty: 2 })], [base])).toHaveLength(2);
    expect(
      reportQuantityOccurrences([row({ id: "fp-4", qty: 2 })], [base])[0],
    ).toEqual(expect.objectContaining({ detected: 2, status: "match", needsReview: false }));
  });

  test("applyCalloutPreview zips Quantity-matching proposal markers onto every slot", () => {
    const result = applyCalloutPreview(detail([callout({ id: "co-1" })]), {
      figureId: "fig-demo",
      drawingPath: "public/drawings/demo.png",
      sha256: "b".repeat(64),
      width: 100,
      height: 100,
      notes: "test",
      markers: [
        { number: 4, x: 10, y: 11 },
        { number: 4, x: 20, y: 21 },
        { number: 4, x: 30, y: 31 },
        { number: 4, x: 40, y: 41 },
      ],
    });
    expect(result.detail.callouts.filter((item) => item.x !== null)).toHaveLength(4);
    expect(buildDrawingMarkers(result.detail.rows, result.detail.callouts)).toHaveLength(4);
    expect(result.notice).not.toContain("Quantity review");
  });

  test("applyCalloutPreview keeps a single proposal on the imported callout and flags Quantity shortfall", () => {
    const result = applyCalloutPreview(detail([callout({ id: "co-1" })]), {
      figureId: "fig-demo",
      drawingPath: "public/drawings/demo.png",
      sha256: "b".repeat(64),
      width: 100,
      height: 100,
      notes: "test",
      markers: [{ number: 4, x: 75.39, y: 52.85 }],
    });
    expect(result.detail.callouts).toEqual([
      expect.objectContaining({ id: "co-1", x: 75.39, y: 52.85 }),
    ]);
    expect(result.notice).toContain("Quantity review");
    expect(result.notice).toContain("flagged");
  });
});


test("a completely unmapped Quantity is flagged for review", () => {
  expect(reportQuantityOccurrences([row({ id: "fp-4", qty: 4 })], [callout({ id: "empty" })])[0])
    .toMatchObject({ detected: 0, expected: 4, status: "unmapped", needsReview: true });
});

test("physical regions supply every pointer even when no printed-label coordinate is available", () => {
  const source = callout({ id: "regions-only", componentGeometry: {
    instanceIds: ["left", "middle", "right"],
    drawingPath: "/drawings/demo.png", drawingSha256: "a".repeat(64), imageWidth: 100, imageHeight: 100,
    regions: [10, 30, 50].map((x) => ({ id: `r-${x}`, outer: [[x,10],[x+8,10],[x+8,18],[x,18]], holes: [] })),
  } });
  const rows = [row({ id: "fp-4", qty: 3 })];
  expect(buildDrawingMarkers(rows, [source])).toHaveLength(3);
  expect(reportQuantityOccurrences(rows, [source])[0]).toMatchObject({ detected: 3, status: "match" });
});

test.each([NaN, Infinity, -1, 101])("invalid coordinate %s cannot count as a detected instance", (x) => {
  const rows = [row({ id: "fp-4", qty: 1 })];
  const observations = [callout({ id: "invalid", x, y: 20 })];
  expect(buildDrawingMarkers(rows, observations)).toHaveLength(0);
  expect(reportQuantityOccurrences(rows, observations)[0]).toMatchObject({ detected: 0, needsReview: true });
});


test("separate contours of one physical component do not inflate Quantity", () => {
  const source = callout({ id: "one-component", x: 10, y: 10, componentGeometry: {
    drawingPath: "/drawings/demo.png", drawingSha256: "a".repeat(64), imageWidth: 100, imageHeight: 100,
    regions: [10, 30].map((x) => ({ id: `r-${x}`, outer: [[x,10],[x+8,10],[x+8,18],[x,18]], holes: [] })),
  } });
  const rows = [row({ id: "fp-4", qty: 1 })];
  expect(buildDrawingMarkers(rows, [source])).toHaveLength(1);
  expect(reportQuantityOccurrences(rows, [source])[0]).toMatchObject({ detected: 1, status: "match" });
});


test("three source locations for Quantity four remain visible and flagged for review", () => {
  const result = applyCalloutPreview(detail([callout({ id: "co-1" })]), {
    figureId: "fig-demo", drawingPath: "public/drawings/demo.png", sha256: "b".repeat(64),
    width: 100, height: 100, notes: "test", markers: [
      { number: 4, x: 10, y: 10 }, { number: 4, x: 30, y: 30 }, { number: 4, x: 50, y: 50 },
    ],
  });
  expect(buildDrawingMarkers(result.detail.rows, result.detail.callouts)).toHaveLength(3);
  expect(reportQuantityOccurrences(result.detail.rows, result.detail.callouts)[0]).toMatchObject({ detected: 3, expected: 4, needsReview: true });
});


test("nearby physical-instance labels remain separate without changing physical coordinates", () => {
  const markers = [0,1,2,3].map((i) => ({ id: `m-${i}`, partId: "part-1", number: 4, x: 50, y: 50 + i }));
  const before = structuredClone(markers);
  const positions = layoutDrawingMarkers(markers, 500, 300);
  expect(markers).toEqual(before);
  expect(positions.size).toBe(4);
  const placed = Array.from(positions.values());
  for (let i = 0; i < placed.length; i++) for (let j = i + 1; j < placed.length; j++) {
    expect(Math.abs(placed[i].x - placed[j].x) * 5 >= 35.99 || Math.abs(placed[i].y - placed[j].y) * 3 >= 35.99).toBe(true);
  }
  expect(layoutDrawingMarkers(markers, 500, 300)).toEqual(positions);
});

test("unselected labels are separated before the first click, including different parts", () => {
  // The live Bumper 2.1 right-hand washer/nut labels are only about 16px apart.
  const markers = [
    { id: "washer", partId: "washer", number: 3, x: 83, y: 36 },
    { id: "nut", partId: "nut", number: 4, x: 80, y: 34 },
  ];
  const before = structuredClone(markers);
  const layout = layoutDrawingMarkers(markers, 530, 298);
  expect(layout.size).toBe(2);
  const a = layout.get("washer")!, b = layout.get("nut")!;
  expect(Math.abs(a.x-b.x)*5.3 >= 32 || Math.abs(a.y-b.y)*2.98 >= 32).toBe(true);
  expect(markers).toEqual(before);
});

test("a lone top-edge callout stays on its source point (no fake second leader)", () => {
  // Filters Ref. 1 sits near y=5%. Display height ~298px puts that under the
  // old 18px edge pad, which used to shove the badge and draw a second leader.
  const markers = [{ id: "co-1-1-0001", partId: "prt-36-00304", number: 1, x: 33.6, y: 5.0 }];
  const positions = layoutDrawingMarkers(markers, 530, 298);
  expect(positions.get("co-1-1-0001")).toEqual({ x: 33.6, y: 5.0 });
});

test("zero quantity with no occurrences needs no physical mapping", () => {
  expect(reportQuantityOccurrences([row({ id: "fp-4", qty: 0 })], [])[0])
    .toMatchObject({ expected: 0, detected: 0, status: "match", needsReview: false });
});


test("dense wheel labels still separate when anchor-relative search exhausts the canvas", async () => {
  const { getFigureDetail } = await import("@/data/repository");
  const { loadCalloutPreview } = await import("@/data/callout-preview.server");
  const source = (await getFigureDetail("fig-tire-wheel-5-1"))!;
  const { detail } = await loadCalloutPreview(source, "hosted-review");
  const markers = buildDrawingMarkers(detail.rows, detail.callouts);
  expect(markers.length).toBeGreaterThan(50);
  const placed = [...layoutDrawingMarkers(markers, 500, 281.25).values()];
  for (let i=0;i<placed.length;i++) for (let j=i+1;j<placed.length;j++) {
    expect(Math.abs(placed[i].x-placed[j].x)*5 >= 35.99 || Math.abs(placed[i].y-placed[j].y)*2.8125 >= 35.99).toBe(true);
  }
});


test.each([36, 48])("dense canvases reserve enough space for %ipx label targets", (gap) => {
  for (const count of [2, 38, 49, 58, 100]) for (const ratio of [0.75, 1, 16/9, 3]) {
    const width = minimumDrawingWidth(count, ratio, gap);
    const height = width / ratio;
    expect(Math.floor((width + 0.001)/gap)*Math.floor((height + 0.001)/gap)).toBeGreaterThanOrEqual(count);
    const markers = Array.from({length:count}, (_, i) => ({id:`m-${i}`, partId:`p-${i}`, number:i, x:50, y:50}));
    const positions = [...layoutDrawingMarkers(markers,width,height,gap).values()];
    for (let i=0;i<count;i++) {
      expect(positions[i].x).toBeGreaterThanOrEqual(0);
      expect(positions[i].x).toBeLessThanOrEqual(100);
      expect(positions[i].y).toBeGreaterThanOrEqual(0);
      expect(positions[i].y).toBeLessThanOrEqual(100);
      for (let j=i+1;j<count;j++) expect(Math.abs(positions[i].x-positions[j].x)*width/100 >= gap-0.01 || Math.abs(positions[i].y-positions[j].y)*height/100 >= gap-0.01).toBe(true);
    }
  }
});
