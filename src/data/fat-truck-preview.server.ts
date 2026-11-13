import "server-only";

import { notFound } from "next/navigation";
import * as fixture from "@/data/fixture-repository.server";
import { drawingFiles, figures, parts } from "@/data/ft3-wagon";
import { fatTruckPreviewVariant } from "@/lib/fat-truck-preview";
import type { Part } from "@/types/catalog";
import type { CustomerRepository } from "./customer-composition.server";
import { requireCustomerSession } from "@/lib/customer-session.server";

const meetingCompanies = new Set([
  "3a98c733-c616-4df3-bbaf-ea6e456f62eb",
  "8a0b574e-b4b4-428b-861a-2b1e51581a7b",
  "98a0777e-1a93-416f-a6ca-156add45b100",
]);

export async function getFatTruckPreviewSession() {
  const session = await requireCustomerSession();
  return session && meetingCompanies.has(session.companyId)
    && session.capabilities.includes("catalog.figure.view")
    && session.capabilities.includes("parts.record.view") ? session : null;
}


export function getFatTruckPreviewDrawing(id: string) {
  const figure = figures.find(candidate => candidate.id === id && candidate.variantId === fatTruckPreviewVariant);
  return drawingFiles.find(drawing => drawing.id === figure?.drawingFileId);
}

function visiblePart(part: Part, canViewPrices: boolean): Part {
  if (!canViewPrices) return { ...part, listPrice: undefined };
  return typeof part.listPrice === "number" ? { ...part, listPrice: part.listPrice.toFixed(2) } : part;
}

export function getFatTruckPreviewPart(id: string, canViewPrices: boolean) {
  const part = parts.find(candidate => candidate.id === id);
  return part ? visiblePart(part, canViewPrices) : null;
}

export async function getFatTruckPreviewFigure(id: string, canViewPrices: boolean) {
  const detail = await fixture.getFigureDetail(id);
  if (!detail || detail.figure.variantId !== fatTruckPreviewVariant) notFound();
  return {
    ...detail,
    drawing: detail.drawing && { ...detail.drawing, storagePath: `/api/fat-truck-preview/${id}/drawing` },
    rows: detail.rows.map(row => ({ ...row, part: visiblePart(row.part, canViewPrices) })),
  };
}

export async function getFatTruckPreviewRepository(): Promise<CustomerRepository | null> {
  const session = await getFatTruckPreviewSession();
  if (!session) return null;
  const canViewPrices = session.scopes.canViewPrices;
  return {
    ...fixture,
    getFigureDetail: id => getFatTruckPreviewFigure(id, canViewPrices),
    searchParts: async query => (await fixture.searchParts(query)).map(part => visiblePart(part, canViewPrices)),
    searchPartUsages: async (query, mode) => (await fixture.searchPartUsages(query, mode))
      .map(row => ({ ...row, part: visiblePart(row.part, canViewPrices) })),
  };
}
