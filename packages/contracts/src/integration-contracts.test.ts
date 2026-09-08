import { Value } from "@sinclair/typebox/value";
import { describe, expect, it } from "vitest";
import {
  AdminOrderSchema,
  CalloutPatchSchema,
  CalloutSchema,
  CompanySchema,
  DraftFigureDetailSchema,
  DraftPartSchema,
  FigureDetailSchema,
  MoneySchema,
  PartUsageRowSchema,
  PartUsageSummarySchema,
  PricedFigureDetailSchema,
  PricedOrderDetailSchema,
  PricedPartSchema,
  PricedPartUsageRowSchema,
  ProductLineSchema,
  PublishInputSchema,
  PublishQueueSchema,
  PublishResultSchema,
  QuantitySchema,
  RateSchema,
  ReleasedCalloutSchema,
  SubmitOrderInputSchema,
  UnpricedFigureDetailSchema,
  UnpricedOrderDetailSchema,
  UnpricedPartSchema,
  UnpricedPartUsageRowSchema,
  VariantSchema,
} from "./index.js";

const releasedPart = {
  id: "working-part",
  releasePartId: "released-part",
  partNumber: "36-00304",
  description: "Air filter",
  manufacturer: null,
  listPrice: "123.45",
  currency: "CAD",
  supersededByPartId: null,
  requires: [{ partId: "working-seal", qty: 2 }],
  status: "active",
} as const;

const unpricedReleasedPart = {
  id: releasedPart.id,
  releasePartId: releasedPart.releasePartId,
  partNumber: releasedPart.partNumber,
  description: releasedPart.description,
  manufacturer: releasedPart.manufacturer,
  currency: releasedPart.currency,
  supersededByPartId: releasedPart.supersededByPartId,
  requires: releasedPart.requires,
  status: releasedPart.status,
} as const;

const figurePart = {
  id: "figure-part",
  figureId: "figure",
  partId: "working-part",
  qty: 1,
  remarks: null,
  serviceable: true,
} as const;

const releasedCallout = {
  id: "callout-1",
  figureId: "figure",
  figurePartId: "figure-part",
  number: "7",
  x: 0,
  y: 100,
  maskPath: null,
} as const;

const releasedFigureDetail = {
  release: { modelId: "model", releaseId: "release", revision: 3 },
  figure: {
    id: "figure",
    variantId: "variant",
    systemId: "system",
    name: "Filters",
    groupNo: "1.1",
    drawingFileId: "drawing",
    status: "published",
  },
  drawing: {
    id: "drawing",
    contentUrl: "/api/v1/drawings/drawing/content",
    filename: "filters.png",
    format: "png",
    width: 1600,
    height: 1200,
    version: 2,
  },
  system: { id: "system", name: "Engine", sortOrder: 10 },
  variant: {
    id: "variant",
    modelId: "model",
    label: "99FT3WXXXXXX and up",
    serialFrom: "99FT3WXXXXXX",
    serialTo: null,
    catalogRevision: null,
  },
  rows: [
    {
      figurePart,
      part: releasedPart,
      calloutNumbers: ["7", "7A"],
    },
  ],
  callouts: [releasedCallout],
} as const;

describe("decimal transport values", () => {
  it.each(["0.00", "1.05", "999999999999.99"])(
    "accepts the fixed money string %s",
    (money) => expect(Value.Check(MoneySchema, money)).toBe(true),
  );

  it.each(["0", "0.0", "00.00", "01.00", "1.001", "1000000000000.00", 1.25])(
    "rejects the non-canonical money value %s",
    (money) => expect(Value.Check(MoneySchema, money)).toBe(false),
  );

  it("accepts six-place rates only in the inclusive zero-to-one range", () => {
    expect(Value.Check(RateSchema, "0.125000")).toBe(true);
    expect(Value.Check(RateSchema, "1.000000")).toBe(true);
    expect(Value.Check(RateSchema, "1.000001")).toBe(false);
    expect(Value.Check(RateSchema, "0.15")).toBe(false);
  });
});

