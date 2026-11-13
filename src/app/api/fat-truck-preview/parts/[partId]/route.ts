import { getFatTruckPreviewPart, getFatTruckPreviewSession } from "@/data/fat-truck-preview.server";

export async function GET(_: Request, { params }: { params: Promise<{ partId: string }> }) {
  const session = await getFatTruckPreviewSession();
  if (!session) return new Response(null, { status: 404 });
  const { partId } = await params;
  const part = getFatTruckPreviewPart(partId, session.scopes.canViewPrices);
  return part ? Response.json(part, { headers: { "Cache-Control": "private, no-store" } }) : new Response(null, { status: 404 });
}
