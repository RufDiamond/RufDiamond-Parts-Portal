import { Value } from "@sinclair/typebox/value";
import { expect, it } from "vitest";
import { CalloutSchema, ProblemDetailsSchema } from "./index.js";

it("accepts duplicate-number callouts and rejects a half coordinate", () => {
  const a = {
    id: crypto.randomUUID(),
    figureId: "f",
    figurePartId: "fp",
    number: "7",
    x: 10,
    y: 20,
    maskPath: null,
  };
  const b = { ...a, id: crypto.randomUUID(), x: 40 };

  expect(Value.Check(CalloutSchema, a)).toBe(true);
  expect(Value.Check(CalloutSchema, b)).toBe(true);
  expect(Value.Check(CalloutSchema, { ...a, y: null })).toBe(false);
  expect(
    Value.Check(ProblemDetailsSchema, {
      type: "https://parts.rufdiamond.com/problems/validation",
      title: "Validation failed",
      status: 422,
      code: "VALIDATION_FAILED",
      requestId: "req-1",
    }),
  ).toBe(true);
});
