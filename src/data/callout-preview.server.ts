import "server-only";

import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import {
  applyCalloutPreview,
  type CalloutPreview,
  type PreviewFigure,
  type PreviewMarker,
} from "@/lib/callout-preview";
import type { FigureDetail } from "@/types/catalog";

// Root package scripts launch Next.js and the focused tests from the project
// root. Avoid import.meta URL arithmetic here: Turbopack treats literal
// `new URL()` paths as bundled asset dependencies.
const REPOSITORY_ROOT = process.cwd();
const REVIEW_PATH = path.join(
  REPOSITORY_ROOT,
  "tools/callouts/review/proposals.json",
);
const CATALOGUE_PATH = path.join(REPOSITORY_ROOT, "src/data/ft3-wagon.ts");
const PUBLIC_ROOT = path.join(REPOSITORY_ROOT, "public");
const FAILURE_NOTICE =
  "Local preview — unapproved marker positions; not for ordering. Preview unavailable because validation failed; repository data is unchanged.";

interface ReviewSource {
  schemaVersion: number;
  status: string;
  catalogueSha256: string;
  reviewer: unknown;
  figures: unknown[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isMarker(value: unknown): value is PreviewMarker {
  return (
    isRecord(value) &&
    Number.isInteger(value.number) &&
    typeof value.x === "number" &&
    typeof value.y === "number"
  );
}

function parseProposal(value: unknown): PreviewFigure | null {
  if (!isRecord(value)) return null;
  if (
    typeof value.figureId !== "string" ||
    typeof value.drawingPath !== "string" ||
    typeof value.sha256 !== "string" ||
    !/^[a-f0-9]{64}$/.test(value.sha256) ||
    !Number.isInteger(value.width) ||
    !Number.isInteger(value.height) ||
    (value.width as number) <= 0 ||
    (value.height as number) <= 0 ||
    !Array.isArray(value.markers) ||
    !value.markers.every(isMarker) ||
    typeof value.notes !== "string"
  ) {
    return null;
  }

  return {
    figureId: value.figureId,
    drawingPath: value.drawingPath,
    sha256: value.sha256,
    width: value.width as number,
    height: value.height as number,
    markers: value.markers,
    notes: value.notes,
  };
}

function parseReviewSource(value: unknown): ReviewSource | null {
  if (!isRecord(value) || !Array.isArray(value.figures)) return null;
  if (
    value.schemaVersion !== 1 ||
    value.status !== "NOT_FOR_CUSTOMER_USE" ||
    value.reviewer !== null ||
    typeof value.catalogueSha256 !== "string" ||
    !/^[a-f0-9]{64}$/.test(value.catalogueSha256)
  ) {
    return null;
  }
  return value as unknown as ReviewSource;
}

function sha256(bytes: Buffer | string): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function unavailable(reason: string): string {
  return `Local preview — unapproved marker positions; not for ordering. Preview unavailable because of ${reason}; repository data is unchanged.`;
}

/**
 * Opt into review-only callout coordinates on a local development server.
 * Every enabled request revalidates both the catalogue and exact drawing bytes.
 */
export async function loadCalloutPreview(
  detail: FigureDetail,
): Promise<CalloutPreview> {
  if (
    process.env.NODE_ENV !== "development" ||
    process.env.RUF_CALLOUT_PREVIEW !== "1"
  ) {
    return { detail, notice: null };
  }

  try {
    const [reviewBytes, catalogueBytes] = await Promise.all([
      fs.readFile(REVIEW_PATH),
      fs.readFile(CATALOGUE_PATH),
    ]);
    const source = parseReviewSource(JSON.parse(reviewBytes.toString()));
    if (!source) return { detail, notice: unavailable("review source mismatch") };
    if (sha256(catalogueBytes) !== source.catalogueSha256) {
      return { detail, notice: unavailable("catalogue source mismatch") };
    }

    const proposal = parseProposal(
      source.figures.find(
        (candidate) =>
          isRecord(candidate) && candidate.figureId === detail.figure.id,
      ),
    );
    if (!proposal || !detail.drawing) {
      return {
        detail,
        notice: unavailable("no matching proposal or drawing is available"),
      };
    }

    const expectedDrawingPath = `public${detail.drawing.storagePath}`;
    if (proposal.drawingPath !== expectedDrawingPath) {
      return { detail, notice: unavailable("drawing path mismatch") };
    }
    if (
      proposal.width !== detail.drawing.width ||
      proposal.height !== detail.drawing.height
    ) {
      return { detail, notice: unavailable("drawing dimensions mismatch") };
    }

    const drawingPath = path.resolve(REPOSITORY_ROOT, proposal.drawingPath);
    if (!drawingPath.startsWith(`${PUBLIC_ROOT}${path.sep}`)) {
      return { detail, notice: unavailable("drawing path mismatch") };
    }
    const drawingBytes = await fs.readFile(drawingPath);
    if (sha256(drawingBytes) !== proposal.sha256) {
      return { detail, notice: unavailable("artwork source mismatch") };
    }

    return applyCalloutPreview(detail, proposal);
  } catch (error) {
    console.error("Callout preview validation failed", error);
    return { detail, notice: FAILURE_NOTICE };
  }
}
