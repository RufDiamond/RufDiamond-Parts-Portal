import { DraftFigureMetadataSchema, DrawingDeliverySchema, MappingEditorDocumentSchema } from "@rufdiamond/contracts";
import { getBackendApiRead } from "@/lib/backend-api.server";
import { readApiContract } from "@/data/api-response.server";
import { MappingEntry } from "@/features/diagram-mapping/MappingEntry";

export default async function MappingPage({ params }: { params: Promise<{ figureId: string }> }) {
  const { figureId } = await params;
  let loaded;
  try {
    const read = await getBackendApiRead();
    const path = `admin/figures/${figureId}`;
    const figure = await readApiContract(read, path, DraftFigureMetadataSchema);
    const initial = figure.hasDrawing ? await readApiContract(read, `${path}/diagram-mapping`, MappingEditorDocumentSchema) : null;
    const drawing = figure.hasDrawing ? await readApiContract(read, `${path}/drawing`, DrawingDeliverySchema) : null;
    loaded = { figure, initial, drawing };
  } catch { return <main><h1>Figure unavailable</h1><p>Access, drawing or current source could not be verified.</p><a href="/admin">Return to draft figures</a></main>; }
  return <MappingEntry key={loaded.figure.id} {...loaded} />;
}
