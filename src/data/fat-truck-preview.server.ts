import "server-only";

import { ft3CatalogueCompanyIds, OrderingCataloguePageSchema, type OrderingCataloguePart } from "@rufdiamond/contracts";
import { Value } from "@sinclair/typebox/value";
import { getBackendApiRead } from "@/lib/backend-api.server";
import { CatalogApiError } from "@/lib/api-error";
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

const meetingCompanies = new Set<string>(ft3CatalogueCompanyIds);

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

async function currentOrderingParts() {
  const read = await getBackendApiRead();
  const response = await read("commerce-catalogue/ft3-wagon");
  const data: unknown = await response.json();
  if (!response.ok || !Value.Check(OrderingCataloguePageSchema, data)) throw new CatalogApiError(503, "CATALOGUE_UNAVAILABLE", "Current catalogue pricing is unavailable. Please retry.");
  return new Map(data.items.map(part => [part.sourceKey, part]));
}

function visiblePart(part: Part, canViewPrices: boolean, current: Map<string, OrderingCataloguePart>): Part {
  const row = current.get(part.id);
  return { ...part, listPrice: canViewPrices ? row?.listPrice : undefined,
    ...(row ? { orderingCataloguePartId: row.id, catalogueRevision: row.revision } : {}) };
}

export async function getFatTruckPreviewPart(id: string, canViewPrices: boolean) {
  const part = parts.find(candidate => candidate.id === id);
  return part ? visiblePart(part, canViewPrices, await currentOrderingParts()) : null;
}

export async function getFatTruckPreviewFigure(id: string, canViewPrices: boolean, current: Map<string, OrderingCataloguePart>) {
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
    rows: detail.rows.map(row => ({ ...row, part: visiblePart(row.part, canViewPrices, current) })),
  };
}

export async function getFatTruckPreviewRepository(): Promise<CustomerRepository | null> {
  const session = await getFatTruckPreviewSession();
  if (!session) return null;
  const canViewPrices = session.scopes.canViewPrices;
  const current = await currentOrderingParts();
  return {
    ...fixture,
    getFigureDetail: id => getFatTruckPreviewFigure(id, canViewPrices, current),
    searchParts: async query => (await fixture.searchParts(query)).map(part => visiblePart(part, canViewPrices, current)),
    searchPartUsages: async (query, mode) => (await fixture.searchPartUsages(query, mode))
      .map(row => ({ ...row, part: visiblePart(row.part, canViewPrices, current) })),
  };
}
