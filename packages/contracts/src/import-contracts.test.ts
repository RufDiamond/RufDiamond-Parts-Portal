import { describe, expect, it } from "vitest";
import { Value } from "@sinclair/typebox/value";
import {
  canApplyImport,
  ImportUploadMetadataSchema,
  NormalizedImportFieldsSchema,
  StagedImportNormalizationSchema,
} from "./admin.js";
describe("strict staged import contracts", () => {
  it("distinguishes invalid raw staging from valid normalized positive quantities", () => {
    expect(
      Value.Check(StagedImportNormalizationSchema, {
        normalizationState: "invalid",
        fields: null,
      }),
    ).toBe(true);
    expect(
      Value.Check(StagedImportNormalizationSchema, {
        normalizationState: "valid",
        fields: null,
      }),
    ).toBe(false);
    expect(
      Value.Check(NormalizedImportFieldsSchema, {
        partNumber: "P-1",
        description: "Bracket",
        model: "FT3",
        variant: "Machine",
        system: "Frame",
        groupNo: null,
        figureName: "Plate",
        effectiveFrom: null,
        effectiveTo: null,
        qty: 0,
        pnc: null,
        listPrice: null,
        currency: "CAD",
        manufacturer: null,
        serviceable: true,
        remarks: null,
      }),
    ).toBe(false);
  });
  it("rejects arbitrary identity/keys/upload formats at the transport boundary", () => {
    const metadata = {
      modelId: "11111111-1111-4111-8111-111111111111",
      variantId: "22222222-2222-4222-8222-222222222222",
      filename: "source.xlsx",
      format: "xlsx",
      sourceKind: "workbook",
      lineageKey: "test",
      sha256: "a".repeat(64),
    };
    expect(Value.Check(ImportUploadMetadataSchema, metadata)).toBe(true);
    for (const extra of [
      { actorId: metadata.modelId },
      { objectKey: "private/key" },
      { format: "xlsm" },
      { filename: "../source.xlsx" },
      { sha256: "a".repeat(63) },
    ])
      expect(
        Value.Check(ImportUploadMetadataSchema, { ...metadata, ...extra }),
      ).toBe(false);
  });
  it("only applies validated jobs with no blockers", () => {
    expect(
      canApplyImport({ id: "job", state: "validated", blockingIssueCount: 0 }),
    ).toBe(true);
    expect(
      canApplyImport({ id: "job", state: "validated", blockingIssueCount: 1 }),
    ).toBe(false);
    expect(
      canApplyImport({ id: "job", state: "staged", blockingIssueCount: 0 }),
    ).toBe(false);
  });
});
