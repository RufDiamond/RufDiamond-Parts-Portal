import fs from "node:fs/promises";
import { afterEach, describe, expect, test, vi } from "vitest";
import { getFigureDetail } from "@/data/repository";
import { loadCalloutPreview } from "@/data/callout-preview.server";
import {
  applyCalloutPreview,
  type PreviewFigure,
} from "@/lib/callout-preview";
import { buildDrawingMarkers } from "@/lib/drawing";
import type { Callout, FigureDetail } from "@/types/catalog";

const REVIEW_PATH = new URL(
  "../tools/callouts/review/proposals.json",
  import.meta.url,
);

function fixtureDetail(callouts: Callout[]): FigureDetail {
  return {
    figure: {
      id: "fig-fixture",
      variantId: "variant-fixture",
      systemId: "system-fixture",
      name: "Fixture",
      groupNo: "1.1",
      drawingFileId: "drawing-fixture",
      status: "published",
    },
    drawing: {
      id: "drawing-fixture",
      filename: "fixture.png",
      format: "png",
      storagePath: "/drawings/fixture.png",
      width: 1280,
      height: 720,
      uploadedAt: "2026-09-07",
      version: 1,
    },
    system: { id: "system-fixture", name: "Fixture", sortOrder: 1 },
    variant: {
      id: "variant-fixture",
      modelId: "model-fixture",
      label: "Fixture",
      serialFrom: null,
      serialTo: null,
      catalogRevision: "fixture",
    },
    rows: [
      {
        figurePart: {
          id: "figure-part-1",
          figureId: "fig-fixture",
          partId: "part-1",
          qty: 1,
          remarks: null,
          serviceable: true,
        },
        part: {
          id: "part-1",
          partNumber: "P-1",
          description: "Fixture part",
          manufacturer: null,
          listPrice: 1,
          currency: "CAD",
          supersededByPartId: null,
          requires: [],
          status: "active",
        },
        calloutNumbers: callouts.map(({ number }) => number),
      },
    ],
    callouts,
  };
}

function fixtureCallout(
  number: number,
  overrides: Partial<Callout> = {},
): Callout {
  return {
    id: `callout-${number}`,
    figureId: "fig-fixture",
    figurePartId: "figure-part-1",
    number,
    x: null,
    y: null,
    maskPath: null,
    ...overrides,
  };
}

