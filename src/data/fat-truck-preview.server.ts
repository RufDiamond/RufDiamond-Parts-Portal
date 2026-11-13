import "server-only";

import { notFound } from "next/navigation";
import { getFigureDetail, getFigures, getSystems } from "@/data/fixture-repository.server";
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

const variant = "var-ft3-wagon-99ft3w";

export async function getFatTruckPreviewIndex() {
  return Promise.all((await getSystems(variant)).map(async system => ({
    system,
    figures: await getFigures(variant, system.id),
  })));
}

export async function getFatTruckPreviewFigure(id: string) {
  const detail = await getFigureDetail(id);
  if (!detail || detail.figure.variantId !== variant) notFound();
  return detail;
}
