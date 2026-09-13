import { describe, expect, test } from "vitest";
import { buildDrawingMarkers } from "@/lib/drawing";
import { applyCalloutPreview } from "@/lib/callout-preview";
import {
  expandCalloutsForQuantity,
  materializeQuantityOccurrences,
  reportQuantityOccurrences,
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