describe("released and draft catalog contracts", () => {
  it("uses distinct working and release-local part IDs in priced responses", () => {
    expect(Value.Check(PricedPartSchema, releasedPart)).toBe(true);
    expect(releasedPart.id).not.toBe(releasedPart.releasePartId);
    expect(Value.Check(PricedPartSchema, { ...releasedPart, releasePartId: undefined })).toBe(false);
  });

  it("omits hidden prices instead of encoding them as zero or null", () => {
    expect(Value.Check(UnpricedPartSchema, unpricedReleasedPart)).toBe(true);
    expect(Value.Check(UnpricedPartSchema, { ...unpricedReleasedPart, listPrice: "0.00" })).toBe(false);
    expect(Value.Check(UnpricedPartSchema, { ...unpricedReleasedPart, listPrice: null })).toBe(false);
  });

  it("allows nullable staff prices without inventing release-local IDs", () => {
    const part = {
      id: releasedPart.id,
      partNumber: releasedPart.partNumber,
      description: releasedPart.description,
      manufacturer: releasedPart.manufacturer,
      listPrice: releasedPart.listPrice,
      currency: releasedPart.currency,
      supersededByPartId: releasedPart.supersededByPartId,
      requires: releasedPart.requires,
      status: releasedPart.status,
    };

    expect(Value.Check(DraftPartSchema, { ...part, listPrice: null })).toBe(true);
    expect(Value.Check(DraftPartSchema, part)).toBe(true);
    expect(Value.Check(DraftPartSchema, { ...part, releasePartId: "invented" })).toBe(false);
  });

  it("accepts nullable source metadata", () => {
    expect(Value.Check(ProductLineSchema, {
      id: "line",
      name: "Fat Truck",
      manufacturer: null,
      country: null,
      isDistributed: true,
    })).toBe(true);
    expect(Value.Check(VariantSchema, releasedFigureDetail.variant)).toBe(true);
    expect(Value.Check(FigureDetailSchema, {
      ...releasedFigureDetail,
      figure: { ...releasedFigureDetail.figure, groupNo: null },
    })).toBe(true);
    expect(Value.Check(DraftFigureDetailSchema, {
      figure: {
        ...releasedFigureDetail.figure,
        groupNo: null,
        drawingFileId: null,
        status: "draft",
      },
      drawing: null,
      system: releasedFigureDetail.system,
      variant: releasedFigureDetail.variant,
      rows: [],
      callouts: [{
        ...releasedCallout,
        figurePartId: null,
        x: null,
        y: null,
      }],
    })).toBe(true);
  });

  it("accepts repeated string labels as separate physical occurrences", () => {
    const second = { ...releasedCallout, id: "callout-2", x: 42 };

    expect(Value.Check(ReleasedCalloutSchema, releasedCallout)).toBe(true);
    expect(Value.Check(ReleasedCalloutSchema, second)).toBe(true);
    expect(Value.Check(FigureDetailSchema, {
      ...releasedFigureDetail,
      callouts: [releasedCallout, second],
    })).toBe(true);
  });

  it("accepts zero and boundary coordinates but rejects half coordinates", () => {
    expect(Value.Check(CalloutSchema, releasedCallout)).toBe(true);
    expect(Value.Check(CalloutSchema, { ...releasedCallout, y: null })).toBe(false);
    expect(Value.Check(CalloutSchema, { ...releasedCallout, x: null, y: null })).toBe(true);
  });

  it.each([Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY])(
    "rejects the non-finite callout coordinate %s at the contract boundary",
    (coordinate) => {
      expect(Value.Check(CalloutSchema, {
        ...releasedCallout,
        x: coordinate,
      })).toBe(false);
      expect(Value.Check(CalloutSchema, {
        ...releasedCallout,
        y: coordinate,
      })).toBe(false);
    },
  );

  it("requires a released drawing and placed mapped callouts for customer detail", () => {
    expect(Value.Check(FigureDetailSchema, releasedFigureDetail)).toBe(true);
    expect(Value.Check(FigureDetailSchema, { ...releasedFigureDetail, drawing: null })).toBe(false);
    expect(Value.Check(FigureDetailSchema, {
      ...releasedFigureDetail,
      callouts: [{ ...releasedCallout, figurePartId: null }],
    })).toBe(false);
  });

  it("copies part-usage read models with released parts", () => {
    expect(Value.Check(PartUsageRowSchema, {
      part: releasedPart,
      figureId: null,
      groupNo: null,
      assemblyName: null,
      systemName: null,
      modelName: null,
      serial: null,
    })).toBe(true);
    expect(Value.Check(PartUsageSummarySchema, {
      productLineName: null,
      modelName: null,
      serial: null,
      systemName: null,
      groupNo: null,
      assemblyName: null,
      figureId: null,
    })).toBe(true);
  });

  it("provides scope-specific figure detail schemas that reject cross-scope prices", () => {
    const unpricedDetail = {
      ...releasedFigureDetail,
      rows: [{
        ...releasedFigureDetail.rows[0],
        part: unpricedReleasedPart,
      }],
    };
    const mixedDetail = {
      ...releasedFigureDetail,
      rows: [releasedFigureDetail.rows[0], unpricedDetail.rows[0]],
    };

    expect(Value.Check(PricedFigureDetailSchema, releasedFigureDetail)).toBe(true);
    expect(Value.Check(PricedFigureDetailSchema, {
      ...releasedFigureDetail,
      figure: { ...releasedFigureDetail.figure, groupNo: null },
    })).toBe(true);
    expect(Value.Check(PricedFigureDetailSchema, unpricedDetail)).toBe(false);
    expect(Value.Check(UnpricedFigureDetailSchema, unpricedDetail)).toBe(true);
    expect(Value.Check(UnpricedFigureDetailSchema, releasedFigureDetail)).toBe(false);
    expect(Value.Check(FigureDetailSchema, mixedDetail)).toBe(false);
  });

  it("provides scope-specific part-usage row schemas that reject cross-scope prices", () => {
    const usage = {
      part: releasedPart,
      figureId: "figure",
      groupNo: null,
      assemblyName: "Filters",
      systemName: "Engine",
      modelName: "FT3 Wagon",
      serial: "99FT3WXXXXXX and up",
    } as const;
    const unpricedUsage = { ...usage, part: unpricedReleasedPart };

    expect(Value.Check(PricedPartUsageRowSchema, usage)).toBe(true);
    expect(Value.Check(PricedPartUsageRowSchema, unpricedUsage)).toBe(false);
    expect(Value.Check(UnpricedPartUsageRowSchema, unpricedUsage)).toBe(true);
    expect(Value.Check(UnpricedPartUsageRowSchema, usage)).toBe(false);
  });
});

