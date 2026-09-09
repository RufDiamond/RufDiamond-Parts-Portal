import { describe, expect, it } from "vitest";
import { Value } from "@sinclair/typebox/value";
import { FigurePartSchema } from "../src/catalog.js";
import { MappingSourceSchema } from "../src/diagram-mapping.js";
import * as admin from "../src/admin.js";
import type { TSchema } from "@sinclair/typebox";

describe("installed quantity semantics", () => {
  it("pairs mapping-source quantity and semantics strictly", () => {
    const source = {
      figure: { id: "f", name: "F", version: 1, variantId: "v", modelId: "m" },
      drawing: null,
      catalogueBindingSha256: "a".repeat(64),
      occurrences: [],
    };
    const row = {
      id: "r",
      partId: "p",
      partNumber: "P",
      description: "Assembly",
      refLabels: ["-"],
      version: 1,
    };
    for (const quantity of [
      { qty: null },
      { qty: 1, quantitySemantics: "unspecified-installed" },
      { qty: null, quantitySemantics: "known" },
    ])
      expect(
        Value.Check(MappingSourceSchema, {
          ...source,
          rows: [{ ...row, ...quantity }],
        }),
      ).toBe(false);
    expect(
      Value.Check(MappingSourceSchema, {
        ...source,
        rows: [
          { ...row, qty: null, quantitySemantics: "unspecified-installed" },
        ],
      }),
    ).toBe(true);
  });
  const row = {
    id: "row",
    figureId: "figure",
    partId: "part",
    remarks: "Includes parts 1–18",
    serviceable: true,
  };
  it("accepts explicitly unspecified installed quantity without manufacturing one", () => {
    expect(
      Value.Check(FigurePartSchema, {
        ...row,
        qty: null,
        quantitySemantics: "unspecified-installed",
      }),
    ).toBe(true);
  });
  it("rejects zero, null ordinary quantity and contradictory assembly quantity", () => {
    for (const quantity of [
      { qty: 0 },
      { qty: null },
      { qty: 0, quantitySemantics: "unspecified-installed" },
      { qty: 1, quantitySemantics: "unspecified-installed" },
    ]) {
      expect(Value.Check(FigurePartSchema, { ...row, ...quantity })).toBe(
        false,
      );
    }
    expect(Value.Check(FigurePartSchema, { ...row, qty: 2 })).toBe(true);
  });
});

describe("attributable source review inputs", () => {
  const id = "11111111-1111-4111-8111-111111111111";
  const sha = "a".repeat(64);
  const quantity = {
    decision: "assembly-reference-unspecified",
    sourceBindingSha256: sha,
    stagingRowId: id,
    stagingRowVersion: 1,
    issueId: id,
    issueVersion: 1,
    evidence:
      "Manufacturer page 23 lists an assembly reference and unspecified quantity.",
    confirmed: true,
  };
  const figure = {
    mode: "table-only",
    sourceBindingSha256: sha,
    rowIds: [id],
    evidence:
      "Manufacturer page 31 is a table-only list for these exact source rows.",
    confirmed: true,
  };
  it("requires explicit combined semantics, source binding, exact row and confirmation", () => {
    const schema = (admin as unknown as Record<string, TSchema>)
      .AssemblyReferenceReviewInputSchema;
    expect(schema).toBeDefined();
    expect(Value.Check(schema, quantity)).toBe(true);
    for (const patch of [
      { decision: "quantity-only" },
      { confirmed: false },
      { evidence: " " },
      { issueVersion: 0 },
      { sourceBindingSha256: "" },
      { reviewerId: id },
      { actorId: id },
    ])
      expect(Value.Check(schema, { ...quantity, ...patch })).toBe(false);
  });
  it("distinguishes exact table-only coverage from unresolved conflicts", () => {
    const schema = (admin as unknown as Record<string, TSchema>)
      .DepictionReviewInputSchema;
    expect(schema).toBeDefined();
    expect(Value.Check(schema, figure)).toBe(true);
    for (const patch of [
      { mode: "source-conflict" },
      { rowIds: [] },
      { reviewer: id },
      { confirmed: false },
    ])
      expect(Value.Check(schema, { ...figure, ...patch })).toBe(false);
  });
});
