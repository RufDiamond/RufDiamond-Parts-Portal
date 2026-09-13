/** Run from the repository root:
 * npx vite-node --config vitest.callouts.config.mts tools/callouts/quantity-coverage.ts
 * Uses the real, source-validated review loader. No coordinates or approvals are written.
 */
import fs from "node:fs/promises";
import { figures } from "../../src/data/ft3-wagon";
import { getFigureDetail } from "../../src/data/repository";
import { loadCalloutPreview } from "../../src/data/callout-preview.server";
import { materializeQuantityOccurrences, isPositionedCallout, reportQuantityOccurrences } from "../../src/lib/quantity-occurrences";

interface AuditRow {
  figurePartId: string;
  reason: string;
  baselineMapped?: number;
  baselineDetectedIncludingMarkers?: number;
}
const evidence = new Map<string, AuditRow>();
for (const group of ["chassis", "cabin", "engine-electric"]) {
  const audit = JSON.parse(await fs.readFile(`tools/callouts/review/quantity-${group}-audit.json`, "utf8")) as {figures:{rows:AuditRow[]}[]};
  for (const figure of audit.figures) for (const row of figure.rows) {
    if (evidence.has(row.figurePartId)) throw new Error(`Duplicate audit: ${row.figurePartId}`);
    evidence.set(row.figurePartId, row);
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
for (const figure of figures) {
  const original = await getFigureDetail(figure.id);
  if (!original) throw new Error(`Missing figure: ${figure.id}`);
  const preview = await loadCalloutPreview(original, "hosted-review");
  if (/Part highlights unavailable|display-only/.test(preview.notice ?? "")) throw new Error(`Invalid active mapping: ${figure.id}`);
  const instances = materializeQuantityOccurrences(preview.detail.rows, preview.detail.callouts).filter(isPositionedCallout);
  for (const report of reportQuantityOccurrences(preview.detail.rows, preview.detail.callouts)) {
    const row = preview.detail.rows.find(r=>r.figurePart.id===report.figurePartId)!;
    const audit = evidence.get(report.figurePartId);
    if (!audit) throw new Error(`Unaudited row: ${report.figurePartId}`);
    const own = instances.filter(c=>c.figurePartId===report.figurePartId);
    const numericContours = own.filter(c=>c.componentGeometry?.regions.length).length;
    const retainedMasks = own.filter(c=>!c.componentGeometry && c.maskPath).length;
    const baseline = audit.baselineMapped ?? audit.baselineDetectedIncludingMarkers!;
    records.push({figure:figure.id, name:figure.name, figurePartId:report.figurePartId,
      refs:report.refNumbers.join(" / "), partNumber:row.part.partNumber, description:row.part.description,
      quantity:report.expected, mappedPointers:report.detected, numericContours, retainedMasks,
      labelOnly:report.detected-numericContours-retainedMasks, baselinePointers:baseline,
      addedPointers:report.detected-baseline, remainingExpected:Math.max(0,(report.expected??0)-report.detected),
      countStatus:report.status, reviewRequired:report.needsReview,
      sourceReview:report.reviewReason ?? "", sourceEvidence:audit.reason, remarks:row.figurePart.remarks ?? "",
      drawing:preview.detail.drawing?.storagePath ?? "", reviewUrl:`/review/figures/${figure.id}`});
  }
}
if (evidence.size !== records.length) throw new Error("Audit contains rows outside the current catalogue");
const sum = (key:"quantity"|"mappedPointers"|"numericContours"|"retainedMasks"|"labelOnly"|"baselinePointers"|"addedPointers"|"remainingExpected") => records.reduce((n,r)=>n+(r[key]??0),0);
const summary = {figures:figures.length,rows:records.length,expectedQuantity:sum("quantity"),
  mappedPointers:sum("mappedPointers"),numericContourInstances:sum("numericContours"),retainedMaskInstances:sum("retainedMasks"),
  labelOnlyInstances:sum("labelOnly"),baselinePointers:sum("baselinePointers"),addedPointers:sum("addedPointers"),
  remainingExpected:sum("remainingExpected"),countMatchedRows:records.filter(r=>r.countStatus==="match").length,
  reviewRows:records.filter(r=>r.reviewRequired).length,
  countMatchedButSourceReview:records.filter(r=>r.countStatus==="match"&&r.reviewRequired).length};
const quote = (value:unknown) => `"${String(value??"").replaceAll('"','""')}"`;
const columns = Object.keys(records[0]) as (keyof typeof records[number])[];
await fs.writeFile("tools/callouts/review/quantity-coverage.csv", [columns.join(","),...records.map(r=>columns.map(k=>quote(r[k])).join(","))].join("\n")+"\n");
await fs.writeFile("tools/callouts/review/quantity-coverage-summary.json", JSON.stringify({status:"NOT_FOR_CUSTOMER_USE",summary,
  note:"Pointer counts include retained labels. A count match does not establish complete contour coverage, source correctness, or approval. Quantity can include lengths (for example seals sold by foot); these remain review cases under the requested count validation."},null,2)+"\n");
console.log(JSON.stringify(summary,null,2));
