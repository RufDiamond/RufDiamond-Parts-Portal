/**
 * Stage 5 — proposing callout coordinates from the plates.
 *
 * `backend-specification.md` §6 question 1 assumed a binary: SVG with text
 * numerals meant automatic extraction, flat raster meant placing several
 * hundred markers by hand. The plates are flat raster, but the numerals are
 * legible, so a model can propose a position for a person to confirm.
 *
 * Nothing here is a mapping until someone says it is. Every row is written
 * with `source = 'vision'` and `confirmedAt = null`, and publication rule 3 in
 * the spec refuses unconfirmed markers. The admin confirms in the hotspot
 * editor that already exists.
 *
 * Coordinates are the centre of the numeral's box or circle — where the
 * marker is drawn, not where the part is — as percentages of plate width and
 * height.
 */

import { eq, sql } from "drizzle-orm";

import { db } from "../db/client";
import { callout, figurePart, importRun } from "../db/schema";

export interface VisionMarker {
  /** The numeral read from the plate, or null when the circle is empty. */
  number: number | null;
  /** Percentage of plate width, 0–100. */
  x: number;
  /** Percentage of plate height, 0–100. */
  y: number;
  /** 0–1. Low where the numeral could not be read and was inferred. */
  confidence: number;
  /** Why the confidence is low, when it is. */
  note?: string;
}

export interface VisionPlate {
  /** Slug under `public/drawings/ft3w`. */
  slug: string;
  /** Figure group number this plate was read for. */
  groupNo: string;
  markers: VisionMarker[];
  /** Defects seen in the plate itself, reported rather than worked around. */
  defects: string[];
}

export const VISION_READINGS: VisionPlate[] = [
  {
    slug: "fat-truck-ft3w-1-1-filters",
    groupNo: "1.1",
    markers: [
      { number: 1, x: 33.6, y: 5.3, confidence: 0.95 },
      { number: 3, x: 58.4, y: 3.8, confidence: 0.95 },
      { number: 5, x: 81.1, y: 6.1, confidence: 0.95 },
      { number: 2, x: 32.4, y: 51.4, confidence: 0.95 },
      { number: 4, x: 60.5, y: 55.3, confidence: 0.95 },
      { number: 6, x: 82.6, y: 60.3, confidence: 0.95 },
    ],
    defects: [],
  },
  {
    slug: "fat-truck-ft3w-3-1-hydraulic-motor-assembly",
    groupNo: "3.1",
    markers: [
      { number: 2, x: 12.3, y: 12.9, confidence: 0.95 },
      { number: 3, x: 21.3, y: 10.0, confidence: 0.95 },
      {
        number: 4,
        x: 32.7,
        y: 5.8,
        confidence: 0.3,
        note: "circle is empty on the plate; number inferred from the leader line, which points at the wheel studs (item 4)",
      },
      {
        number: 1,
        x: 45.7,
        y: 3.5,
        confidence: 0.3,
        note: "circle is empty on the plate; number inferred from the leader line, which points at the motor body (item 1)",
      },
    ],
    defects: [
      "two of the four callout circles were delivered with no numeral inside them",
    ],
  },
];

const figureId = (groupNo: string) => `fig-ft3w-${groupNo.replace(/\./g, "-")}`;
const calloutId = (groupNo: string, number: number, seq: number) =>
  `clt-ft3w-${groupNo.replace(/\./g, "-")}-${number}-${seq}`;

export interface VisionResult {
  proposed: number;
  lowConfidence: number;
  unreadable: number;
  defects: { groupNo: string; detail: string }[];
}

/** Below this, the proposal is recorded but flagged for a closer look. */
export const LOW_CONFIDENCE = 0.7;

export async function placeVisionCallouts(): Promise<VisionResult> {
  const runId = "run-callouts-vision-pilot";

  await db
    .insert(importRun)
    .values({
      id: runId,
      kind: "callouts",
      sourceFile: "FT3W plates (vision read)",
      sourceChecksum: "pilot",
      status: "running",
    })
    .onConflictDoUpdate({
      target: importRun.id,
      set: { status: "running", startedAt: sql`now()`, finishedAt: null },
    });

  const result: VisionResult = {
    proposed: 0,
    lowConfidence: 0,
    unreadable: 0,
    defects: [],
  };

  for (const plate of VISION_READINGS) {
    const fid = figureId(plate.groupNo);

    for (const detail of plate.defects) {
      result.defects.push({ groupNo: plate.groupNo, detail });
    }

    for (const marker of plate.markers) {
      if (marker.number === null) {
        result.unreadable += 1;
        continue;
      }

      // Attach to the row carrying this item number, if the table is loaded.
      const rows = await db
        .select({ id: figurePart.id })
        .from(figurePart)
        .where(
          sql`${figurePart.figureId} = ${fid} and ${figurePart.itemNo} = ${marker.number}`,
        );

      await db
        .insert(callout)
        .values({
          id: calloutId(plate.groupNo, marker.number, 1),
          figureId: fid,
          figurePartId: rows[0]?.id ?? null,
          number: marker.number,
          x: marker.x,
          y: marker.y,
          source: "vision",
          confidence: marker.confidence,
          confirmedAt: null,
        })
        .onConflictDoUpdate({
          target: callout.id,
          set: {
            x: marker.x,
            y: marker.y,
            source: "vision",
            confidence: marker.confidence,
            // A re-read invalidates any earlier confirmation.
            confirmedAt: null,
          },
        });

      result.proposed += 1;
      if (marker.confidence < LOW_CONFIDENCE) result.lowConfidence += 1;
    }
  }

  await db
    .update(importRun)
    .set({
      status: "succeeded",
      finishedAt: sql`now()`,
      summary: `${result.proposed} coordinates proposed, ${result.lowConfidence} low confidence, none confirmed`,
    })
    .where(eq(importRun.id, runId));

  return result;
}

async function main(): Promise<void> {
  const result = await placeVisionCallouts();
  console.log("stage 5 — callout coordinates (vision pre-pass)");
  console.log(`  ${result.proposed} coordinates proposed across ${VISION_READINGS.length} plates`);
  console.log(`  ${result.lowConfidence} below ${LOW_CONFIDENCE} confidence`);
  console.log("  0 confirmed — none of these are servable until a person confirms them");

  if (result.defects.length) {
    console.log("\n  plate defects:");
    for (const defect of result.defects) {
      console.log(`    FIG ${defect.groupNo}: ${defect.detail}`);
    }
  }

  const unplaced = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(callout)
    .where(sql`${callout.x} is null`);
  console.log(`\n  callouts still without a position: ${unplaced[0].count}`);

  process.exit(0);
}

if (process.argv[1]?.endsWith("vision-callouts.ts")) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
