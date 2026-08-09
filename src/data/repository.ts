/**
 * Catalogue data access.
 *
 * This module is the seam. Today it reads a frozen in-memory seed; tomorrow it
 * calls the API. Every function is async and returns a Promise so the swap is
 * an implementation change, never a call-site change.
 *
 * Rules for callers:
 *   - Import from here, never from `@/data/seed`.
 *   - Await everything, even though it currently resolves immediately.
 *   - Treat returned objects as owned copies; mutating them affects nothing.
 */

import { seed } from "@/data/seed";
import type {
  Figure,
  FigureDetail,
  FigurePartRow,
  Model,
  Part,
  ProductLine,
  System,
  Variant,
} from "@/types/catalog";

/** Hand back a detached copy so no caller can reach into the seed. */
function detach<T>(value: T): T {
  return structuredClone(value);
}

export async function getProductLines(): Promise<ProductLine[]> {
  return detach(seed.productLines);
}

export async function getModels(): Promise<Model[]> {
  return detach(seed.models);
}

export async function getVariants(modelId: string): Promise<Variant[]> {
  return detach(seed.variants.filter((variant) => variant.modelId === modelId));
}

/**
 * Systems carried by a variant, in catalogue order. Systems are shared across
 * variants, so this returns the full list — including systems whose figures
 * have not been drawn yet, which is what the contents page shows.
 */
export async function getSystems(variantId: string): Promise<System[]> {
  const variantExists = seed.variants.some(
    (variant) => variant.id === variantId,
  );
  if (!variantExists) return [];

  return detach(
    [...seed.systems].sort((a, b) => a.sortOrder - b.sortOrder),
  );
}

export async function getFigures(
  variantId: string,
  systemId: string,
): Promise<Figure[]> {
  const figures = seed.figures
    .filter(
      (figure) => figure.variantId === variantId && figure.systemId === systemId,
    )
    .sort((a, b) => compareGroupNo(a.groupNo, b.groupNo));

  return detach(figures);
}

export async function getFigureDetail(
  figureId: string,
): Promise<FigureDetail | null> {
  const figure = seed.figures.find((candidate) => candidate.id === figureId);
  if (!figure) return null;

  const system = seed.systems.find(
    (candidate) => candidate.id === figure.systemId,
  );
  const variant = seed.variants.find(
    (candidate) => candidate.id === figure.variantId,
  );
  if (!system || !variant) return null;

  const callouts = seed.callouts
    .filter((callout) => callout.figureId === figure.id)
    .sort((a, b) => a.number - b.number);

  const rows: FigurePartRow[] = [];
  for (const figurePart of seed.figureParts) {
    if (figurePart.figureId !== figure.id) continue;

    const part = seed.parts.find(
      (candidate) => candidate.id === figurePart.partId,
    );
    if (!part) continue;

    const calloutNumbers = [
      ...new Set(
        callouts
          .filter((callout) => callout.figurePartId === figurePart.id)
          .map((callout) => callout.number),
      ),
    ].sort((a, b) => a - b);

    rows.push({ figurePart, part, calloutNumbers });
  }

  // Parts list order follows the callout numbers on the plate; unnumbered
  // reference items fall to the bottom.
  rows.sort((a, b) => {
    const left = a.calloutNumbers[0] ?? Number.MAX_SAFE_INTEGER;
    const right = b.calloutNumbers[0] ?? Number.MAX_SAFE_INTEGER;
    if (left !== right) return left - right;
    return a.part.partNumber.localeCompare(b.part.partNumber);
  });

  return detach({ figure, system, variant, rows, callouts });
}

/**
 * Free-text part search over part number and description. Separators are
 * ignored on the number side, so "3600304" finds "36-00304".
 */
export async function searchParts(query: string): Promise<Part[]> {
  const trimmed = query.trim().toLowerCase();
  if (!trimmed) return [];

  const loose = stripSeparators(trimmed);

  const matches = seed.parts.filter((part) => {
    const number = stripSeparators(part.partNumber.toLowerCase());
    return (
      number.includes(loose) ||
      part.description.toLowerCase().includes(trimmed) ||
      (part.manufacturer?.toLowerCase().includes(trimmed) ?? false)
    );
  });

  matches.sort((a, b) => a.partNumber.localeCompare(b.partNumber));
  return detach(matches);
}

function stripSeparators(value: string): string {
  return value.replace(/[^a-z0-9]/g, "");
}

/** "1.10" sorts after "1.2", which a plain string compare gets wrong. */
function compareGroupNo(a: string, b: string): number {
  const left = a.split(".").map(Number);
  const right = b.split(".").map(Number);

  for (let i = 0; i < Math.max(left.length, right.length); i += 1) {
    const diff = (left[i] ?? 0) - (right[i] ?? 0);
    if (diff) return diff;
  }
  return a.localeCompare(b);
}