describe("order input and response contracts", () => {
  const input = {
    variantId: "variant",
    releaseId: "release",
    customerReference: "PO-123",
    details: {
      generalComment: "Leave at receiving",
      shipping: { address: "100 Diamond Road", method: null },
    },
    lines: [{ releasePartId: "released-part", qty: 1, comment: "One" }],
  } as const;

  it.each([1, 9999])("accepts boundary quantity %i", (qty) => {
    expect(Value.Check(QuantitySchema, qty)).toBe(true);
    expect(Value.Check(SubmitOrderInputSchema, {
      ...input,
      lines: [{ ...input.lines[0], qty }],
    })).toBe(true);
  });

  it.each([0, 1.5, 10000])("rejects invalid quantity %s", (qty) => {
    expect(Value.Check(QuantitySchema, qty)).toBe(false);
  });

  it("accepts 1 through 250 lines and rejects line-count overflow", () => {
    expect(Value.Check(SubmitOrderInputSchema, input)).toBe(true);
    expect(Value.Check(SubmitOrderInputSchema, { ...input, lines: [] })).toBe(false);
    expect(Value.Check(SubmitOrderInputSchema, {
      ...input,
      lines: Array.from({ length: 250 }, (_, index) => ({
        releasePartId: `part-${index}`,
        qty: 1,
        comment: "",
      })),
    })).toBe(true);
    expect(Value.Check(SubmitOrderInputSchema, {
      ...input,
      lines: Array.from({ length: 251 }, (_, index) => ({
        releasePartId: `part-${index}`,
        qty: 1,
        comment: "",
      })),
    })).toBe(false);
  });

  it("bounds notes at 2000 characters and addresses at 4000", () => {
    expect(Value.Check(SubmitOrderInputSchema, {
      ...input,
      details: {
        generalComment: "n".repeat(2000),
        shipping: { address: "a".repeat(4000), method: "expedited" },
      },
      lines: [{ ...input.lines[0], comment: "n".repeat(2000) }],
    })).toBe(true);
    expect(Value.Check(SubmitOrderInputSchema, {
      ...input,
      details: { ...input.details, generalComment: "n".repeat(2001) },
    })).toBe(false);
    expect(Value.Check(SubmitOrderInputSchema, {
      ...input,
      details: {
        ...input.details,
        shipping: { address: "a".repeat(4001), method: "standard" },
      },
    })).toBe(false);
  });

  it("has separate priced and unpriced order responses", () => {
    const base = {
      id: "order",
      companyId: "company",
      submittedByUserId: "user",
      variantId: "variant",
      releaseId: "release",
      customerReference: "PO-123",
      status: "submitted",
      submittedAt: "2026-09-07T12:00:00.000Z",
      details: input.details,
      lines: [{
        partId: "working-part",
        releasePartId: "released-part",
        partNumberSnapshot: "36-00304",
        descriptionSnapshot: "Air filter",
        qty: 1,
        comment: "One",
        unitPriceSnapshot: "123.45",
        lineTotal: "123.45",
      }],
      currency: "CAD",
      listTotal: "123.45",
      discountRate: "0.100000",
      discountApplied: "12.35",
      netTotal: "111.10",
    } as const;
    const unpriced = {
      id: base.id,
      companyId: base.companyId,
      submittedByUserId: base.submittedByUserId,
      variantId: base.variantId,
      releaseId: base.releaseId,
      customerReference: base.customerReference,
      status: base.status,
      submittedAt: base.submittedAt,
      details: base.details,
      currency: base.currency,
      lines: [{
        partId: base.lines[0].partId,
        releasePartId: base.lines[0].releasePartId,
        partNumberSnapshot: base.lines[0].partNumberSnapshot,
        descriptionSnapshot: base.lines[0].descriptionSnapshot,
        qty: base.lines[0].qty,
        comment: base.lines[0].comment,
      }],
    };

    expect(Value.Check(PricedOrderDetailSchema, base)).toBe(true);
    expect(Value.Check(UnpricedOrderDetailSchema, unpriced)).toBe(true);
    expect(Value.Check(UnpricedOrderDetailSchema, base)).toBe(false);
  });
});

