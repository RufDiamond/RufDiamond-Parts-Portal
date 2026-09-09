import { PublicationQueuePageSchema } from "@rufdiamond/contracts";
import { readApiContract } from "@/data/api-response.server";
import { getBackendApiRead } from "@/lib/backend-api.server";
import { PublisherEntry } from "@/features/diagram-mapping/PublisherEntry";
export default async function PublishPage() {
  let initial;
  try { initial = await readApiContract(await getBackendApiRead(), "admin/publication/queue", PublicationQueuePageSchema); }
  catch { return <main><h1>Publisher queue unavailable</h1><p>A named publisher with complete model scope is required.</p></main>; }
  return <PublisherEntry initial={initial} />;
}
