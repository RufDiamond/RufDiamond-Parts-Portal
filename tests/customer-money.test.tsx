// @vitest-environment jsdom
import React from "react";
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { PartsTable } from "@/components/PartsTable";
import { formatPrice } from "@/lib/format";
import { requestReducer, initialRequestState } from "@/state/RequestContext";
import type { Part } from "@/types/catalog";

const part: Part = { id: "part", releasePartId: "release-part", partNumber: "P", description: "Synthetic", currency: "CAD", manufacturer: null, supersededByPartId: null, requires: [], status: "active" };
describe("authorized money and reference presentation", () => {
  it("omits unavailable money instead of printing NaN or zero", () => {
    expect(formatPrice(undefined, "CAD")).toBe("");
    expect(formatPrice("12.40", "CAD")).toBe("12.40");
    expect(formatPrice("0.00", "CAD")).toBe("0.00");
  });
  it("explains actual zero prices, retaining literal remarks and string references", () => {
    const row = { figurePart: { id: "row", figureId: "fig", partId: "part", qty: 1, remarks: "* special source", serviceable: true }, part: { ...part, listPrice: "0.00" }, calloutNumbers: ["A*"] };
    const shown = renderToStaticMarkup(<PartsTable rows={[row]} />);
    expect(shown).toContain("manufacturer information");
    expect(shown).toContain("request a quote");
    expect(shown).toContain("A*");
    expect(shown).toContain("* special source");
    const denied = renderToStaticMarkup(<PartsTable rows={[{ ...row, part }]} />);
    expect(denied).not.toContain("manufacturer information");
    expect(denied).not.toContain("0.00");
  });
  it("preserves release part identity and omitted prices in request state", () => {
    const state = requestReducer(initialRequestState, { type: "add", parts: [{ part, qty: 2 }] });
    expect(state.lines[0]).toHaveProperty("releasePartId", "release-part");
    expect(state.lines[0]).not.toHaveProperty("unitPriceSnapshot");
    expect(state.lines[0]).not.toHaveProperty("lineTotal");
  });
});
