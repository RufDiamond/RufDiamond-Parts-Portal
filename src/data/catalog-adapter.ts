import type { Callout, DraftPart } from "@rufdiamond/contracts";
import type {
  Callout as LegacyCallout,
  Part as LegacyPart,
} from "@/types/catalog";

const MAX_PREVIEW_PRICE = 999_999_999_999.99;

/** Convert a legacy seed marker at the preview boundary without mutating it. */
export function toPreviewCallout(c: LegacyCallout): Callout {
  if (c.x === null || c.y === null) {
    if (c.x !== null || c.y !== null) {
      throw new RangeError("Preview callout coordinates must be paired");
    }

    return {
      ...c,
      number: String(c.number),
      x: null,
      y: null,
    };
  }

  if (!isPreviewCoordinate(c.x) || !isPreviewCoordinate(c.y)) {
    throw new RangeError("Preview callout coordinates must be finite and within 0-100");
  }

  return {
    ...c,
    number: String(c.number),
    x: c.x,
    y: c.y,
  };
}

function isPreviewCoordinate(value: number): boolean {
  return Number.isFinite(value) && value >= 0 && value <= 100;
}

/**
 * Convert the legacy numeric seed price only for local preview use.
 * Reject values that cannot be represented by the shared fixed-decimal format.
 */
export function toPreviewDraftPart(part: LegacyPart): DraftPart {
  if (typeof part.listPrice !== "number") throw new RangeError("Preview requires a numeric fixture price");
  const listPrice = toPreviewMoney(part.listPrice);

  return {
    ...part,
    listPrice,
    requires: part.requires.map((requirement) => ({ ...requirement })),
  };
}

function toPreviewMoney(value: number): string {
  if (!Number.isFinite(value) || value < 0 || value > MAX_PREVIEW_PRICE) {
    throw new RangeError("Preview price is outside the transport money range");
  }

  const decimal = value.toFixed(2);
  if (Number(decimal) !== value) {
    throw new RangeError("Preview price must have no more than two decimal places");
  }

  return decimal;
}
