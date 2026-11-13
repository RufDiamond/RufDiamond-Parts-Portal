import { notFound, redirect } from "next/navigation";
import { getFatTruckPreviewSession } from "@/data/fat-truck-preview.server";

export default async function FatTruckPreviewFigurePage({ params }: { params: Promise<{ brand: string; figureId: string }> }) {
  const { brand, figureId } = await params;
  if (brand !== "fat-truck" || !await getFatTruckPreviewSession()) notFound();
  redirect(`/figures/${encodeURIComponent(figureId)}`);
}
