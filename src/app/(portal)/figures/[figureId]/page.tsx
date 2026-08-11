import { notFound } from "next/navigation";
import { getFigureDetail, getFigures } from "@/data/repository";
import { FigureWorkspace } from "./FigureWorkspace";

const pad = (n: number) => String(n).padStart(2, "0");

/**
 * A figure is addressed by id and does not depend on the selected machine, so
 * unlike the systems screens this one can be fetched on the server.
 */
export default async function FigurePage({
  params,
}: {
  params: Promise<{ figureId: string }>;
}) {
  const { figureId } = await params;
  const detail = await getFigureDetail(figureId);
  if (!detail) notFound();

  // Sheet number as printed: position within the system's figures.
  const siblings = await getFigures(detail.figure.variantId, detail.system.id);
  const index = siblings.findIndex((figure) => figure.id === figureId);
  const sheet =
    index === -1 ? "—" : `${pad(index + 1)} / ${pad(siblings.length)}`;

  return <FigureWorkspace detail={detail} sheet={sheet} />;
}
