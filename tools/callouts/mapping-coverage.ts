import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { proposalRegions, type ProposalGeometry } from "../../src/lib/proposal-geometry";
import {
  validateMappingGeometry,
  type MappingRevision,
} from "@rufdiamond/contracts";
export interface CoverageFigure {
  sourceReviews?: Array<{
    decisionId: string;
    mode: "table-only" | "not-depicted" | "assembly-reference-unspecified";
    rowIds: string[];
    sourceChecksum: string;
    catalogueBindingSha256: string;
    reviewerId: string;
    reviewedAt: string;
    evidence: string;
  }>;
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
    const sourceReviews = (figure.sourceReviews ?? []).filter(
      (r) =>
        figure.identityKind === "canonical" &&
        !figure.conflicts.length &&
        r.sourceChecksum === figure.sourceChecksum &&
        r.catalogueBindingSha256 === figure.catalogueBindingSha256 &&
        r.decisionId.trim() &&
        r.reviewerId.trim() &&
        Number.isFinite(Date.parse(r.reviewedAt)) &&
        r.evidence.trim().length >= 10 &&
        r.rowIds.length > 0 &&
        new Set(r.rowIds).size === r.rowIds.length &&
        r.rowIds.every((id) => figure.rowIds.includes(id)) &&
        (r.mode !== "table-only" ||
          (!figure.drawing && r.rowIds.length === figure.rowIds.length)),
    );
    const qualifiedReviews = sourceReviews.filter(
      (r) =>
        r.mode !== "table-only" ||
        !callouts.some(
          (c) =>
            c.figureId === figure.id &&
            (!c.figurePartId || !figure.rowIds.includes(c.figurePartId)),
        ),
    );
    const approvedTableOnly = qualifiedReviews.some(
        (r) => r.mode === "table-only",
      ),
      approvedNonDepictedRowIds = [
        ...new Set(qualifiedReviews.flatMap((r) => r.rowIds)),
      ];
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
            c.figurePartId && approvedNonDepictedRowIds.includes(c.figurePartId)
              ? "approved-nondepicted"
              : entry && !current
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
        !approvedNonDepictedRowIds.includes(id) &&
        !callouts.some(
          (c) => c.figureId === figure.id && c.figurePartId === id,
        ),
    );
    const mappingApproved = current && !!revision?.approval,
      sourceApproved = approvedTableOnly;
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
      approvedTableOnly,
      approvedNonDepictedRowIds,
      complete:
        !!figure.drawing &&
        occurrences.length > 0 &&
        occurrences.some((c) => c.state !== "approved-nondepicted") &&
        occurrences.every(
          (c) => c.complete || c.state === "approved-nondepicted",
        ) &&
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
      sourceApprovedFigures: results.filter((f) => f.sourceApproved).length,
      approvedTableOnlyFigures: results.filter((f) => f.approvedTableOnly)
        .length,
      approvedNonDepictedRows: results.reduce(
        (n, f) => n + f.approvedNonDepictedRowIds.length,
        0,
      ),
    },
  };
}

