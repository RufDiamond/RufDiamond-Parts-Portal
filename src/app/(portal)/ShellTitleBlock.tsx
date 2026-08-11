"use client";

import { usePathname } from "next/navigation";
import { useCallback } from "react";
import { TitleBlock } from "@/components";
import { getFigureDetail, getFigures } from "@/data/repository";
import { formatFigureRef } from "@/lib/format";
import { useMachine } from "@/state/MachineContext";
import { useAsync } from "@/state/useAsync";

const DASH = "—";

/** Sheet number as printed: this figure's position within its system. */
async function loadSheet(figureId: string) {
  const detail = await getFigureDetail(figureId);
  if (!detail) return null;

  const siblings = await getFigures(detail.figure.variantId, detail.system.id);
  const index = siblings.findIndex((figure) => figure.id === figureId);
  const pad = (n: number) => String(n).padStart(2, "0");

  return {
    section: detail.system.name,
    figure: formatFigureRef(detail.figure.groupNo),
    sheet:
      index === -1
        ? DASH
        : `${pad(index + 1)} / ${pad(siblings.length)}`,
  };
}

/**
 * The pinned title block carried at the foot of every screen after sign-in.
 * It reads the route rather than being passed down, so no screen has to
 * remember to render it.
 */
export function ShellTitleBlock() {
  const pathname = usePathname();
  const { selectedModel, selectedVariant } = useMachine();

  const figureId = pathname.startsWith("/figures/")
    ? pathname.split("/")[2]
    : null;

  const run = useCallback(
    () => (figureId ? loadSheet(figureId) : Promise.resolve(null)),
    [figureId],
  );
  const { data } = useAsync(run);

  return (
    <TitleBlock
      pinned
      dense
      fields={[
        { label: "Machine", value: selectedModel?.name ?? DASH },
        { label: "Serial range", value: selectedVariant?.label ?? DASH },
        { label: "Section", value: data?.section ?? DASH },
        { label: "Figure", value: data?.figure ?? DASH },
        { label: "Sheet", value: data?.sheet ?? DASH },
      ]}
    />
  );
}
