/**
 * Parsing the `Notes` column.
 *
 * `catalog-data-structure.md` §5 anticipated one form, `Req. 14-00016 (2x)`.
 * The Rev 2 catalog uses several, and the distinctions matter:
 *
 *   NOT SHOWN                        the item has no marker on the plate
 *   MIDDLE NOT SHOWN                 three fitted, the middle one is hidden —
 *                                    the item IS on the plate
 *   OTHER SIDE NOT SHOWN             likewise; a mirrored pair, one drawn
 *   NOT SHOWN - FOR 19-00210         no marker, and fitted to another part
 *   NOT SHOWN - REPLACEMENT PART     no marker, service item
 *   WHEEL SEAL - NOT SHOWN           no marker; the prefix is a description
 *   TOW PACKAGE OPTION (88-00023)    belongs to an option kit
 *   MOUNTING HARDWARE                descriptive only
 *
 * Reading "MIDDLE NOT SHOWN" as not-shown would drop a marker that exists;
 * reading "WHEEL SEAL - NOT SHOWN" as shown would demand a marker that does
 * not. Both produce a figure that can never be published.
 *
 * Per §5 of that document, this is a reviewed step: everything parsed here is
 * a proposal recorded on an `extraction_row`, and the original text is kept
 * verbatim on `figure_part.remarks` regardless.
 */

/** Qualifiers meaning "some of these are drawn, one instance is not". */
const PARTIAL_VISIBILITY = /(MIDDLE|OTHER SIDE|ONE SIDE|EACH SIDE|OTHER SIDES)\s+NOT SHOWN/i;

/** `NN-NNNNN`, `NN-NNNNNN-NNN`, `NN-NNNNNN-NN`. */
export const PART_NUMBER_PATTERN = /^\d{2}-\d{5,6}(-\d{2,3})?$/;

/** Notes at or beyond this length with no terminator may have been clipped. */
const TRUNCATION_SUSPECT_LENGTH = 35;

export interface ParsedNote {
  /** False only when the item has no marker on the plate at all. */
  shown: boolean;
  /** Option kit this row belongs to, e.g. "88-00023". */
  optionPartNumber: string | null;
  /**
   * Part this row is fitted to, from `FOR 19-00210`. The relationship reads
   * "ordering 19-00210 also needs this", so the edge runs from the named part
   * to this one — see `backend-specification.md` §3.2 on direction.
   */
  fittedToPartNumber: string | null;
  /** The note looks cut off by its column width and cannot be recovered. */
  truncated: boolean;
}

export function parseNote(note: string | null): ParsedNote {
  const text = (note ?? "").trim();

  if (!text) {
    return {
      shown: true,
      optionPartNumber: null,
      fittedToPartNumber: null,
      truncated: false,
    };
  }

  const mentionsNotShown = /\bNOT SHOWN\b/i.test(text);
  const partiallyVisible = PARTIAL_VISIBILITY.test(text);

  const option = text.match(/OPTION\s*\((\d{2}-\d{5})\)/i);
  const fittedTo = text.match(/\bFOR\s+(\d{2}-\d{5,6}(?:-\d{2,3})?)/i);

  return {
    shown: !mentionsNotShown || partiallyVisible,
    optionPartNumber: option ? option[1] : null,
    fittedToPartNumber: fittedTo ? fittedTo[1] : null,
    truncated: looksTruncated(text),
  };
}

/**
 * A heuristic, and only ever a flag for review — never a claim. The source
 * column clips long notes mid-word (`2 ON THE OTHER BACKSIDE OF REAR BUMP`),
 * and that text is not recoverable from the PDF.
 */
export function looksTruncated(text: string): boolean {
  if (text.length < TRUNCATION_SUSPECT_LENGTH) return false;
  if (/[.)\]"']$/.test(text)) return false;
  const lastWord = text.split(/\s+/).pop() ?? "";
  // A trailing all-caps fragment that is not a known whole word is the signal.
  return lastWord.length >= 3 && !/^(SHOWN|PART|SIDE|ONLY|EACH|HARDWARE|PARTS)$/i.test(lastWord);
}

export function isValidPartNumber(value: string): boolean {
  return PART_NUMBER_PATTERN.test(value.trim());
}
