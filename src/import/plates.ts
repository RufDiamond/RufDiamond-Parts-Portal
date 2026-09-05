/**
 * Stage 3 — plates.
 *
 * Copies the FT3W schematic PNGs into the repository, checksums and measures
 * them, and proposes a figure for each from its filename.
 *
 * The proposal is only a proposal. Filenames disagree with the published
 * catalog — system 11's plates are numbered one below the PDF's because the
 * PDF inserts `11.1 Battery` ahead of them — so every match carries a
 * confidence and the low ones are held for review rather than applied. See
 * spec §1.1.
 *
 * Dimensions are read from the PNG IHDR chunk directly. The plates are almost
 * all 1280x720, but two are not, and callout percentages resolve against these
 * numbers.
 */

import { createHash } from "node:crypto";
import { copyFileSync, mkdirSync, readFileSync, readdirSync, statSync } from "node:fs";
import { basename, join } from "node:path";

export const PLATE_SOURCE_DIR = "/Users/athifshaffy/Downloads/FT3W - SCHEMATICS";
export const PLATE_PUBLIC_DIR = "public/drawings/ft3w";

export interface PlateFile {
  /** Original filename, kept for traceability back to the delivery. */
  filename: string;
  /** Folder it arrived in, e.g. "8 ENGINE". */
  sourceFolder: string;
  /** Slugified name under `public/`. */
  slug: string;
  /** URL path the app serves it from. */
  storagePath: string;
  width: number;
  height: number;
  bytes: number;
  checksum: string;
  /** Group number parsed from the filename, e.g. "8.4". A proposal, not identity. */
  proposedGroupNo: string | null;
  /** System code parsed from the containing folder, e.g. 8. */
  proposedSystemCode: number | null;
  /** Figure name parsed from the filename, title-cased. */
  proposedName: string | null;
}

/** Reads width and height from a PNG's IHDR chunk. Throws on anything else. */
export function readPngSize(buf: Buffer): { width: number; height: number } {
  const isPng =
    buf.length > 24 &&
    buf[0] === 0x89 &&
    buf.toString("ascii", 1, 4) === "PNG" &&
    buf.toString("ascii", 12, 16) === "IHDR";
  if (!isPng) throw new Error("not a PNG, or IHDR is not the first chunk");
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
}

/**
 * `FAT TRUCK FT3W 8-4 EXHAUST.png` -> group "8.4", name "Exhaust".
 * Returns nulls when the filename does not follow the pattern, which is a
 * reason to review rather than a reason to fail.
 */
export function parsePlateName(filename: string): {
  groupNo: string | null;
  name: string | null;
} {
  const stem = basename(filename, ".png");
  const match = stem.match(/FT3W\s+(\d+)-(\d+)\s+(.+)$/i);
  if (!match) return { groupNo: null, name: null };
  const [, major, minor, rawName] = match;
  return { groupNo: `${major}.${minor}`, name: titleCase(rawName.trim()) };
}

/** `4 HYDRAULIC` -> 4. */
export function parseSystemCode(folder: string): number | null {
  const match = folder.match(/^(\d+)\s/);
  return match ? Number(match[1]) : null;
}

function titleCase(value: string): string {
  return value
    .toLowerCase()
    .replace(/(^|[\s\-/&(])([a-z])/g, (_, lead: string, ch: string) => lead + ch.toUpperCase());
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/\.png$/, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

/** Scans the delivery folder without writing anything. */
export function scanPlates(sourceDir = PLATE_SOURCE_DIR): PlateFile[] {
  const plates: PlateFile[] = [];

  for (const folder of readdirSync(sourceDir).sort()) {
    const folderPath = join(sourceDir, folder);
    if (!statSync(folderPath).isDirectory()) continue;

    for (const file of readdirSync(folderPath).sort()) {
      if (!file.toLowerCase().endsWith(".png")) continue;

      const buf = readFileSync(join(folderPath, file));
      const { width, height } = readPngSize(buf);
      const { groupNo, name } = parsePlateName(file);
      const slug = slugify(file);

      plates.push({
        filename: file,
        sourceFolder: folder,
        slug,
        storagePath: `/drawings/ft3w/${slug}.png`,
        width,
        height,
        bytes: buf.length,
        checksum: createHash("sha256").update(buf).digest("hex"),
        proposedGroupNo: groupNo,
        proposedSystemCode: parseSystemCode(folder),
        proposedName: name,
      });
    }
  }

  return plates;
}

/**
 * Copies each plate to `public/drawings/ft3w/<slug>.png`.
 *
 * Idempotent: a file whose checksum already matches is left alone, so a second
 * run neither rewrites nor duplicates. Returns the number actually copied.
 */
export function copyPlates(plates: PlateFile[], sourceDir = PLATE_SOURCE_DIR): number {
  mkdirSync(PLATE_PUBLIC_DIR, { recursive: true });
  let copied = 0;

  for (const plate of plates) {
    const dest = join(PLATE_PUBLIC_DIR, `${plate.slug}.png`);
    let destChecksum: string | null = null;
    try {
      destChecksum = createHash("sha256").update(readFileSync(dest)).digest("hex");
    } catch {
      // Not there yet.
    }
    if (destChecksum === plate.checksum) continue;

    copyFileSync(join(sourceDir, plate.sourceFolder, plate.filename), dest);
    copied += 1;
  }

  return copied;
}
