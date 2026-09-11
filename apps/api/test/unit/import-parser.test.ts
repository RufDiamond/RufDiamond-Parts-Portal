import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";
import {
  parseImport,
  SOURCE_COLUMNS,
} from "../../src/modules/imports/parser.js";
import { normalizeImport } from "../../src/modules/imports/normalizer.js";

const columns = [
  "No.",
  "PART NO",
  "DESCRIPTION",
  "MODEL",
  "VARIANTS",
  "AGGREGATE / SYSTEM",
  "GROUPNO",
  "ASSEMBLY NAME - PAGE",
  "START DATE",
  "END DATE",
  "QTY",
  "PNC",
  "UNIT PRICE (CAD)",
  "MAKER",
  "S/NS",
  "REMARKS",
];
const base = [
  "001",
  " p-1 ",
  "Bracket",
  "FT3",
  "Machine",
  "Frame",
  "FIG 1.1",
  "Frame plate",
  "2026-01-01",
  "",
  "2",
  "7",
  "12.40",
  "",
  "S",
  "Requires P-2 (QTY 3)",
];
const csv = (rows = [base], headers = columns) =>
  Buffer.from(
    [headers, ...rows]
      .map((row) =>
        row.map((value) => `"${value.replaceAll('"', '""')}"`).join(","),
      )
      .join("\r\n"),
  );
const workbook = (rows: string[][] = [base]) => {
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(
    book,
    XLSX.utils.aoa_to_sheet([columns, ...rows]),
    "Parts",
  );
  return book;
};
const xlsx = (book = workbook(), bookType: "xlsx" | "xlsm" = "xlsx") =>
  XLSX.write(book, { type: "buffer", bookType, compression: true }) as Buffer;

