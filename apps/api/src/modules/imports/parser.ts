import { createHash } from "node:crypto";
import * as XLSX from "xlsx";
import { fromBuffer, type Entry } from "yauzl";

export const MAX_IMPORT_BYTES = 25 * 1024 * 1024;
export const MAX_EXPANDED_BYTES = 100 * 1024 * 1024;
export const SOURCE_COLUMNS = [
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
] as const;
export type RawCell = string | number | boolean | null;
export type RawImportRow = {
  rowNumber: number;
  sourcePayload: Record<string, RawCell>;
};
export type ParsedImport = { sourceChecksum: string; rows: RawImportRow[]; date1904: boolean };
const MAX_ROWS = 100_000;
const decoder = new TextDecoder("utf-8", { fatal: true });
function utf8(bytes: Uint8Array) {
  try {
    return decoder.decode(bytes);
  } catch {
    throw new Error("Source must be valid UTF-8");
  }
}

/** Inspect every archive entry with bounded inflation before handing OOXML to SheetJS. */
async function inspectXlsx(bytes: Buffer, maximum: number) {
  if (!bytes.subarray(0, 4).equals(Buffer.from([0x50, 0x4b, 0x03, 0x04])))
    throw new Error("Invalid XLSX signature");
  await new Promise<void>((resolve, reject) =>
    fromBuffer(
      bytes,
      { lazyEntries: true, validateEntrySizes: true },
      (error, zip) => {
        if (error || !zip)
          return reject(error ?? new Error("Invalid XLSX archive"));
        let expanded = 0,
          entries = 0;
        const names = new Set<string>();
        const fail = (e: unknown) => {
          zip.close();
          reject(e);
        };
        zip.on("error", fail);
        zip.on("end", () => {
          if (
            !names.has("[Content_Types].xml") ||
            !names.has("xl/workbook.xml")
          )
            reject(new Error("Invalid XLSX signature"));
          else resolve();
        });
        zip.on("entry", (entry: Entry) => {
          if (
            ++entries > 2000 ||
            names.has(entry.fileName) ||
            /(?:^|\/)\.\.(?:\/|$)|\\/.test(entry.fileName) ||
            entry.generalPurposeBitFlag & 1
          )
            return fail(new Error("Unsupported XLSX archive"));
          names.add(entry.fileName);
          if (
            /vba|macrosheet|activex|embeddings|externalLinks|\.bin$/i.test(
              entry.fileName,
            )
          )
            return fail(
              new Error("Macros or external content are not permitted"),
            );
          if (expanded + entry.uncompressedSize > maximum)
            return fail(new Error("XLSX expanded size exceeds limit"));
          zip.openReadStream(entry, (error, stream) => {
            if (error || !stream)
              return fail(error ?? new Error("Invalid archive entry"));
            const chunks: Buffer[] = [];
            stream.on("error", fail);
            stream.on("data", (chunk: Buffer) => {
              expanded += chunk.length;
              if (expanded > maximum) {
                stream.destroy();
                fail(new Error("XLSX expanded size exceeds limit"));
              } else if (/\.xml$|\.rels$/i.test(entry.fileName))
                chunks.push(chunk);
            });
            stream.on("end", () => {
              try {
                const xml = utf8(Buffer.concat(chunks));
                if (/<Override\b[^>]*(?:macroEnabled|vbaProject)/i.test(xml))
                  throw new Error("Macros are not permitted");
                if (
                  /<!DOCTYPE|<!ENTITY|TargetMode\s*=\s*["']External/i.test(xml)
                )
                  throw new Error("External XML content is not permitted");
                if (/<(?:\w+:)?f(?:\s|\/?>)/i.test(xml))
                  throw new Error("Formula cells are not permitted");
                zip.readEntry();
              } catch (e) {
                fail(e);
              }
            });
          });
        });
        zip.readEntry();
      },
    ),
  );
}

function csvRows(text: string): string[][] {
  if (text.includes("\0")) throw new Error("Invalid CSV signature");
  const rows: string[][] = [];
  let row: string[] = [],
    value = "",
    quoted = false,
    closed = false;
  const cell = () => {
    row.push(value);
    value = "";
    closed = false;
    if (row.length > 16)
      throw new Error("Expected exactly sixteen source columns");
  };
  const finish = () => {
    cell();
    // Retain empty records until row coordinates are assigned below.
    rows.push(row);
    row = [];
    if (rows.length > MAX_ROWS + 1)
      throw new Error("Source row limit exceeded");
  };
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          value += '"';
          i++;
        } else {
          quoted = false;
          closed = true;
        }
      } else value += c;
    } else if (c === ",") cell();
    else if (c === "\r" || c === "\n") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      finish();
    } else if (c === '"' && !value && !closed) quoted = true;
    else {
      if (closed || c === '"') throw new Error("Malformed CSV quoting");
      value += c;
    }
    if (value.length > 32767) throw new Error("Source cell limit exceeded");
  }
  if (quoted) throw new Error("Unclosed CSV quote");
  if (value || row.length || closed) finish();
  return rows;
}

