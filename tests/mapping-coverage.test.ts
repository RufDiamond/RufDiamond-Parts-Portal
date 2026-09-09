import { describe, expect, it } from "vitest";
import { buildMappingCoverage, measureLegacyShape, measureLegacyInventory, legacyCoverageMarkdown, type CoverageFigure, type CoverageOccurrence, type CoverageRevision, } from "../tools/callouts/mapping-coverage";
const sha = "a".repeat(64), drawing = "b".repeat(64), binding = "c".repeat(64);
describe("source-bound legacy shape requirements", () => {
    const source = { catalogueSha256: sha, drawingSha256: drawing, figurePartId: "row-1" };
    const evidence = { ...source, category: "clear-tracing" as const, evidence: "One visible flange and one aperture independently inspected", requiredRegionIds: ["flange", "return"], requiredHoleIds: ["flange-hole-0"], requirementsComplete: true, unresolvedDetails: [] };
    it("reports absent declared regions and holes without deriving requirements from proposal presence", () => {
        expect(measureLegacyShape(source, evidence, ["flange"], [], true)).toMatchObject({ complete: false, missingRegionIds: ["return"], missingHoleIds: ["flange-hole-0"] });
    });
    it("retains unknown and partial assembly extent even when all existing polygons are valid", () => {
        expect(measureLegacyShape(source, null, ["flange"], [], true)).toMatchObject({ category: "unknown", complete: false, requirementsKnown: false });
        expect(measureLegacyShape(source, { ...evidence, requirementsComplete: false, unresolvedDetails: ["Hidden return remains unestablished"] }, ["flange", "return"], ["flange-hole-0"], true).complete).toBe(false);
    });
    it("rejects stale catalogue, stale drawing and foreign row classification evidence", () => {
        for (const wrong of [{ catalogueSha256: "f".repeat(64) }, { drawingSha256: "e".repeat(64) }, { figurePartId: "other-row" }])
            expect(() => measureLegacyShape(source, { ...evidence, ...wrong }, [], [], true)).toThrow(/classification.*source|classification.*identity/i);
    });
    it("does not promote shape satisfaction to source or persisted approval", () => {
        const result = measureLegacyShape(source, evidence, ["flange", "return"], ["flange-hole-0"], true);
        expect(result.complete).toBe(true);
        expect(result).not.toHaveProperty("approved");
        expect(measureLegacyShape(source, evidence, ["flange", "return"], ["flange-hole-0"], false).complete).toBe(false);
    });
    it("rejects malformed or duplicate classification requirements", () => {
        for (const wrong of [{ requirementsComplete: "true" }, { requiredRegionIds: ["flange", "flange"] }, { requiredHoleIds: [""] }, { evidence: "" }, { category: "approved" }])
            expect(() => measureLegacyShape(source, { ...evidence, ...wrong } as typeof evidence, [], [], true)).toThrow(/classification/i);
    });
});
it("exports every real legacy row, source-only observations and proposal topology without claiming persistence", async () => {
    const report = await measureLegacyInventory(process.cwd());
    expect(report.figures).toHaveLength(45);
    expect(report.figures.flatMap(f => f.rowDetails)).toHaveLength(635);
    expect(report.figures.flatMap(f => f.rowDetails.flatMap(r => r.occurrences))).toHaveLength(572);
    expect(report.totals.classifiedSourceRows).toBe(635);
    expect(report.totals.unclassifiedSourceRows).toBe(0);
    const windows = report.figures.find(f => f.id === "fig-cabin-6-1")!;
    expect(windows.coverage.clearUntracedRefs).toEqual(["1", "3"]);
    expect(windows.coverage.sourceQuestionRefs).toEqual([]);
    expect(report.figures.find(f => f.id === "fig-electric-11-3")!.coverage.sourceQuestionRefs).toContain("18");
    const hydraulic = report.figures.find(f => f.id === "fig-hydraulic-4-1")!;
    expect(hydraulic.sourceOnlyObservations.map(o => o.refNo)).toEqual(expect.arrayContaining(["27", "28", "29"]));
    expect(report.persistence).toMatchObject({ targetInspected: false, realWorkbookApplied: false, revisionsCreatedByTask: 0 });
    const wheel = report.figures.find(f => f.id === "fig-tire-wheel-5-1")!.rowDetails.flatMap(r => r.occurrences).find(c => c.refNo === "1")!;
    expect(wheel.proposal).toMatchObject({ numericValid: true, regionCount: 3, holeCount: 1 });
    expect(wheel.shape.complete).toBe(false);
    const safety = report.figures.find(f => f.id === "fig-cabin-6-15")!;
    expect(safety.rowDetails).toHaveLength(9);
    expect(safety.proposalComplete).toBe(false);
    expect(legacyCoverageMarkdown(report)).toContain("fp-6-15-09");
    expect(legacyCoverageMarkdown(report)).toContain("Untraced clear source targets");
});
const figure: CoverageFigure = {
  id: "figure-1",
  identityKind: "canonical",
  sourceChecksum: sha,
  catalogueBindingSha256: binding,
  drawing: { sha256: drawing, width: 100, height: 100 },
  rowIds: ["row-1"],
  conflicts: [],
};
it("classifies exact source-approved table-only coverage separately from complete physical tracing", () => {
  const sourceReviews = [
    {
      decisionId: "review",
      mode: "table-only" as const,
      rowIds: ["row-1"],
      sourceChecksum: sha,
      catalogueBindingSha256: binding,
      reviewerId: "named-reviewer",
      reviewedAt: "2026-09-09T00:00:00Z",
      evidence: "Synthetic table-only source review",
    },
  ];
  const report = buildMappingCoverage(
    [{ ...figure, drawing: null, sourceReviews }],
    [],
    [],
  );
  expect(report.figures[0]).toMatchObject({
    approvedTableOnly: true,
    complete: false,
    unresolvedRowIds: [],
  });
  expect(
    buildMappingCoverage(
      [
        {
          ...figure,
          drawing: null,
          sourceReviews,
          rowIds: ["row-1", "new-row"],
        },
      ],
      [],
      [],
    ).figures[0],
  ).toMatchObject({ approvedTableOnly: false, complete: false });
  expect(
    buildMappingCoverage(
      [
        {
          ...figure,
          drawing: null,
          sourceReviews,
          conflicts: ["SOURCE_CONFLICT"],
        },
      ],
      [],
      [],
    ).figures[0],
  ).toMatchObject({ approvedTableOnly: false, complete: false });
  expect(
    buildMappingCoverage(
      [{ ...figure, drawing: null, sourceReviews }],
      [{ ...occurrence, figurePartId: null }],
      [],
    ).figures[0].approvedTableOnly,
  ).toBe(false);
});
const occurrence: CoverageOccurrence = {
  id: "callout-1",
  figureId: "figure-1",
  figurePartId: "row-1",
  refNo: "7",
  requiredRegionIds: ["left", "right"],
  proposal: null,
};
const revision: CoverageRevision = {
  figureId: "figure-1",
  sourceChecksum: sha,
  revision: {
    revisionId: "revision-1",
    version: 2,
    checksum: "d".repeat(64),
    approval: { reviewerId: "reviewer", reviewedAt: "2026-09-09T00:00:00Z" },
    document: {
      schemaVersion: 1,
      figureId: "figure-1",
      drawingFileId: "drawing-1",
      drawingSha256: drawing,
      imageWidth: 100,
      imageHeight: 100,
      catalogueBindingSha256: binding,
      occurrences: [
        {
          calloutId: "callout-1",
          figurePartId: "row-1",
          refNo: "7",
          labelRegion: { x: 1, y: 1, width: 3, height: 3 },
          regions: [
            {
              id: "left",
              outer: [
                [10, 10],
                [20, 10],
                [20, 20],
                [10, 20],
              ],
              holes: [],
            },
          ],
          evidence: "Exact synthetic source",
        },
      ],
    },
  },
};
describe("measured mapping coverage", () => {
  it("cannot complete one of several known physical regions or infer source approval", () => {
    const result = buildMappingCoverage([figure], [occurrence], [revision]);
    expect(result.figures[0].occurrences[0].missingRegionIds).toEqual([
      "right",
    ]);
    expect(result.figures[0].complete).toBe(false);
    expect(result.figures[0].sourceApproved).toBe(false);
  });
  it("does not count stale source-bound revisions as current geometry or approval", () => {
    const result = buildMappingCoverage(
      [figure],
      [occurrence],
      [{ ...revision, sourceChecksum: "f".repeat(64) }],
    );
    expect(result.figures[0].occurrences[0].state).toBe("stale-source");
    expect(result.figures[0].mappingApproved).toBe(false);
  });
  it("treats zero-callout drawingless Safety as unresolved and reports every nondepicted row", () => {
    const result = buildMappingCoverage(
      [
        {
          ...figure,
          id: "safety-6-15",
          drawing: null,
          rowIds: ["manual", "belt"],
        },
      ],
      [],
      [],
    );
    expect(result.figures[0]).toMatchObject({
      complete: false,
      missingDrawing: true,
      emptyOccurrences: true,
      unresolvedRowIds: ["manual", "belt"],
    });
  });
  it("does not elevate valid proposal geometry or unknown total region requirements to completeness", () => {
    const result = buildMappingCoverage(
      [figure],
      [
        {
          ...occurrence,
          requiredRegionIds: null,
          proposal: {
            sourceChecksum: sha,
            drawingSha256: drawing,
            imageWidth: 100,
            imageHeight: 100,
            labelPresent: true,
            regionIds: ["left"],
            evidence: "One visible component",
          },
        },
      ],
      [],
    );
    expect(result.figures[0].occurrences[0]).toMatchObject({
      state: "proposal-only",
      persisted: false,
      regionRequirementsKnown: false,
    });
    expect(result.figures[0].complete).toBe(false);
  });
  it("blocks known conflicts and missing associations even with approved complete synthetic geometry", () => {
    const full = structuredClone(revision);
    full.revision.document.occurrences[0].regions.push({
      id: "right",
      outer: [
        [30, 30],
        [40, 30],
        [40, 40],
        [30, 40],
      ],
      holes: [],
    });
    const result = buildMappingCoverage(
      [{ ...figure, conflicts: ["SOURCE_DISAGREEMENT"] }],
      [occurrence],
      [full],
    );
    expect(result.figures[0].mappingApproved).toBe(true);
    expect(result.figures[0].complete).toBe(false);
  });
});
