import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { loadCalloutPreview } from "@/data/callout-preview.server";
import { getFigureDetail, getFigures } from "@/data/repository";
import { FigureWorkspace } from "../../../figures/[figureId]/FigureWorkspace";

export const metadata: Metadata = {
  title: "Marker review — not for ordering | RufDiamond",
  robots: { index: false, follow: false },
};

/**
 * Public review of the already-public demo assets, not authenticated backend
 * draft access or customer publication. No cart/export operations are enabled.
 */
export default async function MarkerReviewPage({
  params,
}: {
  params: Promise<{ figureId: string }>;
}) {
  const { figureId } = await params;
  const detail = await getFigureDetail(figureId);
  if (!detail) notFound();
  const preview = await loadCalloutPreview(detail, "hosted-review");
  const siblings = await getFigures(detail.figure.variantId, detail.system.id);
  const index = siblings.findIndex((figure) => figure.id === figureId);
  const pad = (n: number) => String(n).padStart(2, "0");

  return (
    <FigureWorkspace
      key={`review:${figureId}`}
      reviewOnly
      detail={preview.detail}
      previewNotice={preview.notice}
      usage={{}}
      sheet={index === -1 ? "—" : `${pad(index + 1)} / ${pad(siblings.length)}`}
      index={Math.max(0, index)}
      total={siblings.length || 1}
      previousId={index > 0 ? siblings[index - 1].id : null}
      nextId={index >= 0 ? siblings[index + 1]?.id ?? null : null}
      firstId={siblings[0]?.id ?? null}
      lastId={siblings.at(-1)?.id ?? null}
    />
  );
}
