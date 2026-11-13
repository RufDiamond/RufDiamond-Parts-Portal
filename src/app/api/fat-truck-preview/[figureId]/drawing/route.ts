import { readFile } from "node:fs/promises";
import path from "node:path";
import { getFatTruckPreviewFigure, getFatTruckPreviewSession } from "@/data/fat-truck-preview.server";

export async function GET(_: Request, { params }: { params: Promise<{ figureId: string }> }) {
  if (!await getFatTruckPreviewSession()) return new Response(null, { status: 404 });
  const { figureId } = await params;
  const { drawing } = await getFatTruckPreviewFigure(figureId);
  if (!drawing || !/^\/drawings\/ft3w\/[\w-]+\.png$/.test(drawing.storagePath)) {
    return new Response(null, { status: 404 });
  }
  const filename = path.basename(drawing.storagePath);
  const file = await readFile(path.join(process.cwd(), "private-fat-truck", filename)).catch(error => {
    if (error.code !== "ENOENT") throw error;
    return readFile(path.join(process.cwd(), "public", "drawings", "ft3w", filename));
  });
  return new Response(new Uint8Array(file), {
    headers: { "Content-Type": "image/png", "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" },
  });
}
