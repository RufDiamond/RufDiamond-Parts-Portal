import "server-only";

import { notFound } from "next/navigation";
import * as fixture from "@/data/fixture-repository.server";
import { parts } from "@/data/ft3-wagon";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { loadSourceCheckedCallouts } from "./callout-preview.server";
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

const packagedAssets = path.join(process.cwd(), "private-fat-truck");
const assetRoot = existsSync(packagedAssets) ? packagedAssets : process.cwd();

async function readMappedFigure(id: string) {
  const detail = await fixture.getFigureDetail(id);
  if (!detail || detail.figure.variantId !== fatTruckPreviewVariant) return null;
  return loadSourceCheckedCallouts(detail, assetRoot);
}

export async function readFatTruckPreviewDrawing(id: string) {
  const mapped = await readMappedFigure(id);
  const drawingPath = mapped?.detail.drawing?.storagePath;
  if (!drawingPath || !/^\/drawings\/ft3w\/(?:review-source-[0-9]+\/)?[\w-]+\.png$/.test(drawingPath)) return null;
  return readFile(path.join(assetRoot, "public", drawingPath));
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
  const mapped = await readMappedFigure(id);
  if (!mapped) notFound();
  const { detail, notice } = mapped;
  const drawingUrl = `/api/fat-truck-preview/${id}/drawing`;
  return {
    ...detail,
    mappingNotice: notice,
    drawing: detail.drawing && { ...detail.drawing, storagePath: drawingUrl },
    callouts: detail.callouts.map(callout => {
      const geometry = callout.componentGeometry;
      return geometry && geometry.drawingPath === detail.drawing?.storagePath
        ? { ...callout, componentGeometry: { ...geometry, drawingPath: drawingUrl } }
        : callout;
    }),
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
