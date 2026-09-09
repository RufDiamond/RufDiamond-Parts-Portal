import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  validateMappingGeometry,
  type MappingRevision,
} from "@rufdiamond/contracts";
export interface CoverageFigure {
  id: string;
  identityKind: "canonical" | "legacy";
  sourceChecksum: string;
  catalogueBindingSha256: string | null;
  drawing: { sha256: string; width: number; height: number } | null;
  rowIds: string[];
  conflicts: string[];
}
export interface CoverageOccurrence {
  id: string;
  figureId: string;
  figurePartId: string | null;
  refNo: string;
  requiredRegionIds: string[] | null;
  proposal: {
    sourceChecksum: string;
    drawingSha256: string;
    imageWidth: number;
    imageHeight: number;
    labelPresent: boolean;
    regionIds: string[];
    evidence: string;
  } | null;
}
export interface CoverageRevision {
  figureId: string;
  sourceChecksum: string;
  revision: MappingRevision;
}

/** Coverage is measured against explicit region requirements. Nonempty shapes are not completeness. */
export function buildMappingCoverage(
  figures: CoverageFigure[],
  callouts: CoverageOccurrence[],
  revisions: CoverageRevision[],
) {
  const results = figures.map((figure) => {
    const entries = revisions.filter((r) => r.figureId === figure.id),
      entry = entries.length === 1 ? entries[0] : undefined,
      revision = entry?.revision,
      d = revision?.document;
    const current =
      !!d &&
      entry!.sourceChecksum === figure.sourceChecksum &&
      d.figureId === figure.id &&
      d.drawingSha256 === figure.drawing?.sha256 &&
      d.imageWidth === figure.drawing.width &&
      d.imageHeight === figure.drawing.height &&
      d.catalogueBindingSha256 === figure.catalogueBindingSha256 &&
      validateMappingGeometry(d).length === 0;
    const occurrences = callouts
      .filter((c) => c.figureId === figure.id)
      .map((c) => {
        const mapped = current
          ? d!.occurrences.find((o) => o.calloutId === c.id)
          : undefined;
        const associated =
          !!c.figurePartId &&
          figure.rowIds.includes(c.figurePartId) &&
          (!mapped ||
            (mapped.figurePartId === c.figurePartId &&
              mapped.refNo === c.refNo));
        const proposal = c.proposal,
          proposalCurrent =
            !!proposal &&
            proposal.sourceChecksum === figure.sourceChecksum &&
            proposal.drawingSha256 === figure.drawing?.sha256 &&
            proposal.imageWidth === figure.drawing.width &&
            proposal.imageHeight === figure.drawing.height;
        const regions = mapped?.regions.map((r) => r.id) ?? [],
          requirementsKnown = !!c.requiredRegionIds?.length,
          missingRegionIds = (c.requiredRegionIds ?? []).filter(
            (id) => !regions.includes(id),
          );
        const complete =
          !!mapped &&
          associated &&
          !!mapped.labelRegion &&
          requirementsKnown &&
          !missingRegionIds.length &&
          !!mapped.evidence.trim();
        return {
          id: c.id,
          refNo: c.refNo,
          state:
            entry && !current
              ? "stale-source"
              : !associated
                ? "unresolved-association"
                : complete
                  ? "persisted-complete"
                  : mapped
                    ? "persisted-partial"
                    : proposalCurrent
                      ? "proposal-only"
                      : "missing",
          persisted: !!mapped,
          proposalSourceBound: proposalCurrent,
          proposedRegions: proposalCurrent ? proposal!.regionIds.length : 0,
          labelPresent: !!mapped?.labelRegion,
          regionRequirementsKnown: requirementsKnown,
          missingRegionIds,
          complete,
        };
      });
    const unresolvedRowIds = figure.rowIds.filter(
      (id) =>
        !callouts.some(
          (c) => c.figureId === figure.id && c.figurePartId === id,
        ),
    );
    const mappingApproved = current && !!revision?.approval,
      sourceApproved = false;
    return {
      id: figure.id,
      identityKind: figure.identityKind,
      missingDrawing: !figure.drawing,
      emptyOccurrences: occurrences.length === 0,
      unresolvedRowIds,
      conflicts: [
        ...figure.conflicts,
        ...(entries.length > 1 ? ["AMBIGUOUS_REVISION_HEAD"] : []),
      ],
      occurrences,
      mappingApproved,
      sourceApproved,
      complete:
        !!figure.drawing &&
        occurrences.length > 0 &&
        occurrences.every((c) => c.complete) &&
        !unresolvedRowIds.length &&
        !figure.conflicts.length &&
        entries.length === 1 &&
        mappingApproved,
    };
  });
  return {
    figures: results,
    totals: {
      figures: results.length,
      occurrences: callouts.length,
      persistedOccurrences: results
        .flatMap((f) => f.occurrences)
        .filter((c) => c.persisted).length,
      completeFigures: results.filter((f) => f.complete).length,
      sourceApprovedFigures: 0,
    },
  };
}

