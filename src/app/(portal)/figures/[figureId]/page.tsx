import { notFound } from "next/navigation";
import { loadCalloutPreview } from "@/data/callout-preview.server";
import {
  composeCustomerRead,
  isApiMode,
} from "@/data/repository";
import { FigureWorkspace } from "./FigureWorkspace";
import { readFigureWorkspace } from "@/data/customer-figure.server";

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
  const workspace = await composeCustomerRead(repo => readFigureWorkspace(repo, figureId));
  if (!workspace) notFound();
  const { detail, siblings, usage } = workspace;
  const preview = isApiMode() ? { detail, notice: null } : await loadCalloutPreview(detail);
  const index = siblings.findIndex((figure) => figure.id === figureId);
  const total = siblings.length;

  return (
    <FigureWorkspace
      detail={preview.detail}
      previewNotice={preview.notice}
      usage={usage}
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
