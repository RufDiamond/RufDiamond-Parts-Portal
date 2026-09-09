import { createHash } from "node:crypto";
import { AppError } from "../../plugins/error-handler.js";
import { MAX_DRAWING_BYTES, type DrawingStorage } from "./storage.js";

/** Buffer before returning: authorization is rechecked by the caller after external I/O. */
export async function readDrawingContent(storage: DrawingStorage, source: { objectKey: string; objectVersionId: string; sha256: string; bytes: number }) {
  try {
    if (source.bytes < 1 || source.bytes > MAX_DRAWING_BYTES) throw new Error("invalid size");
    const chunks: Buffer[] = []; let size = 0;
    for await (const chunk of storage.read(source.objectKey, source.objectVersionId)) {
      size += chunk.byteLength;
      if (size > source.bytes || size > MAX_DRAWING_BYTES) throw new Error("invalid size");
      chunks.push(Buffer.from(chunk));
    }
    const bytes = Buffer.concat(chunks);
    if (size !== source.bytes || createHash("sha256").update(bytes).digest("hex") !== source.sha256) throw new Error("invalid bytes");
    return bytes;
  } catch { throw new AppError("DRAWING_UNAVAILABLE", 503, "Drawing delivery is temporarily unavailable."); }
}
