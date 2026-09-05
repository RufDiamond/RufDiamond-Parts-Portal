/**
 * Matching plates to figures.
 *
 * Filenames are a proposal, not identity. Three things break a naive match:
 *
 *   - System 11's plates are numbered one below the catalog's, because the
 *     catalog inserts `11.1 Battery` ahead of them and no plate was delivered
 *     for it. Matching on group number alone would attach the console plate to
 *     the battery figure and shift the whole system.
 *   - Filenames carry typos the catalog does not (`WINDSHIEL ASSEMBLY`).
 *   - Some filenames name the contents rather than the figure
 *     (`12-1 POCLAIN INSTALLATION TOOL` against `12.1 Accessories`).
 *
 * So names are ranked first and group numbers only break ties. Everything
 * below `AUTO_ATTACH_MIN` is held for a person to confirm.
 */

import type { PlateFile } from "./plates";
import type { SourceFigure } from "./catalog-source";

/** Below this, the match is proposed but not applied. */
export const AUTO_ATTACH_MIN = 0.6;

export interface PlateMatch {
  plate: PlateFile;
  figure: SourceFigure | null;
  /** Dice coefficient over name tokens, 0–1. */
  score: number;
  /** True when names alone did not decide it. */
  byElimination: boolean;
  /** True when the plate's filename group number disagrees with the figure's. */
  groupNoDisagrees: boolean;
  reason: string;
}

/** Drops option codes, punctuation and case, leaving comparable tokens. */
export function nameTokens(value: string): Set<string> {
  return new Set(
    value
      .toLowerCase()
      .replace(/\([^)]*\)/g, " ")
      .replace(/[^a-z0-9]+/g, " ")
      .trim()
      .split(/\s+/)
      .filter(Boolean),
  );
}

/** Dice coefficient: 2|A∩B| / (|A|+|B|). 1 when the token sets are equal. */
export function similarity(a: string, b: string): number {
  const setA = nameTokens(a);
  const setB = nameTokens(b);
  if (setA.size === 0 || setB.size === 0) return 0;
  let shared = 0;
  for (const token of setA) if (setB.has(token)) shared += 1;
  return (2 * shared) / (setA.size + setB.size);
}

/**
 * Assigns each plate at most one figure, greedily by descending name score
 * within a system, then pairing any single leftover of each.
 */
export function matchPlates(
  plates: PlateFile[],
  figures: SourceFigure[],
): PlateMatch[] {
  const results: PlateMatch[] = [];
  const systemCodes = new Set(plates.map((p) => p.proposedSystemCode));

  for (const code of systemCodes) {
    const systemPlates = plates.filter((p) => p.proposedSystemCode === code);
    const systemFigures = figures.filter((f) => f.systemCode === code);

    const scored: { plate: PlateFile; figure: SourceFigure; score: number }[] = [];
    for (const plate of systemPlates) {
      for (const figure of systemFigures) {
        scored.push({
          plate,
          figure,
          score: similarity(plate.proposedName ?? "", figure.name),
        });
      }
    }

    // Group number breaks ties between equal name scores, never overrides them.
    scored.sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      const aExact = a.plate.proposedGroupNo === a.figure.groupNo ? 1 : 0;
      const bExact = b.plate.proposedGroupNo === b.figure.groupNo ? 1 : 0;
      return bExact - aExact;
    });

    const takenPlates = new Set<string>();
    const takenFigures = new Set<string>();

    for (const candidate of scored) {
      if (candidate.score <= 0) continue;
      if (takenPlates.has(candidate.plate.slug)) continue;
      if (takenFigures.has(candidate.figure.groupNo)) continue;

      takenPlates.add(candidate.plate.slug);
      takenFigures.add(candidate.figure.groupNo);

      const disagrees = candidate.plate.proposedGroupNo !== candidate.figure.groupNo;
      results.push({
        plate: candidate.plate,
        figure: candidate.figure,
        score: candidate.score,
        byElimination: false,
        groupNoDisagrees: disagrees,
        reason:
          candidate.score >= AUTO_ATTACH_MIN
            ? `name match ${candidate.score.toFixed(2)}`
            : `weak name match ${candidate.score.toFixed(2)} — confirm before publishing`,
      });
    }

    // One plate and one figure left over in a system pair by elimination. Not
    // a name match, so it is always held for review.
    const leftPlates = systemPlates.filter((p) => !takenPlates.has(p.slug));
    const leftFigures = systemFigures.filter((f) => !takenFigures.has(f.groupNo));

    if (leftPlates.length === 1 && leftFigures.length === 1) {
      results.push({
        plate: leftPlates[0],
        figure: leftFigures[0],
        score: 0,
        byElimination: true,
        groupNoDisagrees: leftPlates[0].proposedGroupNo !== leftFigures[0].groupNo,
        reason: `paired by elimination — filename says "${leftPlates[0].proposedName}", catalog says "${leftFigures[0].name}"`,
      });
    } else {
      for (const plate of leftPlates) {
        results.push({
          plate,
          figure: null,
          score: 0,
          byElimination: false,
          groupNoDisagrees: false,
          reason: "no figure matched",
        });
      }
    }
  }

  return results.sort((a, b) =>
    a.plate.slug.localeCompare(b.plate.slug, undefined, { numeric: true }),
  );
}

/** A match is applied only when names decided it and decided it well. */
export function shouldAutoAttach(match: PlateMatch): boolean {
  return (
    match.figure !== null && !match.byElimination && match.score >= AUTO_ATTACH_MIN
  );
}