describe("admin mutation and summary contracts", () => {
  it("accepts internal companies while omitting hidden company rates", () => {
    expect(Value.Check(CompanySchema, {
      id: "company",
      name: "RufDiamond",
      type: "internal",
      defaultShippingAddress: "a".repeat(4000),
    })).toBe(true);
    expect(Value.Check(CompanySchema, {
      id: "company",
      name: "RufDiamond",
      type: "internal",
      defaultShippingAddress: "a".repeat(4001),
    })).toBe(false);
  });

  it("uses canonical order status in admin transport", () => {
    const order = {
      id: "order",
      reference: "RFQ-1",
      customer: "Diamond Mine",
      productLine: "Fat Truck",
      model: "FT3 Wagon",
      serialRange: "99FT3WXXXXXX and up",
      lines: 1,
      valueCad: "123.45",
      discountTier: "dealer",
      state: "fulfilled",
    };

    expect(Value.Check(AdminOrderSchema, order)).toBe(true);
    expect(Value.Check(AdminOrderSchema, { ...order, state: "shipped" })).toBe(false);
  });

  it("supports optimistic callout patches and integer publication revisions", () => {
    expect(Value.Check(CalloutPatchSchema, {
      version: 2,
      figurePartId: null,
      x: 0,
      y: 100,
      maskPath: null,
    })).toBe(true);
    expect(Value.Check(PublishInputSchema, {
      modelId: "model",
      expectedWorkingVersion: 4,
      summary: "Complete filters",
    })).toBe(true);
    expect(Value.Check(PublishResultSchema, {
      modelId: "model",
      releaseId: "release",
      revision: 5,
      checksum: "sha256:abc",
    })).toBe(true);
    expect(Value.Check(PublishQueueSchema, {
      ready: [],
      blocked: [],
      history: [{
        id: "release",
        revision: 5,
        summary: "Complete filters",
        by: "user",
        when: "2026-09-07T12:00:00.000Z",
      }],
      environment: "draft",
      liveRevision: 5,
    })).toBe(true);
  });

  it("rejects additional properties at nested transport boundaries", () => {
    expect(Value.Check(SubmitOrderInputSchema, {
      variantId: "variant",
      releaseId: "release",
      customerReference: "PO-123",
      details: {
        generalComment: "",
        shipping: {
          address: "100 Diamond Road",
          method: "standard",
          unsafe: true,
        },
      },
      lines: [{ releasePartId: "released-part", qty: 1, comment: "" }],
    })).toBe(false);
  });
});
