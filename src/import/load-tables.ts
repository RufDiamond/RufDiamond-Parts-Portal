/**
 * Stage 4 — loading parts tables through the review queue.
 *
 * Every row lands as an `extraction_row` before it lands in the catalog. A
 * part number that fails its format check holds the row and writes no `part`,
 * because a misread digit is a wrong part shipped — see spec §4.
 *
 * Cross-checks the parsed rows against the markers actually on the plate and
 * reports both directions of disagreement. Neither is repaired silently.
 */

import { createHash } from "node:crypto";
import { eq, sql } from "drizzle-orm";

import { db } from "../db/client";
import {
  callout,
  extractionRow,
  figure,
  figurePart,
  importRun,
  part,
  partKit,
  partRequires,
} from "../db/schema";
import { isValidPartNumber, parseNote } from "./notes";
import { PILOT_TABLES, type SourceTable } from "./pilot-tables";

const partId = (partNumber: string) => `prt-${partNumber.toLowerCase()}`;
const figureId = (groupNo: string) => `fig-ft3w-${groupNo.replace(/\./g, "-")}`;
const figurePartId = (groupNo: string, itemNo: number) =>
  `fp-ft3w-${groupNo.replace(/\./g, "-")}-${itemNo}`;
const calloutId = (groupNo: string, number: number, seq: number) =>
  `clt-ft3w-${groupNo.replace(/\./g, "-")}-${number}-${seq}`;
const extractionId = (groupNo: string, itemNo: number) =>
  `ext-${groupNo.replace(/\./g, "-")}-${itemNo}`;

export interface TableFinding {
  groupNo: string;
  kind: "shown-without-marker" | "marker-without-row" | "invalid-part-number";
  detail: string;
}

export interface LoadResult {
  parts: number;
  figureParts: number;
  callouts: number;
  notShown: number;
  held: number;
  kitEdges: number;
  requiresEdges: number;
  findings: TableFinding[];
}

export async function loadPilotTables(): Promise<LoadResult> {
  const checksum = createHash("sha256")
    .update(JSON.stringify(PILOT_TABLES))
    .digest("hex");
  const runId = `run-parts-tables-${checksum.slice(0, 12)}`;

  await db
    .insert(importRun)
    .values({
      id: runId,
      kind: "parts-tables",
      sourceFile: "96-00073 Rev 2, pages 1-4 (vision read)",
      sourceChecksum: checksum,
      status: "running",
    })
    .onConflictDoUpdate({
      target: importRun.id,
      set: { status: "running", startedAt: sql`now()`, finishedAt: null },
    });

  const result: LoadResult = {
    parts: 0,
    figureParts: 0,
    callouts: 0,
    notShown: 0,
    held: 0,
    kitEdges: 0,
    requiresEdges: 0,
    findings: [],
  };

  for (const table of PILOT_TABLES) {
    await loadTable(table, runId, result);
  }

  await db
    .update(importRun)
    .set({
      status: "succeeded",
      finishedAt: sql`now()`,
      summary: `${result.figureParts} rows, ${result.callouts} callouts, ${result.held} held, ${result.findings.length} findings`,
    })
    .where(eq(importRun.id, runId));

  return result;
}