export async function parseImport(
  bytes: Buffer,
  format: "csv" | "xlsx",
  limits?: { maxExpandedBytes?: number },
): Promise<ParsedImport> {
  if (!bytes.length || bytes.length > MAX_IMPORT_BYTES)
    throw new Error("Source byte limit exceeded");
  let matrix: RawCell[][];
  let date1904 = false;
  if (format === "csv") matrix = csvRows(utf8(bytes).replace(/^\uFEFF/, ""));
  else {
    await inspectXlsx(
      bytes,
      Math.min(
        MAX_EXPANDED_BYTES,
        limits?.maxExpandedBytes ?? MAX_EXPANDED_BYTES,
      ),
    );
    const book = XLSX.read(bytes, {
      type: "buffer",
      cellFormula: true,
      cellDates: false,
      cellHTML: false,
      cellText: false,
      bookVBA: true,
    });
    date1904 = book.Workbook?.WBProps?.date1904 === true;
    if (book.vbaraw) throw new Error("Macros are not permitted");
    if (book.SheetNames.length !== 1)
      throw new Error("Exactly one source worksheet is required");
    const sheet = book.Sheets[book.SheetNames[0]],
      range = XLSX.utils.decode_range(sheet["!ref"] ?? "A1");
    if (
      range.e.r > MAX_ROWS ||
      range.e.c !== 15 ||
      range.s.r !== 0 ||
      range.s.c !== 0
    )
      throw new Error("Source columns or row limit invalid");
    for (const [key, cell] of Object.entries(sheet))
      if (!key.startsWith("!")) {
        if (cell.f || cell.F)
          throw new Error("Formula cells are not permitted");
        if (cell.t === "e" || cell.t === "d" || cell.l)
          throw new Error("Unsupported source cell");
        if (typeof cell.v === "string" && cell.v.length > 32767)
          throw new Error("Source cell limit exceeded");
      }
    matrix = XLSX.utils.sheet_to_json<RawCell[]>(sheet, {
      header: 1,
      raw: true,
      defval: null,
      blankrows: true,
    });
  }
  const header = matrix.shift();
  if (
    !header ||
    header.length !== 16 ||
    header.some((value, index) => value !== SOURCE_COLUMNS[index])
  )
    throw new Error("Expected exactly sixteen ordered source columns");
  const rows = matrix.flatMap((values, i) => {
    if (values.every((value) => value === "" || value === null)) return [];
    if (values.length !== 16)
      throw new Error("Expected exactly sixteen source columns");
    if (
      values.some(
        (value) => typeof value === "string" && /^[\s]*[=+@]/.test(value),
      )
    )
      throw new Error("Formula-like source cells are not permitted");
    return [
      {
        rowNumber: i + 2,
        sourcePayload: Object.fromEntries(
          SOURCE_COLUMNS.map((column, i) => [column, values[i]]),
        ),
      },
    ];
  });
  if (!rows.length) throw new Error("Source contains no rows");
  return {
    sourceChecksum: createHash("sha256").update(bytes).digest("hex"),
    rows,
    date1904,
  };
}
