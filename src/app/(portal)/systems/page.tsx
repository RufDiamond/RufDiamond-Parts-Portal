import { SystemsGrid } from "./SystemsGrid";
import { loadSystems } from "@/data/customer-navigation.server";

export default async function SystemsPage({ searchParams }: { searchParams: Promise<{ variantId?: string }> }) {
  const { variantId } = await searchParams;
  return <SystemsGrid data={variantId ? await loadSystems(variantId) : null} requestedVariant={variantId} />;
}
