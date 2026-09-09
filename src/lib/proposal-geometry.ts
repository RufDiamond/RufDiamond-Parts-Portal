import { percentagePoint, validateMappingGeometry } from "@rufdiamond/contracts/diagram-geometry";
import type { ComponentRegion, ImagePoint } from "@rufdiamond/contracts";

export interface ProposalGeometry {
  calloutId: string;
  polygons: ImagePoint[][];
  /** One holes array for each polygon, with exact index ownership. */
  holes?: ImagePoint[][][];
}

/** Source percentages become original-image coordinates; no identity or approval inference. */
export function proposalRegions(proposal: ProposalGeometry, width: number, height: number): ComponentRegion[] {
  return proposal.polygons.map((outer, index) => ({
    id: `${proposal.calloutId}-region-${index}`,
    outer: outer.map((p) => percentagePoint(p, width, height)),
    holes: (proposal.holes?.[index] ?? []).map((ring) => ring.map((p) => percentagePoint(p, width, height))),
  }));
}

/** Lossless conversion only of an explicitly closed outer, bridge, closed inner ring.
 * The caller supplies the audited closure index. No crossing repair or simplification.
 */
export function splitRetracedBridge(points: ImagePoint[], outerClosure: number): Pick<ComponentRegion, "outer" | "holes"> | null {
  const same = (a: ImagePoint, b: ImagePoint) => a[0] === b[0] && a[1] === b[1];
  if (!Number.isInteger(outerClosure) || outerClosure < 3 || points.length < outerClosure + 5 ||
    !same(points[0], points[outerClosure]) || !same(points[outerClosure + 1], points[points.length - 1])) return null;
  const outer = points.slice(0, outerClosure), hole = points.slice(outerClosure + 1, -1);
  const region = { id: "audited-bridge", outer, holes: [hole] };
  const issues = validateMappingGeometry({ schemaVersion: 1, figureId: "topology-only", drawingFileId: "topology-only",
    drawingSha256: "a".repeat(64), catalogueBindingSha256: "b".repeat(64), imageWidth: 100, imageHeight: 100,
    occurrences: [{ calloutId: "topology-only", figurePartId: "topology-only", refNo: "1", labelRegion: null, regions: [region], evidence: "Topology-only equivalence; no source approval" }],
  });
  return issues.length ? null : { outer: structuredClone(outer), holes: [structuredClone(hole)] };
}
