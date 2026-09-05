/**
 * Import stages 1–3: reference data, figure skeleton, plates.
 *
 * Idempotent throughout, as `backend-specification.md` §7.3 requires — this
 * will be run many times and the second run must update rather than insert.
 * Ids are deterministic and every write is an upsert, so re-running is a
 * no-op rather than a duplication.
 *
 * Usage: `npm run import`
 */

import { createHash } from "node:crypto";
import { eq, sql } from "drizzle-orm";

import { db } from "../db/client";
import {
  drawingFile,
  figure,
  importRun,
  model,
  modelSystem,
  part,
  productLine,
  system,
  variant,
} from "../db/schema";
import {
  SOURCE_FIGURES,
  SOURCE_MODEL,
  SOURCE_PRODUCT_LINES,
  SOURCE_SYSTEMS,
  SOURCE_VARIANT,
} from "./catalog-source";
import { copyPlates, scanPlates, type PlateFile } from "./plates";
import { matchPlates, shouldAutoAttach, type PlateMatch } from "./match-plates";

const figureId = (groupNo: string) => `fig-ft3w-${groupNo.replace(/\./g, "-")}`;
const drawingId = (slug: string) => `drw-${slug}`;
const partId = (partNumber: string) => `prt-${partNumber.toLowerCase()}`;

/** Opens an `import_run` row. Its id is a digest of what is being imported. */
async function openRun(
  kind: "reference" | "figures" | "plates",
  sourceFile: string,
  checksum: string,
): Promise<string> {
  const id = `run-${kind}-${checksum.slice(0, 12)}`;
  await db
    .insert(importRun)
    .values({ id, kind, sourceFile, sourceChecksum: checksum, status: "running" })
    .onConflictDoUpdate({
      target: importRun.id,
      set: { status: "running", startedAt: sql`now()`, finishedAt: null },
    });
  return id;
}

async function closeRun(id: string, summary: string): Promise<void> {
  await db
    .update(importRun)
    .set({ status: "succeeded", finishedAt: sql`now()`, summary })
    .where(eq(importRun.id, id));
}

/* ------------------------------------------------------------------ *
 * Stage 1 — reference data and hierarchy
 * ------------------------------------------------------------------ */

export async function stageReference(): Promise<string> {
  const runId = await openRun("reference", "catalog-source.ts", digestOfSource());

  for (const line of SOURCE_PRODUCT_LINES) {
    await db
      .insert(productLine)
      .values(line)
      .onConflictDoUpdate({ target: productLine.id, set: { name: line.name } });
  }

  for (const src of SOURCE_SYSTEMS) {
    await db
      .insert(system)
      .values({
        id: src.id,
        code: src.code,
        name: src.name,
        sortOrder: src.code * 10,
      })
      .onConflictDoUpdate({
        target: system.id,
        set: { code: src.code, name: src.name, sortOrder: src.code * 10 },
      });
  }

  await db
    .insert(model)
    .values({ ...SOURCE_MODEL, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: model.id,
      set: { name: SOURCE_MODEL.name, updatedAt: new Date() },
    });

  await db
    .insert(variant)
    .values(SOURCE_VARIANT)
    .onConflictDoUpdate({
      target: variant.id,
      set: {
        label: SOURCE_VARIANT.label,
        serialFrom: SOURCE_VARIANT.serialFrom,
        catalogRevision: SOURCE_VARIANT.catalogRevision,
        docNumber: SOURCE_VARIANT.docNumber,
        edition: SOURCE_VARIANT.edition,
        publishedYear: SOURCE_VARIANT.publishedYear,
      },
    });

  // Every system in this catalog applies to the one model.
  const used = new Set(SOURCE_FIGURES.map((f) => f.systemCode));
  for (const src of SOURCE_SYSTEMS) {
    await db
      .insert(modelSystem)
      .values({
        modelId: SOURCE_MODEL.id,
        systemId: src.id,
        enabled: used.has(src.code),
      })
      .onConflictDoUpdate({
        target: [modelSystem.modelId, modelSystem.systemId],
        set: { enabled: used.has(src.code) },
      });
  }

  const summary = `${SOURCE_PRODUCT_LINES.length} product lines, ${SOURCE_SYSTEMS.length} systems, 1 model, 1 variant`;
  await closeRun(runId, summary);
  return summary;
}

/* ------------------------------------------------------------------ *
 * Stage 2 — figure skeleton
 * ------------------------------------------------------------------ */

export async function stageFigures(): Promise<string> {
  const runId = await openRun("figures", "96-00073 Rev 2 contents", digestOfSource());
  const systemIdByCode = new Map(SOURCE_SYSTEMS.map((s) => [s.code, s.id]));

  // Option kits named in figure titles are parts in their own right, so they
  // are created before the figures that reference them.
  let optionKits = 0;
  for (const src of SOURCE_FIGURES) {
    for (const partNumber of src.optionPartNumbers ?? []) {
      await db
        .insert(part)
        .values({
          id: partId(partNumber),
          partNumber,
          description: `${src.name} option kit`,
          listPrice: null,
          status: "active",
        })
        .onConflictDoNothing({ target: part.partNumber });
      optionKits += 1;
    }
  }

  for (const [index, src] of SOURCE_FIGURES.entries()) {
    const systemId = systemIdByCode.get(src.systemCode);
    if (!systemId) throw new Error(`unknown system code ${src.systemCode}`);

    const values = {
      id: figureId(src.groupNo),
      variantId: SOURCE_VARIANT.id,
      systemId,
      groupNo: src.groupNo,
      printedGroupNo: src.printedGroupNo ?? null,
      name: src.name,
      sortOrder: index * 10,
      status: "draft" as const,
      optionPartId: src.optionPartNumbers?.length
        ? partId(src.optionPartNumbers[0])
        : null,
      sourcePage: src.sourcePage,
    };

    await db
      .insert(figure)
      .values(values)
      .onConflictDoUpdate({
        target: figure.id,
        set: {
          name: values.name,
          groupNo: values.groupNo,
          printedGroupNo: values.printedGroupNo,
          systemId: values.systemId,
          sortOrder: values.sortOrder,
          optionPartId: values.optionPartId,
          sourcePage: values.sourcePage,
        },
      });
  }

  const summary = `${SOURCE_FIGURES.length} figures, ${optionKits} option kits`;
  await closeRun(runId, summary);
  return summary;
}

