import "server-only";
import fs from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import type { FigureDetail } from "@/types/catalog";
import type { CalloutPreview } from "@/lib/callout-preview";
import { validateMappingGeometry } from "@rufdiamond/contracts/diagram-geometry";
import { proposalRegions } from "@/lib/proposal-geometry";
import type { DiagramMappingDocument } from "@rufdiamond/contracts";

type Point = [number, number];
interface Artwork {
  path: string;
  sha256: string;
  width: number;
  height: number;
}
interface Annotation {
  calloutId: string;
  figurePartId: string;
  partNumber: string;
  number: number;
  x: number;
  y: number;
  polygons: Point[][];
  holes?: Point[][][];
  evidence: string;
}
interface FigureReview {
  figureId: string;
  original: Artwork;
  annotations: Annotation[];
  notes: string;
  warning?: string;
  replacement?: Artwork & { source: {
    pdfSha256: string; physicalPage: number; renderWidth: number; renderHeight: number;
    crop: { x: number; y: number; width: number; height: number };
  } };
}
const ROOT = process.cwd();
const PUBLIC = path.join(ROOT, "public");
const record = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === "object" && !Array.isArray(value);
const percent = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 100;
const digest = (bytes: Buffer) => createHash("sha256").update(bytes).digest("hex");

function polygon(value: unknown): value is Point[] {
  if (!Array.isArray(value) || value.length < 3 || value.length > 500 ||
    !value.every((point) => Array.isArray(point) && point.length === 2 && point.every(percent))) return false;
  // Reject empty/collinear regions, not just malformed SVG syntax.
  const points = value as Point[];
  const area = points.reduce((sum, [x, y], index) => {
    const next = points[(index + 1) % points.length];
    return sum + x * next[1] - next[0] * y;
  }, 0);
  return Math.abs(area) > 0.0001;
}

function annotation(value: unknown): value is Annotation {
  return record(value) && typeof value.calloutId === "string" &&
    typeof value.figurePartId === "string" && typeof value.partNumber === "string" &&
    Number.isInteger(value.number) && percent(value.x) && percent(value.y) &&
    Array.isArray(value.polygons) && value.polygons.length <= 100 && value.polygons.every(polygon) &&
    (value.holes === undefined || (Array.isArray(value.holes) && value.holes.length === value.polygons.length &&
      value.holes.every((holes) => Array.isArray(holes) && holes.length <= 16 && holes.every(polygon)))) &&
    typeof value.evidence === "string" && value.evidence.trim().length > 0;
}

function artwork(value: unknown): value is Artwork {
  return record(value) && typeof value.path === "string" &&
    value.path.startsWith("public/drawings/ft3w/") && !value.path.split("/").includes("..") &&
    typeof value.sha256 === "string" && /^[a-f0-9]{64}$/.test(value.sha256) &&
    Number.isInteger(value.width) && (value.width as number) > 0 &&
    Number.isInteger(value.height) && (value.height as number) > 0;
}

async function verifyArtwork(item: Artwork) {
  const absolute = path.resolve(PUBLIC, item.path.slice("public/".length));
  if (!absolute.startsWith(`${PUBLIC}${path.sep}`)) throw new Error("drawing path mismatch");
  const bytes = await fs.readFile(absolute);
  if (digest(bytes) !== item.sha256) throw new Error("drawing hash mismatch");
  if (bytes.length < 24 || bytes.subarray(0, 8).toString("hex") !== "89504e470d0a1a0a" ||
    bytes.readUInt32BE(16) !== item.width || bytes.readUInt32BE(20) !== item.height) throw new Error("PNG dimensions mismatch");
}

function replacement(value: unknown): value is NonNullable<FigureReview["replacement"]> {
  if (!artwork(value) || !record(value) || !record(value.source)) return false;
  const source = value.source;
  const crop = source.crop;
  return typeof source.pdfSha256 === "string" && /^[a-f0-9]{64}$/.test(source.pdfSha256) &&
    Number.isInteger(source.physicalPage) && (source.physicalPage as number) > 0 &&
    Number.isInteger(source.renderWidth) && Number.isInteger(source.renderHeight) &&
    record(crop) && [crop.x, crop.y, crop.width, crop.height].every(Number.isInteger) &&
    (crop.x as number) >= 0 && (crop.y as number) >= 0 &&
    crop.width === value.width && crop.height === value.height &&
    (crop.x as number) + value.width <= (source.renderWidth as number) &&
    (crop.y as number) + value.height <= (source.renderHeight as number);
}

function pathFor(polygons: Point[][]): string | null {
  return polygons.length ? polygons.map((points) =>
    points.map(([x, y], index) => `${index === 0 ? "M" : "L"} ${x} ${y}`).join(" ") + " Z",
  ).join(" ") : null;
}

