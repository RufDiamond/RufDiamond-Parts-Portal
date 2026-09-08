import { Value } from "@sinclair/typebox/value";
import { CalloutSchema, DraftPartSchema } from "@rufdiamond/contracts";
import { describe, expect, it } from "vitest";
import { toPreviewCallout, toPreviewDraftPart } from "@/data/catalog-adapter";
import type { Callout, Part } from "@/types/catalog";

const legacyPart: Part = {
  id: "working-part",
  partNumber: "36-00304",
  description: "Air filter",
  manufacturer: null,
  listPrice: 123.45,
  currency: "CAD",
  supersededByPartId: null,
  requires: [{ partId: "working-seal", qty: 2 }],
  status: "active",
};

describe("catalog preview adapter", () => {
  it("converts the numeric seed label without changing the source callout", () => {
    const source: Callout = {
      id: "callout",
      figureId: "figure",
      figurePartId: "figure-part",
      number: 7,
      x: 0,
      y: 100,
      maskPath: null,
    };

    const adapted = toPreviewCallout(source);

    expect(adapted.number).toBe("7");
    expect(source.number).toBe(7);
    expect(Value.Check(CalloutSchema, adapted)).toBe(true);
  });

  it("rejects legacy callouts with half-present coordinates", () => {
    const source: Callout = {
      id: "callout",
      figureId: "figure",
      figurePartId: "figure-part",
      number: 7,
      x: 0,
      y: null,
      maskPath: null,
    };

    expect(() => toPreviewCallout(source)).toThrow(RangeError);
  });

  it.each([Number.NaN, Number.POSITIVE_INFINITY, -0.01, 100.01])(
    "rejects the invalid legacy callout coordinate %s",
    (x) => {
      expect(() => toPreviewCallout({
        id: "callout",
        figureId: "figure",
        figurePartId: "figure-part",
        number: 7,
        x,
        y: 50,
        maskPath: null,
      })).toThrow(RangeError);
    },
  );

  it.each([
    [0, "0.00"],
    [0.1, "0.10"],
    [123.45, "123.45"],
    [999999999999.99, "999999999999.99"],
  ])("converts the valid seed price %s to %s", (price, expected) => {
    const adapted = toPreviewDraftPart({ ...legacyPart, listPrice: price });

    expect(adapted.listPrice).toBe(expected);
    expect(Value.Check(DraftPartSchema, adapted)).toBe(true);
  });

  it.each([Number.NaN, Number.POSITIVE_INFINITY, -0.01, 1_000_000_000_000])(
    "rejects the invalid seed price %s",
    (price) => {
      expect(() => toPreviewDraftPart({ ...legacyPart, listPrice: price })).toThrow(RangeError);
    },
  );
});
