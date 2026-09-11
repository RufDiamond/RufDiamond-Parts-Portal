"use client";
import { useMemo, useState } from "react";
import type { DraftFigureMetadata, DrawingDelivery, MappingEditorDocument } from "@rufdiamond/contracts";
import { useCustomerSession } from "@/state/SessionBoundary";
import { createMappingApiClient, MappingApiError } from "./api-client";
import { createDrawingApiClient } from "./drawing-api-client";
import { MappingEditor } from "./MappingEditor";
import { FirstDrawingUpload } from "./FirstDrawingUpload";

export function privateContentDrawing(delivery: DrawingDelivery, figureId: string): DrawingDelivery {
  if (delivery.figureId !== figureId) throw new MappingApiError(502, "Drawing identity mismatch.");
  return { ...delivery, url: `/api/v1/admin/figures/${figureId}/drawing/content?drawingFileId=${delivery.drawingFileId}&figureVersion=${delivery.figureVersion}` };
}
export function MappingEntry({ figure, initial, drawing }: { figure: DraftFigureMetadata; initial: MappingEditorDocument | null; drawing: DrawingDelivery | null }) {
  const session = useCustomerSession();
  const [loaded, setLoaded] = useState(initial && drawing ? { initial, drawing: privateContentDrawing(drawing, figure.id) } : null);
  const clients = useMemo(() => {
    if (!session) return null;
    const api = createMappingApiClient({ csrfToken: session.csrfToken });
    const original = createDrawingApiClient({ csrfToken: session.csrfToken });
    const drawingApi = { ...original, loadDrawing: async (id: string, signal?: AbortSignal) => privateContentDrawing(await original.loadDrawing(id, signal), id) };
    return { api, drawingApi };
  }, [session]);
  if (!session || !clients) return <p>Authenticated draft access is required.</p>;
  const has = (key: string) => session.capabilities.includes(key);
  const authority = { canEdit: has("catalog.callout.manage"), canMap: has("catalog.callout.map"), canApprove: has("publish.execute"), canUploadDrawing: has("catalog.drawing.upload") && has("catalog.figure.edit") };
  if (loaded) return <MappingEditor initial={loaded.initial} drawing={loaded.drawing} authority={authority} api={clients.api} drawingApi={clients.drawingApi} />;
  if (figure.hasDrawing) return <p>Current mapping or drawing unavailable. <a href={`/admin/figures/${figure.id}/mapping`}>Reload figure</a></p>;
  return <FirstDrawingUpload figure={figure} canUpload={authority.canUploadDrawing} api={clients.drawingApi} onAttached={async () => {
    const envelope = await clients.api.loadMapping(figure.id);
    const delivered = await clients.drawingApi.loadDrawing(figure.id);
    if (envelope.source.figure.version !== delivered.figureVersion || envelope.source.drawing?.id !== delivered.drawingFileId) throw new MappingApiError(409, "Source changed during loading.");
    setLoaded({ initial: envelope, drawing: delivered });
  }} />;
}