/* ------------------------------------------------------------------ *
 * Stage 3 — plates
 * ------------------------------------------------------------------ */

export interface PlateStageResult {
  summary: string;
  attached: PlateMatch[];
  review: PlateMatch[];
  figuresWithoutPlate: string[];
}

export async function stagePlates(): Promise<PlateStageResult> {
  const plates = scanPlates();
  const checksum = createHash("sha256")
    .update(plates.map((p) => p.checksum).join(""))
    .digest("hex");
  const runId = await openRun("plates", "FT3W - SCHEMATICS", checksum);

  copyPlates(plates);

  const matches = matchPlates(plates, SOURCE_FIGURES);
  const attached: PlateMatch[] = [];
  const review: PlateMatch[] = [];

  // Two filenames delivered with identical bytes mean one figure's plate is
  // missing and another's has been sent twice. Which is which is not
  // derivable, so neither is attached.
  const byChecksum = new Map<string, string[]>();
  for (const plate of plates) {
    byChecksum.set(plate.checksum, [
      ...(byChecksum.get(plate.checksum) ?? []),
      plate.filename,
    ]);
  }

  for (const match of matches) {
    await upsertDrawing(match.plate);

    const sharing = byChecksum.get(match.plate.checksum) ?? [];
    if (sharing.length > 1) {
      review.push({
        ...match,
        reason: `duplicate image — byte-identical to ${sharing
          .filter((f) => f !== match.plate.filename)
          .join(", ")}; one figure's plate was not delivered`,
      });
      continue;
    }

    if (shouldAutoAttach(match) && match.figure) {
      await db
        .update(figure)
        .set({ drawingFileId: drawingId(match.plate.slug) })
        .where(eq(figure.id, figureId(match.figure.groupNo)));
      attached.push(match);
    } else {
      // Stored and measured, but left unattached until a person confirms it.
      review.push(match);
    }
  }

  const attachedGroupNos = new Set(attached.map((m) => m.figure!.groupNo));
  const figuresWithoutPlate = SOURCE_FIGURES.filter(
    (f) => !attachedGroupNos.has(f.groupNo),
  ).map((f) => `${f.groupNo} ${f.name}`);

  const summary = `${plates.length} plates, ${attached.length} attached, ${review.length} held for review`;
  await closeRun(runId, summary);

  return { summary, attached, review, figuresWithoutPlate };
}

async function upsertDrawing(plate: PlateFile): Promise<void> {
  await db
    .insert(drawingFile)
    .values({
      id: drawingId(plate.slug),
      filename: plate.filename,
      format: "png",
      storagePath: plate.storagePath,
      width: plate.width,
      height: plate.height,
      checksum: plate.checksum,
      version: 1,
    })
    .onConflictDoUpdate({
      target: drawingFile.id,
      set: {
        checksum: plate.checksum,
        width: plate.width,
        height: plate.height,
        storagePath: plate.storagePath,
      },
    });
}

/** Digest of the transcribed catalog, so editing it re-runs rather than skips. */
function digestOfSource(): string {
  return createHash("sha256")
    .update(JSON.stringify({ SOURCE_FIGURES, SOURCE_SYSTEMS, SOURCE_VARIANT }))
    .digest("hex");
}

/* ------------------------------------------------------------------ *
 * CLI
 * ------------------------------------------------------------------ */

async function main(): Promise<void> {
  console.log("stage 1 — reference data");
  console.log(`  ${await stageReference()}`);

  console.log("stage 2 — figures");
  console.log(`  ${await stageFigures()}`);

  console.log("stage 3 — plates");
  const plates = await stagePlates();
  console.log(`  ${plates.summary}`);

  if (plates.review.length) {
    console.log("\n  held for review:");
    for (const match of plates.review) {
      const target = match.figure
        ? `${match.figure.groupNo} ${match.figure.name}`
        : "(no figure)";
      console.log(`    ${match.plate.filename}\n      -> ${target} — ${match.reason}`);
    }
  }

  const attachedByName = plates.attached.filter((m) => m.groupNoDisagrees);
  if (attachedByName.length) {
    console.log("\n  attached on name despite a group-number disagreement:");
    for (const match of attachedByName) {
      console.log(
        `    plate ${match.plate.proposedGroupNo} -> figure ${match.figure!.groupNo} ${match.figure!.name}`,
      );
    }
  }

  console.log("\n  figures with no plate attached:");
  for (const entry of plates.figuresWithoutPlate) console.log(`    ${entry}`);

  process.exit(0);
}

if (process.argv[1]?.endsWith("run.ts")) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
