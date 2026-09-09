import { Value } from "@sinclair/typebox/value";
import { describe, expect, it } from "vitest";
import {
  ComponentRegionSchema,
  DiagramMappingDocumentSchema,
  ImagePointSchema,
  LabelRegionSchema,
  MappingApproveInputSchema,
  MappingEditorDocumentSchema,
  MappingIssueSchema,
  MappingRevisionSchema,
  MappingSaveInputSchema,
  MappingWriteContextSchema,
  OccurrenceMappingSchema,
} from "./index.js";

const validDocument = {
  schemaVersion: 1,
  figureId: "figure-1",
  drawingFileId: "drawing-1",
  drawingSha256: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  imageWidth: 1200,
  imageHeight: 800,
  catalogueBindingSha256: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
  occurrences: [
    {
      calloutId: "callout-1",
      figurePartId: "figure-part-1",
      refNo: "7",
      labelRegion: { x: 10, y: 20, width: 30, height: 20 },
      regions: [
        {
          id: "region-1",
          outer: [[0, 0], [100, 0], [100, 100], [0, 100]],
          holes: [[[20, 20], [40, 20], [40, 40], [20, 40]]],
        },
      ],
      evidence: "reviewed source drawing",
    },
  ],
} as const;

describe("diagram mapping schemas", () => {
  it("accepts the serializable document and shared response envelopes", () => {
    const document = structuredClone(validDocument);
    const revision = {
      revisionId: "revision-1",
      version: 2,
      checksum: "cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc",
      document,
      approval: {
        reviewerId: "reviewer-1",
        reviewedAt: "2026-09-08T12:00:00.000Z",
      },
    };

    expect(Value.Check(ImagePointSchema, [25, 50])).toBe(true);
    expect(Value.Check(ComponentRegionSchema, document.occurrences[0].regions[0])).toBe(true);
    expect(Value.Check(LabelRegionSchema, document.occurrences[0].labelRegion)).toBe(true);
    expect(Value.Check(OccurrenceMappingSchema, document.occurrences[0])).toBe(true);
    expect(Value.Check(DiagramMappingDocumentSchema, document)).toBe(true);
    expect(Value.Check(MappingIssueSchema, {
      path: "occurrences[0].regions[0].outer",
      code: "self_intersection",
      message: "Ring edges must not intersect",
    })).toBe(true);
    expect(Value.Check(MappingRevisionSchema, revision)).toBe(true);
    expect(Value.Check(MappingSaveInputSchema, { document })).toBe(true);
    expect(Value.Check(MappingApproveInputSchema, {
      revisionId: "revision-1",
      checksum: "cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc",
    })).toBe(true);
    expect(Value.Check(MappingWriteContextSchema, {
      figureId: "figure-1",
      expectedVersion: 2,
      idempotencyKey: "request-1",
    })).toBe(true);
    expect(Value.Check(MappingEditorDocumentSchema, {
      version: 2,
      revision,
      document,
    })).toBe(true);
    expect(Value.Check(MappingEditorDocumentSchema, {
      version: 1,
      revision: null,
      document,
    })).toBe(true);
  });

  it("allows incomplete draft associations, labels and regions", () => {
    const document = {
      ...structuredClone(validDocument),
      occurrences: [{
        ...structuredClone(validDocument.occurrences[0]),
        figurePartId: null,
        labelRegion: null,
        regions: [],
      }],
    };

    expect(Value.Check(DiagramMappingDocumentSchema, document)).toBe(true);
  });

  it("rejects unknown and markup-bearing properties at every geometry object", () => {
    const document = structuredClone(validDocument);

    expect(Value.Check(DiagramMappingDocumentSchema, {
      ...document,
      maskPath: "<path onclick='steal()'>",
    })).toBe(false);
    expect(Value.Check(DiagramMappingDocumentSchema, {
      ...document,
      occurrences: [{ ...document.occurrences[0], href: "javascript:steal()" }],
    })).toBe(false);
    expect(Value.Check(DiagramMappingDocumentSchema, {
      ...document,
      occurrences: [{
        ...document.occurrences[0],
        labelRegion: { ...document.occurrences[0].labelRegion, onload: "steal()" },
      }],
    })).toBe(false);
    expect(Value.Check(DiagramMappingDocumentSchema, {
      ...document,
      occurrences: [{
        ...document.occurrences[0],
        regions: [{ ...document.occurrences[0].regions[0], svg: "<path />" }],
      }],
    })).toBe(false);
  });

  it("rejects invalid dimensions and each per-container size limit", () => {
    const document = structuredClone(validDocument);
    const point = [1, 1] as const;

    expect(Value.Check(DiagramMappingDocumentSchema, { ...document, imageWidth: 0 })).toBe(false);
    expect(Value.Check(DiagramMappingDocumentSchema, { ...document, imageHeight: 1.5 })).toBe(false);
    expect(Value.Check(DiagramMappingDocumentSchema, {
      ...document,
      occurrences: Array.from({ length: 1001 }, (_, index) => ({
        ...document.occurrences[0],
        calloutId: `callout-${index}`,
      })),
    })).toBe(false);
    expect(Value.Check(OccurrenceMappingSchema, {
      ...document.occurrences[0],
      regions: Array.from({ length: 33 }, (_, index) => ({
        id: `region-${index}`,
        outer: [[0, 0], [10, 0], [0, 10]],
        holes: [],
      })),
    })).toBe(false);
    expect(Value.Check(ComponentRegionSchema, {
      id: "region-large",
      outer: Array.from({ length: 513 }, () => point),
      holes: [],
    })).toBe(false);
    expect(Value.Check(ComponentRegionSchema, {
      id: "region-holey",
      outer: [[0, 0], [10, 0], [0, 10]],
      holes: Array.from({ length: 17 }, () => [[point, [2, 1], [1, 2]]]),
    })).toBe(false);
  });

  it.each([
    ["drawingSha256", "short"],
    ["drawingSha256", "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"],
    ["catalogueBindingSha256", "gggggggggggggggggggggggggggggggggggggggggggggggggggggggggggggggg"],
  ])("rejects malformed %s digests", (field, digest) => {
    const document = structuredClone(validDocument);

    expect(Value.Check(DiagramMappingDocumentSchema, {
      ...document,
      [field]: digest,
    })).toBe(false);
  });

  it("rejects malformed revision and approval checksums", () => {
    const document = structuredClone(validDocument);

    expect(Value.Check(MappingRevisionSchema, {
      revisionId: "revision-1",
      version: 1,
      checksum: "not-a-sha256",
      document,
      approval: null,
    })).toBe(false);
    expect(Value.Check(MappingApproveInputSchema, {
      revisionId: "revision-1",
      checksum: "ABCDEF",
    })).toBe(false);
  });

  it("keeps every envelope strict and versions positive", () => {
    const document = structuredClone(validDocument);

    expect(Value.Check(MappingSaveInputSchema, { document, maskPath: "M 0 0" })).toBe(false);
    expect(Value.Check(MappingApproveInputSchema, {
      revisionId: "revision-1",
      checksum: "cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc",
      approved: true,
    })).toBe(false);
    expect(Value.Check(MappingWriteContextSchema, {
      figureId: "figure-1",
      expectedVersion: 0,
      idempotencyKey: "request-1",
    })).toBe(false);
  });
});
