import { getCustomerQuoteStatus } from "@/data/quote-status.server";
import { Pending } from "../Pending";
import { QuoteStatus } from "./QuoteStatus";

/** Quote Status, customer view — 12 Oct deck, p59. */
export default async function QuotesPage() {
  const lines = await getCustomerQuoteStatus();
  // No quote service exists behind the connected API yet; say so rather than
  // showing sample quotes to a real account.
  if (lines === null) return <Pending eyebrow="Not available yet" title="Quote status" />;
  return <QuoteStatus lines={lines} />;
}
