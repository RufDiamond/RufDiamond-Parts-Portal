import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import type {
  ImportDetail,
  MappingDraftManifest,
  MappingEditorDocument,
} from "@rufdiamond/contracts";
const { buildMappingDraft } = await import(
  new URL("../../../tools/callouts/import-mapping-drafts.ts", import.meta.url)
    .href
);
const id = "11111111-1111-4111-8111-111111111111",
  row = "22222222-2222-4222-8222-222222222222",
  callout = "33333333-3333-4333-8333-333333333333",
  actor = "44444444-4444-4444-8444-444444444444",
  source = Buffer.from("synthetic original workbook bytes"),
  legacy = Buffer.from(
    JSON.stringify({
      figures: [{ id: "legacy-figure", name: "Synthetic" }],
      parts: [{ id: "legacy-part", partNumber: "P-1" }],
      figureParts: [
        {
          id: "legacy-row-7",
          figureId: "legacy-figure",
          partId: "legacy-part",
        },
      ],
      callouts: [
        {
          id: "legacy-co-7",
          figureId: "legacy-figure",
          figurePartId: "legacy-row-7",
          number: 7,
        },
      ],
    }),
  ),
  sha = (bytes: Buffer) => createHash("sha256").update(bytes).digest("hex");
const job = {
  id,
  modelId: id,
  variantId: id,
  version: 3,
  state: "applied",
  sourceChecksum: sha(source),
  sourceKind: "synthetic",
  format: "csv",
  lineageKey: "test",
  rowCount: 1,
  validRowCount: 1,
  blockingIssueCount: 0,
  issues: [],
  aliases: [
    {
      sourceRowKey: "a".repeat(64),
      identityKey: "a".repeat(64),
      figureKey: "b".repeat(64),
      figureId: id,
      figurePartId: row,
      partNumber: "P-1",
      calloutId: callout,
      refNo: "7",
    },
  ],
} as ImportDetail;
const editor: MappingEditorDocument = {
  version: 1,
  revision: null,
  sourceConflict: false,
  source: {
    figure: { id, name: "Synthetic", version: 1, variantId: id, modelId: id },
    drawing: {
      id,
      filename: "test.png",
      sha256: "c".repeat(64),
      width: 200,
      height: 100,
      fileVersion: 1,
      mediaType: "image/png",
      validationStatus: "valid",
    },
    catalogueBindingSha256: "d".repeat(64),
    rows: [
      {
        id: row,
        partId: row,
        partNumber: "P-1",
        description: "Bracket",
        qty: 2,
        version: 1,
        refLabels: ["7"],
      },
    ],
    occurrences: [{ id: callout, figurePartId: row, refNo: "7", version: 1 }],
  },
  document: {
    schemaVersion: 1,
    figureId: id,
    drawingFileId: id,
    drawingSha256: "c".repeat(64),
    imageWidth: 200,
    imageHeight: 100,
    catalogueBindingSha256: "d".repeat(64),
    occurrences: [
      {
        calloutId: callout,
        figurePartId: row,
        refNo: "7",
        labelRegion: null,
        regions: [],
        evidence: "",
      },
    ],
  },
};
const manifest: MappingDraftManifest = {
  schemaVersion: 1,
  status: "NOT_FOR_CUSTOMER_USE",
  operatorId: actor,
  jobId: id,
  modelId: id,
  variantId: id,
  figureId: id,
  legacyFigureId: "legacy-figure",
  sourceChecksum: sha(source),
  legacySourceChecksum: sha(legacy),
  catalogueBindingSha256: "d".repeat(64),
  drawingSha256: "c".repeat(64),
  imageWidth: 200,
  imageHeight: 100,
  expectedMappingVersion: 1,
  idempotencyKey: "test-import-draft-1",
  proposals: [
    {
      sourceRowKey: "a".repeat(64),
      legacyCalloutId: "legacy-co-7",
      legacyFigurePartId: "legacy-row-7",
      refNo: "7",
      labelRegion: { x: 1, y: 2, width: 3, height: 4 },
      regions: [
        {
          id: "region-7",
          outer: [
            [10, 10],
            [20, 10],
            [20, 20],
            [10, 20],
          ],
          holes: [],
        },
      ],
      legacyMaskPath: null,
      evidence: "Exact synthetic part and source association",
    },
  ],
};
describe("unapproved source-bound mapping draft bridge", () => {
  it("converts finite percentages to original pixels while preserving aliases and evidence", () => {
    const result = buildMappingDraft(
      manifest,
      job,
      editor,
      source,
      legacy,
      actor,
    );
    expect(result.mode).toBe("dry-run");
    expect(result.document.occurrences[0]).toMatchObject({
      calloutId: callout,
      figurePartId: row,
      labelRegion: { x: 2, y: 2, width: 6, height: 4 },
      regions: [
        {
          id: "region-7",
          outer: [
            [20, 10],
            [40, 10],
            [40, 20],
            [20, 20],
          ],
          holes: [],
        },
      ],
      evidence: manifest.proposals[0].evidence,
    });
    expect(editor.document.occurrences[0].regions).toEqual([]);
  });
  it.each([
    "sourceChecksum",
    "legacySourceChecksum",
    "catalogueBindingSha256",
    "drawingSha256",
  ] as const)("rejects mismatched %s independently", (key) => {
    expect(() =>
      buildMappingDraft(
        { ...manifest, [key]: "e".repeat(64) },
        job,
        editor,
        source,
        legacy,
        actor,
      ),
    ).toThrow(/source|hash|binding/i);
  });
  it("rejects stale dimensions, ambiguous aliases, foreign rows and changed operator/target", () => {
    expect(() =>
      buildMappingDraft(
        { ...manifest, imageWidth: 201 },
        job,
        editor,
        source,
        legacy,
        actor,
      ),
    ).toThrow();
    expect(() =>
      buildMappingDraft(
        manifest,
        { ...job, aliases: [...job.aliases, ...job.aliases] },
        editor,
        source,
        legacy,
        actor,
      ),
    ).toThrow(/ambiguous/i);
    expect(() =>
      buildMappingDraft(
        manifest,
        { ...job, aliases: [{ ...job.aliases[0], figurePartId: id }] },
        editor,
        source,
        legacy,
        actor,
      ),
    ).toThrow(/row/i);
    expect(() =>
      buildMappingDraft(manifest, job, editor, source, legacy, row),
    ).toThrow(/operator/i);
    expect(() =>
      buildMappingDraft(
        { ...manifest, modelId: row },
        job,
        editor,
        source,
        legacy,
        actor,
      ),
    ).toThrow(/target/i);
  });
  it("retains invalid legacy rings/masks as unchanged fallback with explicit issues and never guesses holes", () => {
    const bad = structuredClone(manifest);
    bad.proposals[0].regions[0].outer = [
      [10, 10],
      [20, 20],
      [20, 10],
      [10, 20],
    ];
    bad.proposals[0].legacyMaskPath = "M 1 1 L 2 2 Z";
    const result = buildMappingDraft(bad, job, editor, source, legacy, actor);
    expect(result.issues.length).toBeGreaterThan(0);
    expect(result.fallbacks[0]).toEqual(bad.proposals[0]);
    expect(result.document.occurrences[0].regions).toEqual([]);
  });
});