/** Called only after the development/explicit hosted-review surface gate. */
export async function addPartHighlightReview(original: FigureDetail, base: CalloutPreview): Promise<CalloutPreview> {
  let result = base;
  for (const filename of ["part-highlights.json", "part-highlights-chassis.json", "source-corrections.json"]) {
    let manifestFound = false;
    try {
      const bytes = await fs.readFile(path.join(ROOT, "tools/callouts/review", filename));
      manifestFound = true;
      const value: unknown = JSON.parse(bytes.toString());
      if (!record(value) || value.schemaVersion !== 1 || value.status !== "NOT_FOR_CUSTOMER_USE" ||
        value.reviewer !== null || !Array.isArray(value.figures)) throw new Error("review envelope mismatch");
      const matches = value.figures.filter((item) => record(item) && item.figureId === original.figure.id);
      if (!matches.length) continue;
      if (matches.length !== 1 || value.catalogueSha256 !== digest(await fs.readFile(path.join(ROOT, "src/data/ft3-wagon.ts")))) {
        throw new Error("catalogue identity mismatch");
      }
      const entry = matches[0];
      if (!record(entry) || !artwork(entry.original) || !Array.isArray(entry.annotations) ||
        !entry.annotations.every(annotation) || typeof entry.notes !== "string" ||
        (entry.warning !== undefined && typeof entry.warning !== "string")) throw new Error("invalid outline evidence");
      const review = entry as unknown as FigureReview;
      if (!original.drawing || review.original.path !== `public${original.drawing.storagePath}` ||
        review.original.width !== original.drawing.width || review.original.height !== original.drawing.height) throw new Error("drawing identity mismatch");
      await verifyArtwork(review.original);
      if (entry.replacement !== undefined) {
        if (filename !== "source-corrections.json" || !replacement(entry.replacement) ||
          entry.replacement.path === review.original.path ||
          original.callouts.some((item) => item.x !== null || item.y !== null || item.maskPath !== null)) throw new Error("replacement evidence mismatch");
        await verifyArtwork(entry.replacement);
      }
      if (original.figure.id === "fig-cabin-6-13" ||
        (original.figure.id === "fig-frame-assy-2-1" && !review.replacement)) throw new Error("unresolved source conflict");
      const byId = new Map<string, Annotation>();
      for (const item of review.annotations) {
        const occurrence = original.callouts.find((callout) => callout.id === item.calloutId);
        const row = original.rows.find((candidate) => candidate.figurePart.id === item.figurePartId);
        if (byId.has(item.calloutId) || !occurrence || !row || occurrence.figureId !== original.figure.id ||
          occurrence.figurePartId !== item.figurePartId || occurrence.number !== item.number ||
          row.figurePart.figureId !== original.figure.id || row.figurePart.partId !== row.part.id ||
          row.part.partNumber !== item.partNumber) throw new Error("part association mismatch");
        byId.set(item.calloutId, item);
      }
      // Never carry geometry across artwork versions, including earlier preview overlays.
      const sourceDetail = review.replacement ? original : result.detail;
      const sourceArtwork = review.replacement ?? review.original;
      // This review-only binding is computed from the verified source and exact
      // associations, never supplied by the browser or treated as approval.
      const binding = digest(Buffer.from(JSON.stringify({
        catalogueSha256: value.catalogueSha256, figure: original.figure,
        drawing: sourceArtwork,
        associations: original.callouts.map((callout) => ({ calloutId: callout.id,
          figurePartId: callout.figurePartId,
          partId: original.rows.find((row) => row.figurePart.id === callout.figurePartId)?.part.id ?? null,
        })).sort((a,b) => a.calloutId.localeCompare(b.calloutId)),
      })));
      let displayOnly = 0;
      const callouts = sourceDetail.callouts.map((callout) => {
        const item = byId.get(callout.id);
        if (!item) return callout;
        const rings = item.polygons.flatMap((outer, index) => [outer, ...(item.holes?.[index] ?? [])]);
        const legacy = { ...callout, x: callout.x ?? item.x, y: callout.y ?? item.y, maskPath: callout.maskPath ?? pathFor(rings) };
        // Supplied legacy outlines are read-only; no competing proposal can
        // replace their geometry or turn arbitrary SVG into an activation path.
        if (original.callouts.find((source) => source.id === callout.id)?.maskPath || !item.polygons.length) return legacy;
        const regions = proposalRegions(item, sourceArtwork.width, sourceArtwork.height);
        const document: DiagramMappingDocument = {
          schemaVersion: 1, figureId: original.figure.id,
          drawingFileId: review.replacement ? `${original.drawing!.id}-source-review` : original.drawing!.id,
          drawingSha256: sourceArtwork.sha256, imageWidth: sourceArtwork.width, imageHeight: sourceArtwork.height,
          catalogueBindingSha256: binding,
          occurrences: [{ calloutId: item.calloutId, figurePartId: item.figurePartId, refNo: String(item.number),
            labelRegion: null, regions, evidence: item.evidence }],
        };
        if (validateMappingGeometry(document).length) { displayOnly++; return legacy; }
        return { ...legacy, componentGeometry: {
          drawingPath: sourceArtwork.path.slice("public".length), drawingSha256: sourceArtwork.sha256,
          imageWidth: sourceArtwork.width, imageHeight: sourceArtwork.height, regions,
        } };
      });
      const highlights = callouts.filter((item) => item.maskPath !== null).length;
      const drawing = review.replacement ? {
        ...original.drawing,
        id: `${original.drawing.id}-source-review`,
        storagePath: review.replacement.path.slice("public".length),
        filename: path.basename(review.replacement.path),
        width: review.replacement.width, height: review.replacement.height,
        version: original.drawing.version + 1,
      } : result.detail.drawing;
      const prefix = review.replacement ? "Local preview — unapproved source-corrected drawing; not for ordering." : result.notice;
      result = {
        detail: { ...sourceDetail, drawing, callouts },
        notice: `${prefix ?? "Local preview — unapproved; not for ordering."} ${highlights} component outlines available; untraced parts highlight their reference only.${displayOnly ? ` ${displayOnly} outlines are display-only because their numeric geometry is invalid; use their reference labels.` : ""}${review.warning ? ` ${review.warning}` : ""}`,
      };
    } catch (error) {
      if (!manifestFound && record(error) && error.code === "ENOENT") continue;
      result = { ...result, notice: `${result.notice ?? "Local preview — unapproved; not for ordering."} Part highlights unavailable: source or mapping validation failed.` };
    }
  }
  return result;
}
