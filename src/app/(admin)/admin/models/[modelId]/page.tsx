import { notFound } from "next/navigation";
import { getModelDetail } from "@/data/repository";
import { ModelEditor } from "./ModelEditor";

export default async function AdminModelPage({
  params,
}: {
  params: Promise<{ modelId: string }>;
}) {
  const { modelId } = await params;
  const detail = await getModelDetail(modelId);
  if (!detail) notFound();

  return <ModelEditor detail={detail} />;
}
