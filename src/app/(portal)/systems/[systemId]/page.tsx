import { FiguresGrid } from "./FiguresGrid";
import { loadFigures } from "@/data/customer-navigation.server";

export default async function SystemPage({
  params,
  searchParams,
}: {
  params: Promise<{ systemId: string }>;
  searchParams: Promise<{ variantId?: string }>;
}) {
  const { systemId } = await params;
  const { variantId } = await searchParams;
  return <FiguresGrid systemId={systemId} requestedVariant={variantId} data={variantId ? await loadFigures(variantId, systemId) : null} />;
}