describe("bounded canonical import parser", () => {
  it("preserves source record coordinates across empty CSV records", async () => {
    const source = Buffer.from(csv().toString().replace("\r\n", "\r\n\r\n"));
    const parsed = await parseImport(source, "csv");
    expect(parsed.rows).toHaveLength(1);
    expect(parsed.rows[0].rowNumber).toBe(3);
  });
  it("retains all sixteen literal columns and normalizes typed fields without losing missing versus zero", async () => {
    expect(SOURCE_COLUMNS).toEqual(columns);
    const parsed = await parseImport(csv(), "csv");
    expect(parsed.rows[0].sourcePayload).toEqual(
      Object.fromEntries(columns.map((key, i) => [key, base[i]])),
    );
    const normalized = normalizeImport(parsed);
    expect(normalized.rows[0].fields).toEqual({
      partNumber: "P-1",
      description: "Bracket",
      model: "FT3",
      variant: "Machine",
      system: "Frame",
      groupNo: "FIG 1.1",
      figureName: "Frame plate",
      effectiveFrom: "2026-01-01",
      effectiveTo: null,
      qty: 2,
      pnc: "7",
      listPrice: "12.40",
      currency: "CAD",
      manufacturer: null,
      serviceable: true,
      remarks: "Requires P-2 (QTY 3)",
    });
    expect(normalized.rows[0].hints).toEqual([
      {
        kind: "requires",
        partNumber: "P-2",
        qty: 3,
        reviewState: "pending",
        literal: base[15],
      },
    ]);
    const prices = await parseImport(
      csv([
        base.map((x, i) => (i === 12 ? "" : x)),
        base.map((x, i) => (i === 12 ? "0" : x)),
      ]),
      "csv",
    );
    expect(
      normalizeImport(prices).rows.map((row) => row.fields!.listPrice),
    ).toEqual([null, "0.00"]);
  });
  it("preserves repeated part and PNC observations and blocks ambiguous keys instead of collapsing them", async () => {
    const normalized = normalizeImport(
      await parseImport(
        csv([base, base.map((x, i) => (i === 0 ? "999" : x))]),
        "csv",
      ),
    );
    expect(normalized.rows).toHaveLength(2);
    expect(new Set(normalized.rows.map((r) => r.sourceRowKey)).size).toBe(2);
    expect(
      normalized.issues.filter((i) => i.code === "AMBIGUOUS_SOURCE_KEY"),
    ).toHaveLength(2);
  });
  it("accepts exact midnight source dates without shifting days and retains the original timestamp", async () => {
    const row = base.map((x, i) => (i === 8 ? "2026-01-01T00:00:00" : i === 9 ? "2026-01-02T00:00:00" : x));
    const parsed = normalizeImport(await parseImport(csv([row]), "csv"));
    expect(parsed.issues).toEqual([]);
    expect(parsed.rows[0].fields!.effectiveFrom).toBe("2026-01-01");
    expect(parsed.rows[0].sourcePayload["START DATE"]).toBe(
      "2026-01-01T00:00:00",
    );
    expect(parsed.rows[0].fields!.effectiveTo).toBe("2026-01-02");
    expect(parsed.rows[0].sourcePayload["END DATE"]).toBe("2026-01-02T00:00:00");
  });
  it.each([
    { date1904: true, start: 44561, end: 44562 },
    { date1904: false, start: 46023, end: 46024 },
    { date1904: undefined, start: 46023, end: 46024 },
  ])("preserves displayed start and end dates for workbook date1904=$date1904", async ({ date1904, start, end }) => {
    const book = workbook();
    if (date1904 !== undefined) book.Workbook = { WBProps: { date1904 } };
    book.Sheets.Parts.I2 = { t: "n", v: start, z: "yyyy-mm-dd" };
    book.Sheets.Parts.J2 = { t: "n", v: end, z: "yyyy-mm-dd" };
    const normalized = normalizeImport(await parseImport(xlsx(book), "xlsx"));
    expect(normalized.issues).toEqual([]);
    expect(normalized.rows[0].fields).toMatchObject({ effectiveFrom: "2026-01-01", effectiveTo: "2026-01-02" });
    expect(normalized.rows[0].sourcePayload["START DATE"]).toBe(start);
    expect(normalized.rows[0].sourcePayload["END DATE"]).toBe(end);
  });
  it.each([
    { cell: "I2", field: "START DATE" },
    { cell: "J2", field: "END DATE" },
  ])("blocks fractional numeric $field without rounding or replacing its raw value", async ({ cell, field }) => {
    const book = workbook();
    book.Sheets.Parts[cell] = { t: "n", v: 46023.000001, z: "yyyy-mm-dd" };
    const normalized = normalizeImport(await parseImport(xlsx(book), "xlsx"));
    expect(normalized.issues).toMatchObject([{ code: "INVALID_FIELD", severity: "error", field }]);
    expect(normalized.rows[0]).toMatchObject({ normalizationState: "invalid", fields: null });
    expect(normalized.rows[0].sourcePayload[field]).toBe(46023.000001);
  });
  it("uses unchanged semantic identities through reordering/No. changes and changed quantity", async () => {
    const original = normalizeImport(await parseImport(csv(), "csv"));
    const changed = normalizeImport(
      await parseImport(
        csv([base.map((x, i) => (i === 0 ? "999" : i === 10 ? "4" : x))]),
        "csv",
      ),
    );
    expect(changed.rows[0].identityKey).toBe(original.rows[0].identityKey);
    expect(changed.rows[0].contentHash).not.toBe(original.rows[0].contentHash);
    expect(normalizeImport(await parseImport(csv(), "csv"))).toEqual(original);
  });
  it.each([
    [12, "1.234"],
    [12, "NaN"],
    [10, "1.5"],
    [10, "0"],
    [8, "2026-02-30"],
    [8, "46023"],
    [9, "46024"],
    [9, "2025-01-01"],
    [14, "MAYBE"],
  ])(
    "stages malformed column %s as a blocking issue with raw value %s",
    async (column, value) => {
      const parsed = normalizeImport(
        await parseImport(
          csv([base.map((x, i) => (i === column ? String(value) : x))]),
          "csv",
        ),
      );
      expect(parsed.issues.some((issue) => issue.severity === "error")).toBe(
        true,
      );
      expect(parsed.rows[0].sourcePayload[columns[Number(column)]]).toBe(
        String(value),
      );
    },
  );
  it("reads a real synthetic XLSX with all raw fields and rejects unrecognized columns", async () => {
    expect(
      (await parseImport(xlsx(), "xlsx")).rows[0].sourcePayload["No."],
    ).toBe("001");
    await expect(
      parseImport(
        csv(
          [base],
          columns.map((x, i) => (i === 15 ? "SECRET" : x)),
        ),
        "csv",
      ),
    ).rejects.toThrow(/columns/i);
  });
  it("rejects formula cells, macro-enabled archives, wrong signatures, invalid UTF8 and oversized input", async () => {
    const book = workbook();
    book.Sheets.Parts.B2 = { t: "n", f: "1+1", v: 2 };
    await expect(parseImport(xlsx(book), "xlsx")).rejects.toThrow(/formula/i);
    await expect(parseImport(xlsx(workbook(), "xlsm"), "xlsx")).rejects.toThrow(
      /macro/i,
    );
    await expect(
      parseImport(Buffer.from("not an xlsx"), "xlsx"),
    ).rejects.toThrow(/signature/i);
    await expect(parseImport(Buffer.from([0xff, 0xff]), "csv")).rejects.toThrow(
      /UTF/i,
    );
    await expect(
      parseImport(Buffer.alloc(25 * 1024 * 1024 + 1), "csv"),
    ).rejects.toThrow(/limit/i);
    await expect(
      parseImport(
        csv([base.map((x, i) => (i === 2 ? '=HYPERLINK("x")' : x))]),
        "csv",
      ),
    ).rejects.toThrow(/formula/i);
  });
  it("rejects XLSX expansion beyond the configured hard bound before parsing cells", async () => {
    const book = workbook();
    book.Sheets.Parts.P2 = { t: "s", v: "a".repeat(8192) };
    await expect(
      parseImport(xlsx(book), "xlsx", { maxExpandedBytes: 4096 }),
    ).rejects.toThrow(/expanded.*limit/i);
  });
});
