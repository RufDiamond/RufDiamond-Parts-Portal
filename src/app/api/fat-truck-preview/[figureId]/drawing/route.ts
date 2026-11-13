import { getFatTruckPreviewSession, readFatTruckPreviewDrawing } from "@/data/fat-truck-preview.server";

export async function GET(_: Request, { params }: { params: Promise<{ figureId: string }> }) {
  if (!await getFatTruckPreviewSession()) return new Response(null, { status: 404 });
  const { figureId } = await params;
  const file = await readFatTruckPreviewDrawing(figureId);
  if (!file) return new Response(null, { status: 404 });
  return new Response(new Uint8Array(file), {
    headers: { "Content-Type": "image/png", "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" },
  });
}
