import { createHash } from "node:crypto";
import { SSF } from "xlsx";
import type { ParsedImport, RawImportRow, RawCell } from "./parser.js";
import { parseRemarks, type RelationshipHint } from "./remarks-parser.js";
export interface NormalizedImportFields {
  partNumber: string;
  description: string;
  model: string;
  variant: string;
  system: string;
  groupNo: string | null;
  figureName: string;
  effectiveFrom: string | null;
  effectiveTo: string | null;
  qty: number;
  pnc: string | null;
  listPrice: string | null;
  currency: "CAD";
  manufacturer: string | null;
  serviceable: boolean;
  remarks: string | null;
}
export interface NormalizedImportRow {
  sourceRowKey: string;
  rowNumber: number;
  fields: NormalizedImportFields;
}
export interface ImportRow extends RawImportRow {
  sourceRowKey: string;
  fields: NormalizedImportFields | null;
  normalizationState: "valid" | "invalid";
  identityKey: string;
  figureKey: string;
  contentHash: string;
  hints: RelationshipHint[];
}
export interface ImportProblem {
  sourceRowKey: string;
  code: string;
  field: string | null;
  severity: "warning" | "error";
  message: string;
}
export interface NormalizedImport {
  sourceChecksum: string;
  rows: ImportRow[];
  issues: ImportProblem[];
}
const hash = (value: unknown) =>
  createHash("sha256").update(JSON.stringify(value)).digest("hex");
const str = (value: RawCell) => (value === null ? "" : String(value).trim());
const nullable = (value: RawCell) => str(value) || null;
export function normalizeImport(parsed: ParsedImport): NormalizedImport {
  const issues: ImportProblem[] = [];
  const rows = parsed.rows.map((raw) => {
    const p = raw.sourcePayload,
      pending: Omit<ImportProblem, "sourceRowKey">[] = [];
    const invalid = (field: string, message: string) =>
      pending.push({
        code: "INVALID_FIELD",
        field,
        severity: "error",
        message,
      });
    const required = (field: string) => {
      const value = str(p[field]);
      if (!value) invalid(field, "A nonempty source value is required.");
      return value;
    };
    const date = (field: string) => {
      let value = nullable(p[field]);
      if (!value) return null;
      if (/^\d{4}-\d{2}-\d{2}T00:00:00$/.test(value))
        value = value.slice(0, 10);
      if (typeof p[field] === "number") {
        const d = SSF.parse_date_code(p[field]);
        if (
          d &&
          d.y >= 1900 &&
          d.y <= 9999 &&
          d.H === 0 &&
          d.M === 0 &&
          d.S === 0
        )
          value = `${d.y}-${String(d.m).padStart(2, "0")}-${String(d.d).padStart(2, "0")}`;
      }
      if (
        !/^\d{4}-\d{2}-\d{2}$/.test(value) ||
        !Number.isFinite(Date.parse(value)) ||
        new Date(value).toISOString().slice(0, 10) !== value
      ) {
        invalid(field, "A real ISO date or whole Excel date is required.");
        return null;
      }
      return value;
    };
    const price = nullable(p["UNIT PRICE (CAD)"]);
    let listPrice: string | null = null;
    if (price !== null) {
      if (!/^(?:0|[1-9]\d{0,11})(?:\.\d{1,2})?$/.test(price))
        invalid(
          "UNIT PRICE (CAD)",
          "A nonnegative fixed decimal with at most two fractional digits is required.",
        );
      else {
        const [integer, decimals = ""] = price.split(".");
        listPrice = `${integer}.${decimals.padEnd(2, "0")}`;
      }
    }
    const quantity = str(p.QTY),
      validQuantity =
        /^[1-9]\d{0,8}$/.test(quantity) && Number(quantity) <= 2147483647;
    if (!validQuantity)
      invalid("QTY", "A positive integer quantity is required.");
    const serviceability = str(p["S/NS"]);
    if (!["S", "NS"].includes(serviceability))
      invalid("S/NS", "Only explicit S or NS is accepted.");
    const fields: NormalizedImportFields = {
      partNumber: required("PART NO").toUpperCase(),
      description: required("DESCRIPTION"),
      model: required("MODEL"),
      variant: required("VARIANTS"),
      system: required("AGGREGATE / SYSTEM"),
      groupNo: nullable(p.GROUPNO),
      figureName: required("ASSEMBLY NAME - PAGE"),
      effectiveFrom: date("START DATE"),
      effectiveTo: date("END DATE"),
      qty: validQuantity ? Number(quantity) : 0,
      pnc: nullable(p.PNC),
      listPrice,
      currency: "CAD",
      manufacturer: nullable(p.MAKER),
      serviceable: serviceability === "S",
      remarks:
        p.REMARKS === null || p.REMARKS === "" ? null : String(p.REMARKS),
    };
    if (
      fields.effectiveFrom &&
      fields.effectiveTo &&
      fields.effectiveTo < fields.effectiveFrom
    )
      invalid("END DATE", "End date precedes start date.");
    const figureKey = hash([
      fields.system.toLowerCase(),
      fields.groupNo?.toLowerCase(),
      fields.figureName.toLowerCase(),
    ]);
    // No. and row position are raw provenance only. This key is usable only when unique in the lineage.
    const identityKey = hash([figureKey, fields.partNumber, fields.pnc]);
    const row: ImportRow = {
      ...raw,
      fields: pending.length ? null : fields,
      normalizationState: pending.length ? "invalid" : "valid",
      figureKey,
      identityKey,
      sourceRowKey: identityKey,
      contentHash: hash(
        pending.length
          ? Object.fromEntries(
              Object.entries(p).filter(([key]) => key !== "No."),
            )
          : fields,
      ),
      hints: parseRemarks(fields.remarks),
    };
    return { row, pending };
  });
  const counts = new Map<string, number>(),
    seen = new Map<string, number>();
  for (const { row } of rows)
    counts.set(row.identityKey, (counts.get(row.identityKey) ?? 0) + 1);
  for (const { row, pending } of rows) {
    if (counts.get(row.identityKey)! > 1) {
      const n = (seen.get(row.identityKey) ?? 0) + 1;
      seen.set(row.identityKey, n);
      row.sourceRowKey = `${row.identityKey}:observation:${n}`;
      pending.push({
        code: "AMBIGUOUS_SOURCE_KEY",
        field: null,
        severity: "error",
        message:
          "Repeated semantic source identities require source reconciliation; observations are retained separately.",
      });
    }
    issues.push(
      ...pending.map((problem) => ({
        ...problem,
        sourceRowKey: row.sourceRowKey,
      })),
    );
  }
  return {
    sourceChecksum: parsed.sourceChecksum,
    rows: rows.map((r) => r.row),
    issues,
  };
}
