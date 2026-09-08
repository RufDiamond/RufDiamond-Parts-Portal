import { FiguresGrid } from "./FiguresGrid";

export default async function SystemPage({
  params,
}: {
  params: Promise<{ systemId: string }>;
}) {
  const { systemId } = await params;
  return <FiguresGrid systemId={systemId} />;
}