function fixtureProposal(markers: PreviewFigure["markers"]): PreviewFigure {
  return {
    figureId: "fig-fixture",
    drawingPath: "public/drawings/fixture.png",
    sha256: "a".repeat(64),
    width: 1280,
    height: 720,
    markers,
    notes: "Fixture proposal",
  };
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("applyCalloutPreview", () => {
  test("adds a renderable real Cabin 6.2 marker without mutating either input", async () => {
    const detail = await getFigureDetail("fig-cabin-6-2");
    expect(detail).not.toBeNull();
    const before = structuredClone(detail!);
    const proposal = fixtureProposal([{ number: 1, x: 20, y: 30 }]);
    proposal.figureId = "fig-cabin-6-2";
    const proposalBefore = structuredClone(proposal);

    const result = applyCalloutPreview(detail!, proposal);

    expect(buildDrawingMarkers(result.detail.rows, result.detail.callouts)).toEqual([
      expect.objectContaining({ number: 1, x: 20, y: 30 }),
    ]);
    expect(detail).toEqual(before);
    expect(proposal).toEqual(proposalBefore);
    expect(result.notice).toContain("unapproved");
  });

  test("keeps an oracle figure deeply equal and preserves positioned coordinates and masks", async () => {
    const detail = await getFigureDetail("fig-cabin-6-1");
    expect(detail).not.toBeNull();
    const proposal = fixtureProposal([{ number: 1, x: 1, y: 2 }]);
    proposal.figureId = "fig-cabin-6-1";

    const result = applyCalloutPreview(detail!, proposal);

    expect(result.detail).toEqual(detail);
    expect(result.detail.callouts[0]).toEqual(detail!.callouts[0]);
  });

  test("rejects a proposal for another figure and both source-conflict figures", async () => {
    const ordinary = fixtureDetail([fixtureCallout(1)]);
    const wrong = fixtureProposal([{ number: 1, x: 20, y: 30 }]);
    wrong.figureId = "fig-other";
    expect(applyCalloutPreview(ordinary, wrong)).toEqual({
      detail: ordinary,
      notice: expect.stringContaining("does not match"),
    });

    for (const figureId of ["fig-frame-assy-2-1", "fig-cabin-6-13"]) {
      const detail = await getFigureDetail(figureId);
      expect(detail).not.toBeNull();
      const proposal = fixtureProposal([{ number: 1, x: 20, y: 30 }]);
      proposal.figureId = figureId;
      const result = applyCalloutPreview(detail!, proposal);
      expect(result.detail).toEqual(detail);
      expect(result.notice).toContain("source conflict");
    }
  });

  test("excludes missing, extra, duplicate-proposal, and duplicate-import numbers", () => {
    const detail = fixtureDetail([
      fixtureCallout(1),
      fixtureCallout(2),
      fixtureCallout(3),
      fixtureCallout(3, { id: "callout-3-second" }),
      fixtureCallout(4),
    ]);
    const proposal = fixtureProposal([
      { number: 1, x: 10, y: 11 },
      { number: 2, x: 20, y: 21 },
      { number: 2, x: 22, y: 23 },
      { number: 3, x: 30, y: 31 },
      { number: 99, x: 40, y: 41 },
    ]);

    const result = applyCalloutPreview(detail, proposal);

    expect(result.detail.callouts.map(({ number, x, y }) => ({ number, x, y }))).toEqual([
      { number: 1, x: 10, y: 11 },
      { number: 2, x: null, y: null },
      { number: 3, x: null, y: null },
      { number: 3, x: null, y: null },
      { number: 4, x: null, y: null },
    ]);
    expect(result.notice).toContain("4 unresolved");
  });

  test("excludes null, missing, cross-figure, and part-mismatched associations", () => {
    const detail = fixtureDetail([
      fixtureCallout(1, { figurePartId: null }),
      fixtureCallout(2, { figurePartId: "missing" }),
      fixtureCallout(3, { figurePartId: "cross-figure" }),
      fixtureCallout(4, { figurePartId: "part-mismatch" }),
    ]);
    detail.rows.push(
      {
        ...structuredClone(detail.rows[0]),
        figurePart: {
          ...structuredClone(detail.rows[0].figurePart),
          id: "cross-figure",
          figureId: "fig-other",
        },
      },
      {
        ...structuredClone(detail.rows[0]),
        figurePart: {
          ...structuredClone(detail.rows[0].figurePart),
          id: "part-mismatch",
          partId: "part-other",
        },
      },
    );
    const proposal = fixtureProposal(
      [1, 2, 3, 4].map((number) => ({ number, x: number * 10, y: number * 10 })),
    );

    const result = applyCalloutPreview(detail, proposal);

    expect(result.detail.callouts).toEqual(detail.callouts);
    expect(result.notice).toContain("4 unresolved");
  });

  test.each([
    [Number.NaN, 10],
    [Number.POSITIVE_INFINITY, 10],
    [10, Number.NEGATIVE_INFINITY],
    [-0.01, 10],
    [100.01, 10],
    [10, -0.01],
    [10, 100.01],
  ])("excludes invalid percentage coordinates (%s, %s)", (x, y) => {
    const detail = fixtureDetail([fixtureCallout(1)]);
    const result = applyCalloutPreview(
      detail,
      fixtureProposal([{ number: 1, x, y }]),
    );
    expect(result.detail.callouts).toEqual(detail.callouts);
  });

  test("keeps two legitimate occurrences associated with one part and separately positioned", () => {
    const rows = fixtureDetail([]).rows;
    const callouts = [
      fixtureCallout(7, { id: "occurrence-a", x: 10, y: 20 }),
      fixtureCallout(7, { id: "occurrence-b", x: 70, y: 80 }),
    ];

    expect(buildDrawingMarkers(rows, callouts)).toEqual([
      expect.objectContaining({ id: "occurrence-a", partId: "part-1", x: 10, y: 20 }),
      expect.objectContaining({ id: "occurrence-b", partId: "part-1", x: 70, y: 80 }),
    ]);
  });
});

describe("loadCalloutPreview", () => {
  test("serves source-validated hosted review markers in a production build without changing the ordinary catalogue", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("RUF_CALLOUT_PREVIEW", "");
    const detail = (await getFigureDetail("fig-cabin-6-2"))!;
    const before = structuredClone(detail);
    const result = await loadCalloutPreview(detail, "hosted-review");

    expect(result.detail.callouts.find(({ number }) => number === 1)).toEqual(
      expect.objectContaining({ x: 34.8047, y: 42.1528 }),
    );
    expect(result.notice).toContain("Marker review");
    expect(result.notice).toContain("unapproved");
    expect(result.notice).toContain("not for ordering");
    expect(detail).toEqual(before);
    await expect(loadCalloutPreview(detail)).resolves.toEqual({ detail: before, notice: null });
  });

  test("hosted review still withholds source conflicts", async () => {
    vi.stubEnv("NODE_ENV", "production");
    const detail = (await getFigureDetail("fig-frame-assy-2-1"))!;
    const result = await loadCalloutPreview(detail, "hosted-review");
    expect(result.detail).toEqual(detail);
    expect(result.notice).toContain("source conflict");
  });

  test.each([
    ["production", "1"],
    ["development", undefined],
    ["development", "0"],
  ])("does not read review files in %s with flag %s", async (nodeEnv, flag) => {
    vi.stubEnv("NODE_ENV", nodeEnv);
    if (flag === undefined) vi.stubEnv("RUF_CALLOUT_PREVIEW", "");
    else vi.stubEnv("RUF_CALLOUT_PREVIEW", flag);
    const readFile = vi.spyOn(fs, "readFile");
    const detail = fixtureDetail([fixtureCallout(1)]);

    await expect(loadCalloutPreview(detail)).resolves.toEqual({
      detail,
      notice: null,
    });
    expect(readFile).not.toHaveBeenCalled();
  });

  test("loads real proposal positions only for an enabled development preview", async () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("RUF_CALLOUT_PREVIEW", "1");
    const detail = await getFigureDetail("fig-cabin-6-2");
    expect(detail).not.toBeNull();

    const result = await loadCalloutPreview(detail!);
    const first = result.detail.callouts.find(({ number }) => number === 1);

    expect(first).toEqual(expect.objectContaining({ x: 34.8047, y: 42.1528 }));
    expect(result.notice).toContain(
      "Local preview — unapproved marker positions; not for ordering.",
    );
  });

  test("keeps details unchanged when the proposal or drawing is absent", async () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("RUF_CALLOUT_PREVIEW", "1");
    const detail = await getFigureDetail("fig-cabin-6-15");
    expect(detail).not.toBeNull();

    const result = await loadCalloutPreview(detail!);

    expect(result.detail).toEqual(detail);
    expect(result.notice).toMatch(/proposal|drawing/i);
  });

  test.each([
    ["path", { storagePath: "/drawings/ft3w/wrong.png" }],
    ["dimensions", { width: 1 }],
  ])("rejects a drawing %s mismatch", async (_kind, drawingPatch) => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("RUF_CALLOUT_PREVIEW", "1");
    const detail = await getFigureDetail("fig-cabin-6-2");
    expect(detail?.drawing).not.toBeNull();
    const altered = structuredClone(detail!);
    altered.drawing = { ...altered.drawing!, ...drawingPatch };

    const result = await loadCalloutPreview(altered);

    expect(result.detail).toEqual(altered);
    expect(result.notice).toContain("mismatch");
  });

  test.each(["catalogue", "artwork"])(
    "rejects changed %s source bytes without leaking a path",
    async (source) => {
      vi.stubEnv("NODE_ENV", "development");
      vi.stubEnv("RUF_CALLOUT_PREVIEW", "1");
      const detail = await getFigureDetail("fig-cabin-6-2");
      expect(detail).not.toBeNull();
      const realReadFile = fs.readFile.bind(fs);
      vi.spyOn(fs, "readFile").mockImplementation(async (path, options) => {
        const value = String(path);
        const isTarget =
          source === "catalogue"
            ? value.endsWith("src/data/ft3-wagon.ts")
            : value.endsWith("public/drawings/ft3w/ft3w-cabin-6-2.png");
        if (isTarget) return Buffer.from("changed source bytes") as never;
        return realReadFile(path, options as never) as never;
      });

      const result = await loadCalloutPreview(detail!);

      expect(result.detail).toEqual(detail);
      expect(result.notice).toContain("source mismatch");
      expect(result.notice).not.toContain("/Users/");
    },
  );

  test("shows a generic notice and logs diagnostics for unexpected file errors", async () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("RUF_CALLOUT_PREVIEW", "1");
    const detail = await getFigureDetail("fig-cabin-6-2");
    expect(detail).not.toBeNull();
    vi.spyOn(fs, "readFile").mockRejectedValueOnce(new Error("private path"));
    const diagnostic = vi.spyOn(console, "error").mockImplementation(() => undefined);

    const result = await loadCalloutPreview(detail!);

    expect(result.detail).toEqual(detail);
    expect(result.notice).toBe(
      "Local preview — unapproved marker positions; not for ordering. Preview unavailable because validation failed; repository data is unchanged.",
    );
    expect(result.notice).not.toContain("private path");
    expect(diagnostic).toHaveBeenCalledOnce();
  });

  test("validates all 44 real proposals and applies only associated, bounded occurrences", async () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("RUF_CALLOUT_PREVIEW", "1");
    const review = JSON.parse(await fs.readFile(REVIEW_PATH, "utf8")) as {
      figures: PreviewFigure[];
    };
    expect(review.figures).toHaveLength(44);
    let newPositions = 0;
    let fullyPositioned = 0;
    let partial = 0;
    let withheld = 0;
    let noUsableProposal = 0;

    for (const proposal of review.figures) {
      const detail = await getFigureDetail(proposal.figureId);
      expect(detail).not.toBeNull();
      const before = structuredClone(detail!);
      const result = await loadCalloutPreview(detail!);
      expect(detail).toEqual(before);

      const changed = result.detail.callouts.filter((callout, index) => {
        const original = before.callouts[index];
        return original.x === null && callout.x !== null;
      });
      newPositions += changed.length;
      for (const callout of changed) {
        expect(callout.x).toBeGreaterThanOrEqual(0);
        expect(callout.x).toBeLessThanOrEqual(100);
        expect(callout.y).toBeGreaterThanOrEqual(0);
        expect(callout.y).toBeLessThanOrEqual(100);
        expect(
          result.detail.rows.some(
            (row) =>
              row.figurePart.figureId === result.detail.figure.id &&
              row.figurePart.id === callout.figurePartId &&
              row.figurePart.partId === row.part.id,
          ),
        ).toBe(true);
      }

      if (["fig-frame-assy-2-1", "fig-cabin-6-13"].includes(proposal.figureId)) {
        withheld += 1;
        expect(result.detail).toEqual(before);
        continue;
      }

      const unresolved = result.detail.callouts.filter(
        ({ x, y }) => x === null || y === null,
      ).length;
      if (unresolved === 0) fullyPositioned += 1;
      else if (changed.length > 0) partial += 1;
      else noUsableProposal += 1;
    }

    expect({ newPositions, fullyPositioned, partial, withheld, noUsableProposal }).toEqual({
      newPositions: 529,
      fullyPositioned: 35,
      partial: 6,
      withheld: 2,
      noUsableProposal: 1,
    });
  });
});