async function loadTable(
  table: SourceTable,
  runId: string,
  result: LoadResult,
): Promise<void> {
  const fid = figureId(table.groupNo);
  const existing = await db.select().from(figure).where(eq(figure.id, fid));
  if (!existing.length) throw new Error(`figure ${table.groupNo} not imported`);

  const accepted = new Map<number, { partNumber: string; shown: boolean }>();

  for (const row of table.rows) {
    const parsed = parseNote(row.notes);
    const valid = isValidPartNumber(row.partNumber);
    const extId = extractionId(table.groupNo, row.itemNo);

    await db
      .insert(extractionRow)
      .values({
        id: extId,
        importRunId: runId,
        figureId: fid,
        sourcePage: table.sourcePage,
        rawItemNo: String(row.itemNo),
        rawPartNumber: row.partNumber,
        rawDescription: row.description,
        rawQty: String(row.qty),
        rawNotes: row.notes,
        status: valid ? "accepted" : "pending",
        rejectionReason: valid ? null : `part number "${row.partNumber}" fails format check`,
        // Linked back once the figure_part it produced exists.
        figurePartId: null,
      })
      .onConflictDoUpdate({
        target: extractionRow.id,
        set: {
          rawPartNumber: row.partNumber,
          rawDescription: row.description,
          rawNotes: row.notes,
          status: valid ? "accepted" : "pending",
        },
      });

    if (!valid) {
      result.held += 1;
      result.findings.push({
        groupNo: table.groupNo,
        kind: "invalid-part-number",
        detail: `item ${row.itemNo}: "${row.partNumber}" held, no part written`,
      });
      continue;
    }

    await upsertPart(row.partNumber, row.description);
    result.parts += 1;

    // Option kits referenced in a note are parts too, and may not appear as a
    // row anywhere in the catalog.
    if (parsed.optionPartNumber) {
      await upsertPart(parsed.optionPartNumber, "Option kit", true);
    }

    await db
      .insert(figurePart)
      .values({
        id: figurePartId(table.groupNo, row.itemNo),
        figureId: fid,
        partId: partId(row.partNumber),
        itemNo: row.itemNo,
        qty: row.qty,
        remarks: row.notes,
        shown: parsed.shown,
        optionPartId: parsed.optionPartNumber ? partId(parsed.optionPartNumber) : null,
        notesTruncated: parsed.truncated,
        serviceable: true,
      })
      .onConflictDoUpdate({
        target: figurePart.id,
        set: {
          partId: partId(row.partNumber),
          qty: row.qty,
          remarks: row.notes,
          shown: parsed.shown,
          optionPartId: parsed.optionPartNumber ? partId(parsed.optionPartNumber) : null,
          notesTruncated: parsed.truncated,
        },
      });

    await db
      .update(extractionRow)
      .set({ figurePartId: figurePartId(table.groupNo, row.itemNo) })
      .where(eq(extractionRow.id, extId));

    result.figureParts += 1;
    if (!parsed.shown) result.notShown += 1;
    accepted.set(row.itemNo, { partNumber: row.partNumber, shown: parsed.shown });

    if (parsed.optionPartNumber) {
      await db
        .insert(partKit)
        .values({
          kitPartId: partId(parsed.optionPartNumber),
          memberPartId: partId(row.partNumber),
          qty: row.qty,
        })
        .onConflictDoNothing();
      result.kitEdges += 1;
    }

    // "NOT SHOWN - FOR 19-00210": ordering the named part also needs this one.
    // Directional, never inferred in reverse — see backend-specification §3.2.
    if (parsed.fittedToPartNumber && parsed.fittedToPartNumber !== row.partNumber) {
      await upsertPart(parsed.fittedToPartNumber, "Referenced by a fitment note", true);
      await db
        .insert(partRequires)
        .values({
          partId: partId(parsed.fittedToPartNumber),
          requiredPartId: partId(row.partNumber),
          qty: 1,
        })
        .onConflictDoNothing();
      result.requiresEdges += 1;
    }
  }

  await loadCallouts(table, accepted, result);
}

/**
 * One callout per marker read off the plate. Coordinates stay null — placing
 * them is stage 5.
 */
async function loadCallouts(
  table: SourceTable,
  accepted: Map<number, { partNumber: string; shown: boolean }>,
  result: LoadResult,
): Promise<void> {
  const fid = figureId(table.groupNo);

  for (const number of table.calloutNumbersOnPlate) {
    const row = accepted.get(number);
    await db
      .insert(callout)
      .values({
        id: calloutId(table.groupNo, number, 1),
        figureId: fid,
        figurePartId: row ? figurePartId(table.groupNo, number) : null,
        number,
        x: null,
        y: null,
        source: "imported",
      })
      .onConflictDoUpdate({
        target: callout.id,
        set: { figurePartId: row ? figurePartId(table.groupNo, number) : null },
      });
    result.callouts += 1;

    if (!row) {
      result.findings.push({
        groupNo: table.groupNo,
        kind: "marker-without-row",
        detail: `marker ${number} is on the plate but the parts list has no item ${number}`,
      });
    }
  }

  const onPlate = new Set(table.calloutNumbersOnPlate);
  for (const [itemNo, row] of accepted) {
    if (row.shown && !onPlate.has(itemNo)) {
      result.findings.push({
        groupNo: table.groupNo,
        kind: "shown-without-marker",
        detail: `item ${itemNo} (${row.partNumber}) reads as shown but no marker ${itemNo} is on the plate`,
      });
    }
  }
}

async function upsertPart(
  partNumber: string,
  description: string,
  stubOnly = false,
): Promise<void> {
  const values = {
    id: partId(partNumber),
    partNumber,
    description,
    listPrice: null,
    status: "active" as const,
  };

  if (stubOnly) {
    // Never overwrite a real description with a placeholder.
    await db.insert(part).values(values).onConflictDoNothing({ target: part.partNumber });
    return;
  }

  await db
    .insert(part)
    .values(values)
    .onConflictDoUpdate({ target: part.partNumber, set: { description } });
}

async function main(): Promise<void> {
  const result = await loadPilotTables();
  console.log("stage 4 — parts tables (systems 1, 2, 3)");
  console.log(
    `  ${result.figureParts} rows loaded, ${result.notShown} not shown, ${result.held} held for review`,
  );
  console.log(`  ${result.callouts} callouts, coordinates not yet placed`);
  console.log(`  ${result.kitEdges} option-kit edges, ${result.requiresEdges} fitment edges`);

  if (result.findings.length) {
    console.log("\n  findings:");
    for (const finding of result.findings) {
      console.log(`    FIG ${finding.groupNo} [${finding.kind}] ${finding.detail}`);
    }
  } else {
    console.log("\n  no findings — plate markers and parts rows agree");
  }

  process.exit(0);
}

if (process.argv[1]?.endsWith("load-tables.ts")) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
