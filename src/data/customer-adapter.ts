import type { FigureDetail as ReleasedDetail } from "@rufdiamond/contracts";
import type { FigureDetail } from "@/types/catalog";

/** Presentation projection only. Keep all release and approval provenance domains. */
export function adaptFigureDetail(value: ReleasedDetail): FigureDetail {
  const drawing = { ...value.drawing, storagePath: value.drawing.contentUrl, uploadedAt: "" };
  return {
    ...value,
    figure: { ...value.figure, groupNo: value.figure.groupNo ?? "" },
    drawing,
    rows: value.rows.map(row => ({ ...row, part: { ...row.part, contributingReleases: [value.release] } })),
    callouts: value.callouts.map(callout => {
      const occurrence = value.mapping?.document.occurrences.find(item => item.calloutId === callout.id);
      return { ...callout, ...(occurrence ? { componentGeometry: {
        drawingPath: drawing.storagePath, drawingSha256: value.mapping!.document.drawingSha256,
        imageWidth: drawing.width, imageHeight: drawing.height, regions: occurrence.regions,
      } } : {}) };
    }),
  };
}
