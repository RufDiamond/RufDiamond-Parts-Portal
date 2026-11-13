import Link from "next/link";
import Image from "next/image";
import { notFound } from "next/navigation";
import { getFatTruckPreviewFigure, getFatTruckPreviewSession } from "@/data/fat-truck-preview.server";
import { PreviewQuote } from "./PreviewQuote";

export default async function FatTruckPreviewFigurePage({ params }: { params: Promise<{ brand: string; figureId: string }> }) {
  const { brand, figureId } = await params;
  if (brand !== "fat-truck" || !await getFatTruckPreviewSession()) notFound();
  const detail = await getFatTruckPreviewFigure(figureId);
  return <main style={{ padding: 24, background: "#fff", color: "#202020" }}>
    <Link href="/parts/fat-truck">Fat Truck parts</Link>
    <h1>Fig. {detail.figure.groupNo} · {detail.figure.name}</h1>
    <p>FT3 Wagon catalogue preview. Verify part references before fulfillment.</p>
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 440px), 1fr))", alignItems: "start", gap: 24 }}>
      {detail.drawing && <Image unoptimized src={`/api/fat-truck-preview/${figureId}/drawing`}
        alt={detail.figure.name + " exploded drawing"} width={detail.drawing.width} height={detail.drawing.height}
        style={{ width: "100%", height: "auto" }} />}
      <PreviewQuote rows={detail.rows.map(({ figurePart, part, calloutNumbers }) => ({
        id: figurePart.id,
        references: calloutNumbers.join(", ") || "—",
        partId: null, partNumber: part.partNumber, description: part.description, qty: 1,
        model: "FT3 Wagon", system: detail.system.name, figure: detail.figure.groupNo,
        assemblyName: detail.figure.name,
      }))} />
    </div>
  </main>;
}
