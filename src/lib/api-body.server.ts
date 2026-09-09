import "server-only";
import { CatalogApiError } from "./api-error";

/** Bound bytes and elapsed read time, including streams without Content-Length. */
export async function readBoundedBytes(stream: ReadableStream<Uint8Array> | null, max: number, signal = AbortSignal.timeout(60_000)): Promise<Uint8Array> {
  if (signal.aborted) throw new CatalogApiError(408, "API_BODY_TIMEOUT");
  const reader = stream?.getReader();
  if (!reader) return new Uint8Array();
  const chunks: Uint8Array[] = [];
  let length = 0;
  let abort!: () => void;
  const aborted = new Promise<never>((_resolve, reject) => {
    abort = () => reject(new CatalogApiError(408, "API_BODY_TIMEOUT"));
    signal.addEventListener("abort", abort, { once: true });
  });
  try {
    for (;;) {
      const { done, value } = await Promise.race([reader.read(), aborted]);
      if (done) break;
      length += value.length;
      if (length > max) throw new CatalogApiError(413, "API_BODY_TOO_LARGE");
      chunks.push(value);
    }
  } catch (error) {
    void reader.cancel().catch(() => {});
    throw error;
  } finally {
    signal.removeEventListener("abort", abort);
    reader.releaseLock();
  }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  return bytes;
}