type LegacyManifest = {
  catalogueSha256: string;
  figures: Array<{
    figureId: string;
    original: { path: string; sha256: string; width: number; height: number };
    replacement?: {
      path: string;
      sha256: string;
      width: number;
      height: number;
    };
    annotations: Array<{
      calloutId: string;
      figurePartId: string;
      polygons: number[][][];
      evidence: string;
    }>;
  }>;
};
/** Read-only baseline inventory, never a workbook import or DB persistence assertion. */
export async function measureLegacyInventory(root: string) {
  const catalog = await import("../../src/data/ft3-wagon.js"),
    sourceChecksum = createHash("sha256")
      .update(readFileSync(resolve(root, "src/data/ft3-wagon.ts")))
      .digest("hex");
  const manifests = [
    "part-highlights.json",
    "part-highlights-chassis.json",
    "source-corrections.json",
  ].map(
    (name) =>
      JSON.parse(
        readFileSync(resolve(root, "tools/callouts/review", name), "utf8"),
      ) as LegacyManifest,
  );
  if (manifests.some((m) => m.catalogueSha256 !== sourceChecksum))
    throw new Error("Stale legacy catalogue proposal hash");
  const figures = catalog.figures.map((f) => {
    const drawing = catalog.drawingFiles.find((d) => d.id === f.drawingFileId);
    const occurrences = catalog.callouts.filter((c) => c.figureId === f.id);
    const annotations = manifests.flatMap((m) =>
      m.figures
        .filter((p) => p.figureId === f.id)
        .flatMap((p) => {
          for (const artwork of [
            p.original,
            ...(p.replacement ? [p.replacement] : []),
          ]) {
            if (
              !artwork.path.startsWith("public/drawings/") ||
              artwork.path.includes("..")
            )
              throw new Error("Invalid source path");
            const bytes = readFileSync(resolve(root, artwork.path));
            if (
              createHash("sha256").update(bytes).digest("hex") !==
                artwork.sha256 ||
              bytes.subarray(0, 8).toString("hex") !== "89504e470d0a1a0a" ||
              bytes.readUInt32BE(16) !== artwork.width ||
              bytes.readUInt32BE(20) !== artwork.height
            )
              throw new Error("Stale drawing proposal hash or dimensions");
          }
          return p.annotations;
        }),
    );
    const proposed = new Set(
      annotations
        .filter(
          (a) =>
            a.polygons.length &&
            occurrences.some(
              (c) => c.id === a.calloutId && c.figurePartId === a.figurePartId,
            ),
        )
        .map((a) => a.calloutId),
    );
    return {
      id: f.id,
      groupNo: f.groupNo,
      rows: catalog.figureParts.filter((r) => r.figureId === f.id).length,
      callouts: occurrences.length,
      drawingPresent: !!drawing,
      baselinePositioned: occurrences.filter(
        (c) => c.x !== null && c.y !== null,
      ).length,
      legacyMasks: occurrences.filter((c) => !!c.maskPath).length,
      proposedComponentCallouts: proposed.size,
      missingComponentRefs: occurrences
        .filter((c) => !proposed.has(c.id) && !c.maskPath)
        .map((c) => ({ id: c.id, refNo: String(c.number) })),
      persistedRevisions: 0,
      sourceApprovals: 0,
    };
  });
  return {
    kind: "measured-legacy-proposal-inventory",
    sourceChecksum,
    figures,
    totals: {
      figures: figures.length,
      callouts: catalog.callouts.length,
      rows: catalog.figureParts.length,
      parts: catalog.parts.length,
      drawings: catalog.drawingFiles.length,
      baselinePositioned: figures.reduce((n, f) => n + f.baselinePositioned, 0),
      legacyMasks: figures.reduce((n, f) => n + f.legacyMasks, 0),
      proposedComponentCallouts: figures.reduce(
        (n, f) => n + f.proposedComponentCallouts,
        0,
      ),
      persistedRevisions: 0,
      sourceApprovals: 0,
    },
  };
}
if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const root = resolve(fileURLToPath(new URL("../..", import.meta.url)));
  measureLegacyInventory(root)
    .then((result) =>
      process.stdout.write(`${JSON.stringify(result, null, 2)}\n`),
    )
    .catch(() => {
      process.stderr.write(
        "Coverage failed: source inventory is missing or stale.\n",
      );
      process.exitCode = 1;
    });
}
