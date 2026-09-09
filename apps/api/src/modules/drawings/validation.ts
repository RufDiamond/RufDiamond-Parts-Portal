import { createHash } from "node:crypto";
import sharp from "sharp";
import { AppError } from "../../plugins/error-handler.js";
import { MAX_DRAWING_BYTES, type DrawingScanner } from "./storage.js";

const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
function invalid(code = "INVALID_PNG"): never { throw new AppError(code, 422, "The uploaded file is not a valid supported PNG.", [{ path: "/file", code, message: "Choose an intact PNG with the declared size and SHA-256." }]); }
export function tooLarge(): never { throw new AppError("DRAWING_TOO_LARGE", 413, "PNG limit: 20 MiB, 40 million pixels, and 16,384 pixels per side."); }
const crcTable = Array.from({ length: 256 }, (_, n) => { for (let k = 0; k < 8; k++) n = n & 1 ? 0xedb88320 ^ (n >>> 1) : n >>> 1; return n >>> 0; });
function crc(bytes: Buffer) { let n = 0xffffffff; for (const byte of bytes) n = crcTable[(n ^ byte) & 255] ^ (n >>> 8); return (n ^ 0xffffffff) >>> 0; }

/** Check framing/CRC first. Decode only image chunks so compressed ancillary metadata cannot expand unchecked. */
function imageChunks(bytes: Buffer) {
  if (bytes.length < 45 || !bytes.subarray(0, 8).equals(signature)) invalid();
  const chunks: Buffer[] = [signature];
  let offset = 8, width = 0, height = 0, idat = false, ended = false, pastIdat = false;
  while (offset < bytes.length) {
    if (offset + 12 > bytes.length) invalid();
    const size = bytes.readUInt32BE(offset), end = offset + 12 + size;
    if (end > bytes.length) invalid();
    const kind = bytes.toString("ascii", offset + 4, offset + 8);
    if (!/^[A-Za-z]{4}$/.test(kind) || crc(bytes.subarray(offset + 4, end - 4)) !== bytes.readUInt32BE(end - 4)) invalid();
    if (offset === 8) {
      if (kind !== "IHDR" || size !== 13) invalid();
      width = bytes.readUInt32BE(offset + 8); height = bytes.readUInt32BE(offset + 12);
      if (!width || !height) invalid();
      if (width > 16384 || height > 16384 || width * height > 40_000_000) tooLarge();
    } else if (kind === "IHDR") invalid();
    if (kind === "acTL" || kind === "fcTL" || kind === "fdAT") invalid("ANIMATED_PNG_UNSUPPORTED");
    if (kind === "IDAT") { if (pastIdat) invalid(); idat = true; }
    else if (idat) pastIdat = true;
    if (kind === "IEND") { if (size !== 0 || !idat || end !== bytes.length) invalid(); ended = true; }
    if (["IHDR", "PLTE", "tRNS", "IDAT", "IEND"].includes(kind)) chunks.push(bytes.subarray(offset, end));
    else if (kind[0] === kind[0].toUpperCase()) invalid();
    offset = end;
  }
  if (!ended) invalid();
  return { width, height, image: Buffer.concat(chunks) };
}
export async function validatePng(stream: AsyncIterable<Uint8Array>, expected: { bytes: number; sha256: string; contentType?: string }, scanner: DrawingScanner) {
  const chunks: Buffer[] = []; let length = 0;
  if (expected.bytes > MAX_DRAWING_BYTES) tooLarge();
  if (expected.contentType && expected.contentType !== "image/png") invalid("INVALID_DRAWING_MEDIA_TYPE");
  for await (const chunk of stream) {
    length += chunk.byteLength;
    if (length > MAX_DRAWING_BYTES || length > expected.bytes) tooLarge();
    chunks.push(Buffer.from(chunk));
  }
  const bytes = Buffer.concat(chunks, length);
  if (length !== expected.bytes || createHash("sha256").update(bytes).digest("hex") !== expected.sha256) invalid("DRAWING_DIGEST_MISMATCH");
  const parsed = imageChunks(bytes);
  try {
    // Full decode is mandatory. Output is consumed in bounded chunks; no full raw pixel Buffer is retained.
    const decoder = sharp(parsed.image, { limitInputPixels: 40_000_000, failOn: "warning", sequentialRead: true }).raw({ depth: "uchar" }).timeout({ seconds: 15 });
    let decodedBytes = 0;
    for await (const chunk of decoder) { decodedBytes += chunk.length; if (decodedBytes > parsed.width * parsed.height * 4) { decoder.destroy(); invalid(); } }
    if (decodedBytes < parsed.width * parsed.height) invalid();
  } catch (error) { if (error instanceof AppError) throw error; invalid(); }
  let verdict: Awaited<ReturnType<DrawingScanner["scan"]>>;
  try { verdict = await scanner.scan(bytes); } catch { verdict = "unavailable"; }
  if (verdict === "infected") throw new AppError("DRAWING_INFECTED", 422, "The uploaded file failed the malware check.");
  if (verdict !== "clean") throw new AppError("DRAWING_SCANNER_UNAVAILABLE", 503, "The file scanner is unavailable. Try again later.");
  return { width: parsed.width, height: parsed.height, bytes: length, sha256: expected.sha256 };
}
