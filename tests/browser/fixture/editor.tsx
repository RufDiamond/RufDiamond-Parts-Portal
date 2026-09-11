import type { MappingEditorDocument } from "@rufdiamond/contracts";
import { MappingEditor } from "@/features/diagram-mapping/MappingEditor";
import type { MappingApiClient } from "@/features/diagram-mapping/api-client";

const initial: MappingEditorDocument = { version: 1, revision: null, sourceConflict: false,
  document: { schemaVersion: 1, figureId: "synthetic", drawingFileId: "synthetic-png", drawingSha256: "a".repeat(64), catalogueBindingSha256: "b".repeat(64), imageWidth: 640, imageHeight: 480, occurrences: [{ calloutId: "synthetic-one", figurePartId: "synthetic-row", refNo: "7", labelRegion: null, regions: [], evidence: "" }] },
  source: { figure: { id: "synthetic", name: "synthetic editor test — not catalogue content", version: 1, variantId: "synthetic", modelId: "synthetic" }, drawing: { id: "synthetic-png", filename: "synthetic.png", sha256: "a".repeat(64), width: 640, height: 480, fileVersion: 1, mediaType: "image/png", validationStatus: "valid" }, catalogueBindingSha256: "b".repeat(64), rows: [{ id: "synthetic-row", partId: "synthetic-part", partNumber: "TEST", description: "Synthetic shape", qty: 1, refLabels: ["7"], version: 1 }], occurrences: [{ id: "synthetic-one", figurePartId: "synthetic-row", refNo: "7", version: 1 }] },
};
const unavailable = async (): Promise<never> => { throw new Error("Synthetic fixture has no persistence or authenticated backend."); };
const api: MappingApiClient = { loadMapping: unavailable, saveMapping: unavailable, approveMapping: unavailable, listRevisions: unavailable, loadRevision: unavailable };
export function EditorFixture() {
  const params = new URLSearchParams(location.search);
  const mismatch = params.has("mismatch");
  const width = params.has("portrait") ? 400 : 640;
  const height = params.has("portrait") ? 1000 : 480;
  const envelope = { ...initial, document: { ...initial.document, imageWidth: width, imageHeight: height }, source: { ...initial.source, drawing: { ...initial.source.drawing!, width, height } } };
  return <MappingEditor initial={envelope} authority={{ canEdit: true, canMap: true, canApprove: false }} api={api} drawing={{ figureId: "synthetic", drawingFileId: "synthetic-png", sha256: (mismatch ? "d" : "a").repeat(64), width, height, url: "/synthetic-editor.png" }} />;
}
