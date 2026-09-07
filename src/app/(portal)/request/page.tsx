import { getPartUsageIndex } from "@/data/repository";
import { QuoteRequest } from "./QuoteRequest";

/**
 * The quote request — slide 44.
 *
 * The list itself lives in the browser, but the columns beside each part come
 * from the catalogue, so the index is resolved on the server and handed down.
 */
export default async function RequestPage() {
  const usage = await getPartUsageIndex();
  return <QuoteRequest usage={usage} />;
}
