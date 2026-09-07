import { getPartUsageIndex } from "@/data/repository";
import { Confirmed } from "./Confirmed";

/**
 * What submitting produced — slide 53.
 *
 * The serial column on the documents comes from the catalogue, so the usage
 * index is resolved on the server, as on the request screen itself.
 */
export default async function ConfirmedPage() {
  const usage = await getPartUsageIndex();
  return <Confirmed usage={usage} />;
}
