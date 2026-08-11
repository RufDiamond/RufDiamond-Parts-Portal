import { notFound } from "next/navigation";
import { getAllParts, getFigureDetail, getFigures } from "@/data/repository";
import { HotspotEditor } from "./HotspotEditor";

const pad = (n: number) => String(n).padStart(2, "0");

export default async function AdminFigurePage({
  params,
}: {
  params: Promise<{ figureId: string }>;
}) {
  const { figureId } = await params;

  const detail = await getFigureDetail(figureId);
  if (!detail) notFound();

  const [parts, siblings] = await Promise.all([
    getAllParts(),
    getFigures(detail.figure.variantId, detail.system.id),
  ]);

  const index = siblings.findIndex((figure) => figure.id === figureId);
  const sheet =
    index === -1 ? "—" : `${pad(index + 1)} / ${pad(siblings.length)}`;

  return <HotspotEditor detail={detail} parts={parts} sheet={sheet} />;
}