export interface LegacyShapeSource {
    catalogueSha256: string;
    drawingSha256: string | null;
    figurePartId: string;
}
export interface LegacyClassification extends LegacyShapeSource {
    category: "clear-tracing" | "partial" | "image-resolution-limited" | "source-conflicted" | "unknown-no-label" | "not-depicted-awaiting-review" | "assembly-awaiting-review" | "clipped" | "unknown";
    evidence: string;
    requiredRegionIds: string[] | null;
    requiredHoleIds: string[] | null;
    requirementsComplete: boolean;
    unresolvedDetails: string[];
}
/** Independently declared source requirements, never inferred from available polygons. */
export function measureLegacyShape(source: LegacyShapeSource, classification: LegacyClassification | null, regionIds: string[], holeIds: string[], valid: boolean) {
    const uniqueIds = (value: unknown) => value === null || (Array.isArray(value) && value.length <= 256 && value.every(id => typeof id === "string" && id.trim().length > 0) && new Set(value).size === value.length);
    if (classification && (!uniqueIds(classification.requiredRegionIds) || !uniqueIds(classification.requiredHoleIds) || typeof classification.requirementsComplete !== "boolean" || typeof classification.evidence !== "string" || classification.evidence.trim().length < 10 || !Array.isArray(classification.unresolvedDetails) || !classification.unresolvedDetails.every(s => typeof s === "string" && s.trim().length > 0) || !["clear-tracing", "partial", "image-resolution-limited", "source-conflicted", "unknown-no-label", "not-depicted-awaiting-review", "assembly-awaiting-review", "clipped", "unknown"].includes(classification.category)))
        throw new Error("Malformed classification requirements");
    if (classification && (classification.catalogueSha256 !== source.catalogueSha256 || classification.drawingSha256 !== source.drawingSha256 || classification.figurePartId !== source.figurePartId))
        throw new Error("Classification source or identity is stale");
    const requiredRegionIds = classification?.requiredRegionIds ?? null;
    const requiredHoleIds = classification?.requiredHoleIds ?? null;
    const requirementsKnown = !!classification?.requirementsComplete && !!requiredRegionIds?.length && requiredHoleIds !== null;
    const missingRegionIds = (requiredRegionIds ?? []).filter(id => !regionIds.includes(id));
    const missingHoleIds = (requiredHoleIds ?? []).filter(id => !holeIds.includes(id));
    return {
        category: classification?.category ?? "unknown",
        evidence: classification?.evidence ?? "No independently completed source classification; geometry presence is not completeness.",
        requiredRegionIds, requiredHoleIds, requirementsKnown, missingRegionIds, missingHoleIds,
        unresolvedDetails: classification?.unresolvedDetails ?? ["Source extent, holes and all depicted occurrences not independently established"],
        complete: valid && requirementsKnown && !!classification?.evidence.trim() && !classification.unresolvedDetails.length && !missingRegionIds.length && !missingHoleIds.length && classification.category === "clear-tracing",
    };
}
type LegacyManifest = {
    catalogueSha256: string;
    figures: Array<{
        figureId: string;
        original: {
            path: string;
            sha256: string;
            width: number;
            height: number;
        };
        replacement?: {
            path: string;
            sha256: string;
            width: number;
            height: number;
        };
        annotations: Array<ProposalGeometry & {
            figurePartId: string;
            partNumber: string;
            number: number;
            x: number;
            y: number;
            evidence: string;
        }>;
    }>;
};
interface CoverageLedger {
    schemaVersion: 1;
    catalogueSha256: string;
    figures: Array<{
        figureId: string;
        drawingSha256: string | null;
        rows: Array<Omit<LegacyClassification, "catalogueSha256" | "drawingSha256"> & {
            sourceRefNo?: string;
        }>;
    }>;
    sourceOnlyObservations: Array<{
        figureId: string;
        refNo: string;
        partNumber: string | null;
        sourceDomain: string;
        sourceSha256: string;
        evidence: string;
    }>;
}
/** Read-only baseline inventory, never a workbook import or DB persistence assertion. */
export async function measureLegacyInventory(root: string) {
    const catalog = await import("../../src/data/ft3-wagon.js"), sourceChecksum = createHash("sha256")
        .update(readFileSync(resolve(root, "src/data/ft3-wagon.ts")))
        .digest("hex");
    const manifests = [
        "part-highlights.json",
        "part-highlights-chassis.json",
        "source-corrections.json",
    ].map((name) => JSON.parse(readFileSync(resolve(root, "tools/callouts/review", name), "utf8")) as LegacyManifest);
    if (manifests.some((m) => m.catalogueSha256 !== sourceChecksum))
        throw new Error("Stale legacy catalogue proposal hash");
    const ledger = JSON.parse(readFileSync(resolve(root, "tools/callouts/review/coverage-classification.json"), "utf8")) as CoverageLedger;
    if (ledger.schemaVersion !== 1 || ledger.catalogueSha256 !== sourceChecksum || new Set(ledger.figures.map(f => f.figureId)).size !== ledger.figures.length)
        throw new Error("Stale or ambiguous coverage classification source");
    const markerManifest = JSON.parse(readFileSync(resolve(root, "tools/callouts/review/proposals.json"), "utf8")) as {
        catalogueSha256: string;
        figures: Array<{
            figureId: string;
            sha256: string;
            width: number;
            height: number;
            markers: Array<{
                number: number;
                x: number;
                y: number;
            }>;
        }>;
    };
    if (markerManifest.catalogueSha256 !== sourceChecksum)
        throw new Error("Stale marker catalogue proposal hash");
    if (ledger.sourceOnlyObservations.some(o => !catalog.figures.some(f => f.id === o.figureId)) || new Set(ledger.sourceOnlyObservations.map(o => `${o.figureId}/${o.sourceDomain}/${o.refNo}`)).size !== ledger.sourceOnlyObservations.length)
        throw new Error("Foreign or duplicate source-only observation");
    for (const classified of ledger.figures) {
        if (!catalog.figures.some(f => f.id === classified.figureId) || new Set(classified.rows.map(r => r.figurePartId)).size !== classified.rows.length || classified.rows.some(r => !catalog.figureParts.some(p => p.id === r.figurePartId && p.figureId === classified.figureId)))
            throw new Error("Foreign or duplicate classification row identity");
    }
    const figures = catalog.figures.map((f) => {
        const drawing = catalog.drawingFiles.find((d) => d.id === f.drawingFileId);
        const occurrences = catalog.callouts.filter((c) => c.figureId === f.id);
        const annotations = manifests.flatMap((m) => m.figures
            .filter((p) => p.figureId === f.id)
            .flatMap((p) => {
            for (const artwork of [
                p.original,
                ...(p.replacement ? [p.replacement] : []),
            ]) {
                if (!artwork.path.startsWith("public/drawings/") ||
                    artwork.path.includes(".."))
                    throw new Error("Invalid source path");
                const bytes = readFileSync(resolve(root, artwork.path));
                if (createHash("sha256").update(bytes).digest("hex") !==
                    artwork.sha256 ||
                    bytes.subarray(0, 8).toString("hex") !== "89504e470d0a1a0a" ||
                    bytes.readUInt32BE(16) !== artwork.width ||
                    bytes.readUInt32BE(20) !== artwork.height)
                    throw new Error("Stale drawing proposal hash or dimensions");
            }
            return p.annotations.map(a => ({ ...a, artwork: p.replacement ?? p.original, manifestSourceChecksum: m.catalogueSha256 }));
        }));
        const originalBytes = drawing ? readFileSync(resolve(root, `public${drawing.storagePath}`)) : null;
        const originalDrawing = drawing ? { path: `public${drawing.storagePath}`, sha256: createHash("sha256").update(originalBytes!).digest("hex"), width: drawing.width, height: drawing.height } : null;
        if (originalDrawing && (originalBytes!.readUInt32BE(16) !== originalDrawing.width || originalBytes!.readUInt32BE(20) !== originalDrawing.height))
            throw new Error("Original drawing dimensions differ");
        const effectiveDrawing = annotations[0]?.artwork ?? originalDrawing;
        if (annotations.some(a => a.artwork.sha256 !== effectiveDrawing?.sha256))
            throw new Error("Ambiguous proposal artwork");
        const classified = ledger.figures.find(c => c.figureId === f.id);
        if (classified && classified.drawingSha256 !== effectiveDrawing?.sha256 && !(classified.drawingSha256 === null && !effectiveDrawing))
            throw new Error("Stale figure classification source");
        const markers = markerManifest.figures.find(m => m.figureId === f.id);
        const markerCurrent = !!markers && markers.sha256 === effectiveDrawing?.sha256 && markers.width === effectiveDrawing.width && markers.height === effectiveDrawing.height;
        const sourceOnlyObservations = ledger.sourceOnlyObservations.filter(o => o.figureId === f.id);
        if (sourceOnlyObservations.some(o => !o.evidence.trim() || !/^[a-f0-9]{64}$/.test(o.sourceSha256) || (o.sourceDomain === "original-png" && o.sourceSha256 !== originalDrawing?.sha256)))
            throw new Error("Stale source-only observation");
        const rowDetails = catalog.figureParts.filter(r => r.figureId === f.id).map(row => {
            const part = catalog.parts.find(p => p.id === row.partId)!;
            const item = classified?.rows.find(r => r.figurePartId === row.id);
            const classification = item ? { ...item, catalogueSha256: ledger.catalogueSha256, drawingSha256: classified!.drawingSha256 } : null;
            const source = { catalogueSha256: sourceChecksum, drawingSha256: effectiveDrawing?.sha256 ?? null, figurePartId: row.id };
            const rowOccurrences = occurrences.filter(c => c.figurePartId === row.id).map(c => {
                const candidates = annotations.filter(a => a.calloutId === c.id);
                if (candidates.length > 1)
                    throw new Error("Ambiguous proposal occurrence");
                const a = candidates[0];
                if (a && (a.figurePartId !== row.id || a.partNumber !== part.partNumber || a.number !== c.number))
                    throw new Error("Foreign proposal row/part/ref identity");
                if (a?.holes && a.holes.length !== a.polygons.length)
                    throw new Error("Invalid hole ownership");
                const regions = a ? proposalRegions(a, a.artwork.width, a.artwork.height) : [];
                const topologyIssues = a ? validateMappingGeometry({ schemaVersion: 1, figureId: f.id, drawingFileId: drawing!.id, drawingSha256: a.artwork.sha256, imageWidth: a.artwork.width, imageHeight: a.artwork.height, catalogueBindingSha256: sourceChecksum, occurrences: [{ calloutId: c.id, figurePartId: row.id, refNo: String(c.number), labelRegion: null, regions, evidence: a.evidence }] }).map(i => i.code) : [];
                const numericValid = !!a && !!regions.length && !topologyIssues.length;
                const regionIds = regions.map(r => r.id), holeIds = regions.flatMap(r => r.holes.map((_, i) => `${r.id}-hole-${i}`));
                const label = a ? { kind: "component-proposal", x: a.x, y: a.y } : markerCurrent && markers!.markers.some(m => m.number === c.number) ? { kind: "marker-proposal", ...markers!.markers.find(m => m.number === c.number)! } : originalDrawing?.sha256 === effectiveDrawing?.sha256 && c.x !== null && c.y !== null ? { kind: "legacy-position", x: c.x, y: c.y } : null;
                return { id: c.id, refNo: String(c.number), figurePartId: row.id, partId: part.id, partNumber: part.partNumber, label, legacyMaskPresent: !!c.maskPath,
                    proposal: a ? { sourceChecksum: a.manifestSourceChecksum, drawing: a.artwork, evidence: a.evidence, numericValid, topologyIssues, regionIds, holeIds, regionCount: regions.length, holeCount: holeIds.length, regions } : null,
                    shape: measureLegacyShape(source, classification, regionIds, holeIds, numericValid), persisted: false, sourceApproved: false };
            });
            return { figurePartId: row.id, partId: part.id, partNumber: part.partNumber, description: part.description, quantity: row.qty, remarks: row.remarks, sourceRefNo: item?.sourceRefNo ?? null, sourceClassificationRecorded: !!classification, classification: measureLegacyShape(source, classification, [], [], false), occurrences: rowOccurrences };
        });
        const proposed = new Set(rowDetails.flatMap(r => r.occurrences).filter(c => c.proposal?.numericValid).map(c => c.id));
        const measuredOccurrences = rowDetails.flatMap(r => r.occurrences);
        if (measuredOccurrences.length !== occurrences.length)
            throw new Error("Unassociated occurrence omitted from row inventory");
        const geometryPresent = (c: typeof measuredOccurrences[number]) => !!c.proposal?.numericValid || c.legacyMaskPresent;
        const coverage = {
            classifiedSourceRows: rowDetails.filter(r => r.sourceClassificationRecorded).length,
            unclassifiedSourceRows: rowDetails.filter(r => !r.sourceClassificationRecorded).length,
            rowClassificationCounts: Object.fromEntries([...new Set(rowDetails.map(r => r.classification.category))].sort().map(category => [category, rowDetails.filter(r => r.classification.category === category).length])),
            clearUntracedRefs: measuredOccurrences.filter(c => c.shape.category === "clear-tracing" && !geometryPresent(c)).map(c => c.refNo),
            limitedUntracedRefs: measuredOccurrences.filter(c => c.shape.category === "image-resolution-limited" && !geometryPresent(c)).map(c => c.refNo),
            partialGeometryRefs: measuredOccurrences.filter(c => c.shape.category === "partial" && geometryPresent(c)).map(c => c.refNo),
            sourceQuestionRefs: measuredOccurrences.filter(c => ["source-conflicted", "unknown-no-label", "unknown"].includes(c.shape.category)).map(c => c.refNo),
            existingGeometryRequirementsPendingRefs: measuredOccurrences.filter(c => c.shape.category === "clear-tracing" && geometryPresent(c) && !c.shape.complete).map(c => c.refNo),
            sourceMeasuredCompleteRefs: measuredOccurrences.filter(c => c.shape.complete).map(c => c.refNo),
        };
        return {
            id: f.id,
            name: f.name,
            groupNo: f.groupNo,
            identityKind: "legacy-not-canonical",
            originalDrawing, effectiveDrawing, rowDetails, sourceOnlyObservations, coverage,
            proposalComplete: rowDetails.length > 0 && rowDetails.every(r => r.occurrences.length > 0 && r.occurrences.every(c => c.shape.complete)) && sourceOnlyObservations.length === 0,
            rows: catalog.figureParts.filter((r) => r.figureId === f.id).length,
            callouts: occurrences.length,
            drawingPresent: !!drawing,
            baselinePositioned: occurrences.filter((c) => c.x !== null && c.y !== null).length,
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
        classificationChecksum: createHash("sha256").update(readFileSync(resolve(root, "tools/callouts/review/coverage-classification.json"))).digest("hex"),
        sourceDomains: {
            legacyCatalogue: { sha256: sourceChecksum, verification: "Freshly hashed by this exporter; not a canonical workbook binding" },
            originalWorkbook: { sha256: "3a6a66571058ac238f707fed4421755f9a678e4baff708b452382f439d876599", verification: "Recorded original-byte source audit; this legacy-only exporter does not rehash or apply the private workbook", rows: 635, parts: 536, figureIdentities: 45 },
            manufacturerPdf: { sha256: "00698197a467c6ae4a1a809a108c8f225854f25897ea3ff4372f209948273bca", verification: "Recorded source-audit domain for table/version observations; private PDF not rehashed by this exporter" },
            drawings: "Original and replacement PNG hashes/dimensions freshly verified independently; no source pixels changed",
        },
        persistence: { targetInspected: false, realWorkbookApplied: false, revisionsCreatedByTask: 0, sourceApprovalsCreatedByTask: 0, gate: "Original workbook quantity-zero assembly rows222/241 require attributable source decisions; duplicate11.3 identities and drawing/table conflicts remain. No synthetic reviewer or canonical real-data apply used." },
        figures,
        totals: {
            figures: figures.length,
            callouts: catalog.callouts.length,
            rows: catalog.figureParts.length,
            parts: catalog.parts.length,
            drawings: catalog.drawingFiles.length,
            baselinePositioned: figures.reduce((n, f) => n + f.baselinePositioned, 0),
            legacyMasks: figures.reduce((n, f) => n + f.legacyMasks, 0),
            proposedComponentCallouts: figures.reduce((n, f) => n + f.proposedComponentCallouts, 0),
            persistedRevisions: 0,
            sourceApprovals: 0,
            sourceOnlyObservations: figures.reduce((n, f) => n + f.sourceOnlyObservations.length, 0),
            numericRegions: figures.flatMap(f => f.rowDetails.flatMap(r => r.occurrences)).reduce((n, c) => n + (c.proposal?.regionCount ?? 0), 0),
            numericHoles: figures.flatMap(f => f.rowDetails.flatMap(r => r.occurrences)).reduce((n, c) => n + (c.proposal?.holeCount ?? 0), 0),
            sourceMeasuredCompleteOccurrences: figures.flatMap(f => f.rowDetails.flatMap(r => r.occurrences)).filter(c => c.shape.complete).length,
            classifiedSourceRows: figures.reduce((n, f) => n + f.coverage.classifiedSourceRows, 0),
            unclassifiedSourceRows: figures.reduce((n, f) => n + f.coverage.unclassifiedSourceRows, 0),
            clearUntracedOccurrences: figures.reduce((n, f) => n + f.coverage.clearUntracedRefs.length, 0),
            limitedUntracedOccurrences: figures.reduce((n, f) => n + f.coverage.limitedUntracedRefs.length, 0),
            partialGeometryOccurrences: figures.reduce((n, f) => n + f.coverage.partialGeometryRefs.length, 0),
            sourceQuestionOccurrences: figures.reduce((n, f) => n + f.coverage.sourceQuestionRefs.length, 0),
        },
    };
}
export function legacyCoverageMarkdown(report: Awaited<ReturnType<typeof measureLegacyInventory>>) {
    const cell = (v: unknown) => String(v ?? "—").replaceAll("|", "\\|").replaceAll("\n", " ");
    const out = ["# Fat Truck measured per-part review checklist", "", `Legacy source SHA256: ${report.sourceChecksum}. Classification SHA256: ${report.classificationChecksum}.`, "", `${report.totals.figures} figures; ${report.totals.rows} rows; ${report.totals.callouts} existing occurrences; ${report.totals.proposedComponentCallouts} numerically valid component proposals; ${report.totals.legacyMasks} legacy path masks. Proposal presence is not complete tracing, source approval or persisted coverage.`, "", `Actual Task10c real-workbook apply: none. Persisted revisions created:0; named source approvals created:0. No target database inspected. ${report.persistence.gate}`, "", "Unknown requirements are retained, not inferred from polygon counts. Source-only observations are outside existing-row marker denominators. All proposals remain UNAPPROVED / NOT FOR ORDERING.", ""];
    out.push(`Untraced clear source targets: ${report.totals.clearUntracedOccurrences}; untraced resolution-limited targets: ${report.totals.limitedUntracedOccurrences}; existing partial geometry: ${report.totals.partialGeometryOccurrences}; source-question occurrences: ${report.totals.sourceQuestionOccurrences}. Independently measured complete visible shapes: ${report.totals.sourceMeasuredCompleteOccurrences} (not approval).`, "", "| Figure | Clear untraced refs | Limited untraced refs | Partial geometry refs | Source-question refs |", "| --- | --- | --- | --- | --- |");
    for (const f of report.figures)
        out.push(`| ${f.id} | ${f.coverage.clearUntracedRefs.join(", ") || "—"} | ${f.coverage.limitedUntracedRefs.join(", ") || "—"} | ${f.coverage.partialGeometryRefs.join(", ") || "—"} | ${f.coverage.sourceQuestionRefs.join(", ") || "—"} |`);
    out.push("", `Original workbook audited SHA256: ${report.sourceDomains.originalWorkbook.sha256}; manufacturer PDF audited SHA256: ${report.sourceDomains.manufacturerPdf.sha256}. Private source files are not rehashed/applied by this legacy-only export; exact source-audit provenance is distinct from current PNG verification.`, "");
    for (const f of report.figures) {
        out.push(`## ${f.groupNo} ${f.name} — ${f.id}`, "", `Source: ${f.effectiveDrawing ? `${f.effectiveDrawing.path}; SHA256 ${f.effectiveDrawing.sha256}; ${f.effectiveDrawing.width}×${f.effectiveDrawing.height}` : "No drawing (not vacuously complete)"}.`, "", "| Ref | Exact row / occurrence | PN | Geometry | Source classification / remaining work |", "| --- | --- | --- | --- | --- |");
        for (const r of f.rowDetails) {
            const entries = r.occurrences.length ? r.occurrences : [null];
            for (const c of entries) {
                const shape = c?.shape ?? r.classification;
                const geometry = c?.proposal ? `${c.proposal.numericValid ? "valid proposal" : "invalid/display-only"}; ${c.proposal.regionCount} regions / ${c.proposal.holeCount} holes` : c?.legacyMaskPresent ? "legacy path mask; no numeric proposal" : "none";
                out.push(`| ${cell(c?.refNo ?? r.sourceRefNo)} | ${cell(r.figurePartId)} / ${cell(c?.id)} | ${cell(r.partNumber)} | ${geometry}; ${c?.label ? "label present" : "no mapped label"} | ${cell(shape.category)} — ${cell(shape.evidence)} ${cell(shape.unresolvedDetails.join("; "))}${shape.missingRegionIds.length ? `; missing regions: ${shape.missingRegionIds.join(", ")}` : ""}${shape.missingHoleIds.length ? `; missing holes: ${shape.missingHoleIds.join(", ")}` : ""}. ${r.remarks ? `Source remarks: ${cell(r.remarks)}` : ""} |`);
            }
        }
        for (const o of f.sourceOnlyObservations)
            out.push("", `Source-only ref ${o.refNo}; PN ${cell(o.partNumber)}; ${o.sourceDomain} SHA256 ${o.sourceSha256}: ${o.evidence}`);
        out.push("");
    }
    return out.join("\n") + "\n";
}
if (process.argv[1] &&
    resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    const root = resolve(fileURLToPath(new URL("../..", import.meta.url)));
    measureLegacyInventory(root)
        .then((result) => process.stdout.write(process.argv.includes("--markdown") ? legacyCoverageMarkdown(result) : `${JSON.stringify(result, null, 2)}\n`))
        .catch(() => {
        process.stderr.write("Coverage failed: source inventory is missing or stale.\n");
        process.exitCode = 1;
    });
}
