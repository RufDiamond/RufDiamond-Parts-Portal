/** Run from the repository root:
 * npx vite-node --config vitest.callouts.config.mts tools/callouts/quantity-coverage.ts
 * Uses the real, source-validated review loader. No coordinates or approvals are written.
 */
import fs from "node:fs/promises";
import { createHash } from "node:crypto";
import { figures } from "../../src/data/ft3-wagon";
import { getFigureDetail } from "../../src/data/fixture-repository.server";
import { loadSourceCheckedCallouts } from "../../src/data/callout-preview.server";
import { materializeQuantityOccurrences, isPositionedCallout, reportQuantityOccurrences } from "../../src/lib/quantity-occurrences";

interface AuditRow {
  figurePartId: string;
  partNumber: string;
  qty: number | null;
  ref: number | string | (number | string)[] | null;
  reason: string;
  visibleMapped?: number;
  mappedVisible?: number;
  runtimeDetectedIncludingMarkers?: number;
  baselineMapped?: number;
  baselineDetectedIncludingMarkers?: number;
}
const args = new Set(process.argv.slice(2));
const reportOnly = args.has("--report");
const requireApproval = args.has("--require-approval");
const digest = (bytes: Buffer) => createHash("sha256").update(bytes).digest("hex");
const catalogueSha256 = digest(await fs.readFile("src/data/ft3-wagon.ts"));
const evidence = new Map<string, AuditRow & { figureId: string }>();
for (const group of ["chassis", "cabin", "engine-electric"]) {
  const audit = JSON.parse(await fs.readFile(`tools/callouts/review/quantity-${group}-audit.json`, "utf8")) as { catalogueSha256?: string; figures: { figureId: string; rows: AuditRow[] }[] };
  if (audit.catalogueSha256 && audit.catalogueSha256 !== catalogueSha256) throw new Error(`Stale ${group} catalogue audit`);
  for (const figure of audit.figures) for (const row of figure.rows) {
    if (evidence.has(row.figurePartId)) throw new Error(`Duplicate audit: ${row.figurePartId}`);
    evidence.set(row.figurePartId, { ...row, figureId: figure.figureId });
  }
}

