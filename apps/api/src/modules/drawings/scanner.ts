import { createConnection } from "node:net";
import type { AppConfig } from "../../config.js";
import { MAX_DRAWING_BYTES, type DrawingScanner } from "./storage.js";

/** clamd TCP INSTREAM: NUL command, network-order chunk lengths, zero-length terminator, NUL response. */
export function createClamdScanner(config: AppConfig["drawingScanner"]): DrawingScanner {
  return boundedClamdScanner(config, MAX_DRAWING_BYTES);
}
/** Separate catalogue-source entry point; PNG callers retain their 20 MiB limit. */
export function createClamdImportScanner(config: AppConfig["drawingScanner"]): DrawingScanner {
  return boundedClamdScanner(config, 25 * 1024 * 1024);
}
function boundedClamdScanner(config: AppConfig["drawingScanner"], maximum: number): DrawingScanner {
  return { async scan(bytes) {
    if (!config || !bytes.length || bytes.length > maximum) return "unavailable";
    return new Promise(resolve => {
      const socket = createConnection({ host: config.host, port: config.port });
      let finished = false, response = Buffer.alloc(0);
      const finish = (value: "clean" | "infected" | "unavailable") => { if (finished) return; finished = true; clearTimeout(deadline); socket.destroy(); resolve(value); };
      const deadline = setTimeout(() => finish("unavailable"), config.timeoutMs);
      socket.on("error", () => finish("unavailable")); socket.on("end", () => { if (!finished) finish("unavailable"); });
      socket.on("data", chunk => {
        if (response.length + chunk.length > 1024) return finish("unavailable");
        response = Buffer.concat([response, chunk]);
        const end = response.indexOf(0); if (end < 0) return;
        if (end !== response.length - 1) return finish("unavailable");
        const result = response.subarray(0, end).toString("utf8");
        finish(result === "stream: OK" ? "clean" : /^stream: [^\r\n\0]+ FOUND$/.test(result) ? "infected" : "unavailable");
      });
      socket.on("connect", () => {
        void (async () => {
          socket.write("zINSTREAM\0");
          for (let offset = 0; offset < bytes.length && !finished; offset += 64 * 1024) {
            const chunk = bytes.subarray(offset, offset + 64 * 1024), length = Buffer.alloc(4); length.writeUInt32BE(chunk.length);
            socket.write(length);
            if (!socket.write(chunk)) await new Promise<void>(resolve => {
              const ready = () => { socket.off("drain", ready); socket.off("close", ready); resolve(); };
              socket.once("drain", ready); socket.once("close", ready);
            });
          }
          if (!finished) socket.write(Buffer.alloc(4));
        })().catch(() => finish("unavailable"));
      });
    });
  } };
}
