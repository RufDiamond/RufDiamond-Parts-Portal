import { describe, expect, it } from "vitest";
import type { ComponentRegion, DiagramMappingDocument } from "./index.js";
import {
  percentagePoint,
  pointInRegion,
  regionPath,
  validateMappingGeometry,
} from "./index.js";

const validDocument = (): DiagramMappingDocument => ({
  schemaVersion: 1,
  figureId: "figure-1",
  drawingFileId: "drawing-1",
  drawingSha256: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  imageWidth: 1200,
  imageHeight: 800,
  catalogueBindingSha256: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
  occurrences: [{
    calloutId: "callout-1",
    figurePartId: "figure-part-1",
    refNo: "7",
    labelRegion: { x: 10, y: 20, width: 30, height: 20 },
    regions: [{
      id: "region-1",
      outer: [[0, 0], [100, 0], [100, 100], [0, 100]],
      holes: [[[20, 20], [40, 20], [40, 40], [20, 40]]],
    }],
    evidence: "reviewed source drawing",
  }],
});

const codesAt = (document: DiagramMappingDocument, path: string) =>
  validateMappingGeometry(document)
    .filter((issue) => issue.path === path)
    .map((issue) => issue.code);

describe("portable diagram geometry", () => {
  it("converts percentages against natural image dimensions", () => {
    const readonlyPoint = [25, 50] as const;

    expect(percentagePoint(readonlyPoint, 1200, 800)).toEqual([300, 400]);
  });

  it("serializes validated rings repeatably without accepting markup", () => {
    const region: ComponentRegion = {
      id: "region-1",
      outer: [[0, 0], [100, 0], [100, 100], [0, 100]],
      holes: [[[20, 20], [40, 20], [40, 40], [20, 40]]],
    };
    const expected = "M 0 0 L 100 0 L 100 100 L 0 100 Z M 20 20 L 40 20 L 40 40 L 20 40 Z";

    expect(regionPath(region)).toBe(expected);
    expect(regionPath(region)).toBe(expected);
    expect(regionPath(region)).not.toMatch(/[<>"']/);
  });

  it("includes the outer boundary but excludes hole interiors and boundaries", () => {
    const region: ComponentRegion = {
      id: "region-1",
      outer: [[0, 0], [100, 0], [100, 100], [0, 100]],
      holes: [[[20, 20], [40, 20], [40, 40], [20, 40]]],
    };

    expect(pointInRegion([10, 10], region)).toBe(true);
    expect(pointInRegion([30, 30], region)).toBe(false);
    expect(pointInRegion([0, 50], region)).toBe(true);
    expect(pointInRegion([20, 30], region)).toBe(false);
    expect(pointInRegion([110, 50], region)).toBe(false);
  });

  it("returns field-addressed issues for malformed input instead of throwing", () => {
    expect(() => validateMappingGeometry({} as DiagramMappingDocument)).not.toThrow();
    expect(validateMappingGeometry({} as DiagramMappingDocument)).toEqual(expect.arrayContaining([
      expect.objectContaining({ path: "imageWidth", code: "invalid_dimension" }),
      expect.objectContaining({ path: "imageHeight", code: "invalid_dimension" }),
      expect.objectContaining({ path: "occurrences", code: "invalid_document" }),
    ]));
  });

  it("accepts a valid document and incomplete draft geometry", () => {
    expect(validateMappingGeometry(validDocument())).toEqual([]);

    const draft = validDocument();
    draft.occurrences[0].figurePartId = null;
    draft.occurrences[0].labelRegion = null;
    draft.occurrences[0].regions = [];
    expect(validateMappingGeometry(draft)).toEqual([]);
  });

  it.each([0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY])(
    "rejects invalid image width %s",
    (imageWidth) => {
      const document = validDocument();
      document.imageWidth = imageWidth;

      expect(codesAt(document, "imageWidth")).toContain("invalid_dimension");
    },
  );

  it("rejects nonfinite and out-of-image polygon coordinates before topology checks", () => {
    const document = validDocument();
    document.occurrences[0].regions[0].outer = [
      [Number.NaN, 0],
      [Number.POSITIVE_INFINITY, 0],
      [1201, 50],
      [0, 100],
    ];

    const issues = validateMappingGeometry(document);
    expect(issues).toEqual(expect.arrayContaining([
      expect.objectContaining({
        path: "occurrences[0].regions[0].outer[0][0]",
        code: "non_finite_coordinate",
      }),
      expect.objectContaining({
        path: "occurrences[0].regions[0].outer[1][0]",
        code: "non_finite_coordinate",
      }),
      expect.objectContaining({
        path: "occurrences[0].regions[0].outer[2][0]",
        code: "point_out_of_bounds",
      }),
    ]));
    expect(codesAt(document, "occurrences[0].regions[0].outer")).not.toContain("self_intersection");
  });

  it.each([
    {
      name: "bow-tie",
      ring: [[0, 0], [100, 100], [0, 100], [100, 0]],
      code: "self_intersection",
    },
    {
      name: "collinear ring",
      ring: [[0, 0], [50, 0], [100, 0]],
      code: "degenerate_ring",
    },
    {
      name: "repeated adjacent vertex",
      ring: [[0, 0], [100, 0], [100, 0], [0, 100]],
      code: "repeated_adjacent_point",
    },
  ])("rejects a $name", ({ ring, code }) => {
    const document = validDocument();
    document.occurrences[0].regions[0].outer = ring as [number, number][];

    expect(codesAt(document, "occurrences[0].regions[0].outer")).toContain(code);
  });

  it.each([
    {
      name: "outside hole",
      holes: [[[90, 90], [110, 90], [110, 110], [90, 110]]],
      code: "hole_outside_outer",
    },
    {
      name: "hole crossing the outer ring",
      holes: [[[90, 20], [110, 20], [110, 40], [90, 40]]],
      code: "hole_intersection",
    },
    {
      name: "crossing holes",
      holes: [
        [[10, 10], [60, 10], [60, 60], [10, 60]],
        [[40, 40], [80, 40], [80, 80], [40, 80]],
      ],
      code: "hole_intersection",
    },
    {
      name: "touching holes",
      holes: [
        [[10, 10], [40, 10], [40, 40], [10, 40]],
        [[40, 20], [70, 20], [70, 50], [40, 50]],
      ],
      code: "hole_intersection",
    },
    {
      name: "nested holes",
      holes: [
        [[10, 10], [80, 10], [80, 80], [10, 80]],
        [[20, 20], [40, 20], [40, 40], [20, 40]],
      ],
      code: "nested_hole",
    },
  ])("rejects a $name", ({ holes, code }) => {
    const document = validDocument();
    document.occurrences[0].regions[0].holes = holes as [number, number][][];

    expect(codesAt(document, "occurrences[0].regions[0].holes")).toContain(code);
  });

  it("rejects duplicate occurrence and region identifiers", () => {
    const document = validDocument();
    document.occurrences.push(structuredClone(document.occurrences[0]));
    document.occurrences[0].regions.push(structuredClone(document.occurrences[0].regions[0]));

    expect(validateMappingGeometry(document)).toEqual(expect.arrayContaining([
      expect.objectContaining({ path: "occurrences[1].calloutId", code: "duplicate_occurrence_id" }),
      expect.objectContaining({ path: "occurrences[0].regions[1].id", code: "duplicate_region_id" }),
    ]));
  });

  it("rejects each geometry size limit before expensive intersection work", () => {
    const tooManyOccurrences = validDocument();
    tooManyOccurrences.occurrences = Array.from({ length: 1001 }, (_, index) => ({
      ...structuredClone(tooManyOccurrences.occurrences[0]),
      calloutId: `callout-${index}`,
      regions: [],
    }));
    expect(codesAt(tooManyOccurrences, "occurrences")).toContain("limit_exceeded");

    const tooManyRegions = validDocument();
    tooManyRegions.occurrences[0].regions = Array.from({ length: 33 }, (_, index) => ({
      id: `region-${index}`,
      outer: [[0, 0], [10, 0], [0, 10]],
      holes: [],
    }));
    expect(codesAt(tooManyRegions, "occurrences[0].regions")).toContain("limit_exceeded");

    const tooManyVertices = validDocument();
    tooManyVertices.occurrences[0].regions[0].outer = Array.from(
      { length: 513 },
      (_, index) => [index % 1200, index % 800],
    );
    expect(codesAt(tooManyVertices, "occurrences[0].regions[0].outer")).toContain("limit_exceeded");

    const tooManyHoles = validDocument();
    tooManyHoles.occurrences[0].regions[0].holes = Array.from(
      { length: 17 },
      () => [[10, 10], [20, 10], [10, 20]],
    );
    expect(codesAt(tooManyHoles, "occurrences[0].regions[0].holes")).toContain("limit_exceeded");

    const tooManyTotalVertices = validDocument();
    tooManyTotalVertices.occurrences = [0, 1].map((occurrenceIndex) => ({
      ...structuredClone(tooManyTotalVertices.occurrences[0]),
      calloutId: `callout-${occurrenceIndex}`,
      regions: Array.from({ length: occurrenceIndex === 0 ? 32 : 9 }, (_, regionIndex) => ({
        id: `region-${occurrenceIndex}-${regionIndex}`,
        outer: Array.from({ length: 500 }, (_, pointIndex) => [
          600 + 100 * Math.cos(2 * Math.PI * pointIndex / 500),
          400 + 100 * Math.sin(2 * Math.PI * pointIndex / 500),
        ] as [number, number]),
        holes: [],
      })),
    }));
    expect(codesAt(tooManyTotalVertices, "occurrences")).toContain("total_vertex_limit_exceeded");
  });

  it("rejects invalid or out-of-image label rectangles", () => {
    const document = validDocument();
    document.occurrences[0].labelRegion = { x: 1190, y: 10, width: 20, height: 20 };

    expect(codesAt(document, "occurrences[0].labelRegion")).toContain("label_out_of_bounds");
  });
});
