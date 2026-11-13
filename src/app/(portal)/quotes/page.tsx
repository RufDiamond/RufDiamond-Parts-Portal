import { getCustomerQuoteStatus } from "@/data/quote-status.server";
import { QuoteStatus } from "./QuoteStatus";

/** Quote Status, customer view — 12 Oct deck, p59. */
export default async function QuotesPage() {
  const lines = await getCustomerQuoteStatus();
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "America/Toronto" });
  return <QuoteStatus lines={lines ?? []} today={today} />;
}
