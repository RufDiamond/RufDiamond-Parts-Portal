import { getPublishQueue } from "@/data/repository";
import { PublishingBoard } from "./PublishingBoard";

export default async function AdminPublishingPage() {
  const queue = await getPublishQueue();
  return <PublishingBoard queue={queue} />;
}
