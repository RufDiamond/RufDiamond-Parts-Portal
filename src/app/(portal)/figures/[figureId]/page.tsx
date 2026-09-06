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

  // The sheet pager walks the figures of this system, in catalogue order.
  const siblings = await getFigures(detail.figure.variantId, detail.system.id);
  const index = siblings.findIndex((figure) => figure.id === figureId);
  const total = siblings.length;

  return (
    <FigureWorkspace
      detail={detail}
      sheet={index === -1 ? "—" : `${pad(index + 1)} / ${pad(total)}`}
      index={index === -1 ? 0 : index}
      total={total || 1}
      previousId={index > 0 ? siblings[index - 1].id : null}
      nextId={index !== -1 && index < total - 1 ? siblings[index + 1].id : null}
      firstId={siblings[0]?.id ?? null}
      lastId={siblings[total - 1]?.id ?? null}
    />
  );
}