interface CoverageRow {
  figure:string; name:string; figurePartId:string; refs:string; partNumber:string; description:string;
  quantity:number|null; mappedPointers:number; numericContours:number; retainedMasks:number;
  labelOnly:number; baselinePointers:number; addedPointers:number; remainingExpected:number;
  countStatus:string; reviewRequired:boolean; sourceReview:string; sourceEvidence:string;
  remarks:string; drawing:string; reviewUrl:string;
}
const records: CoverageRow[] = [];
const figureReports = [];
for (const figure of figures) {
  const original = await getFigureDetail(figure.id);
  if (!original) throw new Error(`Missing figure: ${figure.id}`);
  const preview = await loadSourceCheckedCallouts(original, process.cwd());
  if (preview.detail.drawing && /Preview unavailable|Part highlights unavailable|display-only/.test(preview.notice ?? "")) {
    throw new Error(`Invalid active mapping: ${figure.id}: ${preview.notice}`);
  }
  const drawing = preview.detail.drawing;
  const occurrences = materializeQuantityOccurrences(preview.detail.rows, preview.detail.callouts);
  const instances = occurrences.filter(isPositionedCallout);
  if (new Set(occurrences.map(c => c.id)).size !== occurrences.length) throw new Error(`Duplicate occurrence IDs: ${figure.id}`);
  const rows = [];
  for (const report of reportQuantityOccurrences(preview.detail.rows, preview.detail.callouts)) {
    const row = preview.detail.rows.find(r=>r.figurePart.id===report.figurePartId)!;
    const audit = evidence.get(report.figurePartId);
    if (!audit) throw new Error(`Unaudited row: ${report.figurePartId}`);
    const own = instances.filter(c=>c.figurePartId===report.figurePartId);
    const observed = audit.runtimeDetectedIncludingMarkers ?? audit.visibleMapped ?? audit.mappedVisible;
    const refs = audit.ref === null ? [] : [audit.ref].flat().map(String);
    if (audit.figureId !== figure.id || audit.partNumber !== row.part.partNumber || audit.qty !== report.expected || observed !== own.length ||
        own.some(c => c.figureId !== figure.id || !refs.includes(String(c.number)))) {
      throw new Error(`Source row, reference or observed count mismatch: ${figure.id}/${report.figurePartId}: ${JSON.stringify({ audit, expected: report.expected, part: row.part.partNumber, projected: own.map(c => ({ id: c.id, ref: c.number, figure: c.figureId })) })}`);
    }
    const numericContours = own.filter(c=>c.componentGeometry?.regions.length).length;
    const retainedMasks = own.filter(c=>!c.componentGeometry && c.maskPath).length;
    const baseline = audit.baselineMapped ?? audit.baselineDetectedIncludingMarkers!;
    rows.push({
      figurePartId: row.figurePart.id, partNumber: row.part.partNumber, listed: report.expected,
      observed, traced: numericContours + retainedMasks, countStatus: report.status, needsReview: report.needsReview,
      sourceNote: audit.reason, reviewReason: report.reviewReason ?? null,
      reviewer: null, reviewState: "unapproved-preview",
      occurrences: occurrences.filter(c => c.figurePartId === row.figurePart.id && !c.id.includes("__qty-")).map(c => ({
        id: c.id, printedReference: c.number,
        mode: !isPositionedCallout(c) ? "withheld" : c.componentGeometry?.regions.length || c.maskPath ? "component" : "label-only",
      })),
    });
    records.push({figure:figure.id, name:figure.name, figurePartId:report.figurePartId,
      refs:report.refNumbers.join(" / "), partNumber:row.part.partNumber, description:row.part.description,
      quantity:report.expected, mappedPointers:report.detected, numericContours, retainedMasks,
      labelOnly:report.detected-numericContours-retainedMasks, baselinePointers:baseline,
      addedPointers:report.detected-baseline, remainingExpected:Math.max(0,(report.expected??0)-report.detected),
      countStatus:report.status, reviewRequired:report.needsReview,
      sourceReview:report.reviewReason ?? "", sourceEvidence:audit.reason, remarks:row.figurePart.remarks ?? "",
      drawing:preview.detail.drawing?.storagePath ?? "", reviewUrl:`/review/figures/${figure.id}`});
  }
  const { variant } = preview.detail;
  figureReports.push({
    modelId: variant.modelId, variantId: variant.id, serialFrom: variant.serialFrom, serialTo: variant.serialTo,
    catalogueRevision: variant.catalogRevision, catalogueSha256, figureId: figure.id, sheet: figure.groupNo,
    drawing: drawing && {
      path: drawing.storagePath, version: drawing.version, width: drawing.width, height: drawing.height,
      sha256: digest(await fs.readFile(`public${drawing.storagePath}`)),
    },
    reviewState: "unapproved-preview", depiction: !drawing ? "table-only" : instances.length ? "mapped" : "withheld",
    notice: preview.notice,
    unboundOccurrences: occurrences.filter(c => !c.figurePartId).map(c => ({ id: c.id, printedReference: c.number })),
    rows,
  });
}
if (evidence.size !== records.length) throw new Error("Audit contains rows outside the current catalogue");
const sum = (key:"quantity"|"mappedPointers"|"numericContours"|"retainedMasks"|"labelOnly"|"baselinePointers"|"addedPointers"|"remainingExpected") => records.reduce((n,r)=>n+(r[key]??0),0);
const summary = {figures:figures.length,rows:records.length,expectedQuantity:sum("quantity"),
  mappedPointers:sum("mappedPointers"),numericContourInstances:sum("numericContours"),retainedMaskInstances:sum("retainedMasks"),
  labelOnlyInstances:sum("labelOnly"),baselinePointers:sum("baselinePointers"),addedPointers:sum("addedPointers"),
  remainingExpected:sum("remainingExpected"),countMatchedRows:records.filter(r=>r.countStatus==="match").length,
  reviewRows:records.filter(r=>r.reviewRequired).length,
  countMatchedButSourceReview:records.filter(r=>r.countStatus==="match"&&r.reviewRequired).length};
if (reportOnly || requireApproval) {
  console.log(JSON.stringify({ status: "NOT_FOR_CUSTOMER_USE", summary, figures: figureReports }, null, 2));
  if (requireApproval) {
    console.error("Legacy review fixtures have no canonical named approval. Use the API publication workflow for an ordering release.");
    process.exitCode = 1;
  }
} else {
  const quote = (value:unknown) => `"${String(value??"").replaceAll('"','""')}"`;
  const columns = Object.keys(records[0]) as (keyof typeof records[number])[];
  await fs.writeFile("tools/callouts/review/quantity-coverage.csv", [columns.join(","),...records.map(r=>columns.map(k=>quote(r[k])).join(","))].join("\n")+"\n");
  await fs.writeFile("tools/callouts/review/quantity-coverage-summary.json", JSON.stringify({status:"NOT_FOR_CUSTOMER_USE",summary,
    note:"Pointer counts include retained labels. A count match does not establish complete contour coverage, source correctness, or approval. Quantity can include lengths (for example seals sold by foot); these remain review cases under the requested count validation."},null,2)+"\n");
  console.log(JSON.stringify(summary,null,2));
}
