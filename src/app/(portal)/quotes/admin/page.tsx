import Link from "next/link";
import { getAdminQuoteRecords } from "@/data/quote-status.server";
import { requireCustomerSession } from "@/lib/customer-session.server";
import { Pending } from "../../Pending";
import { AdminQuoteStatus } from "./AdminQuoteStatus";

/**
 * Quote Status, RUF Diamond's view — 12 Oct deck, p58.
 * Requires `orders.quote` so Factory Price never leaks to customer sessions.
 */
export default async function AdminQuotesPage() {
  const session = await requireCustomerSession();
  if (session && !session.capabilities.includes("orders.quote")) {
    return (
      <main style={{ padding: 24 }}>
        <h1>Quote status — RUF Diamond</h1>
        <p>Administrator access with the quote capability is required to view Factory Price.</p>
        <p><Link href="/quotes">Back to customer Quote Status</Link></p>
      </main>
    );
  }
  // Local fixture demo has no session: keep the screen available for walkthrough only.
  if (!session) {
    const records = await getAdminQuoteRecords();
    if (records === null) return <Pending eyebrow="Not available yet" title="Quote status — RUF Diamond" />;
    const today = new Date().toLocaleDateString("en-CA", { timeZone: "America/Toronto" });
    return <AdminQuoteStatus seed={records} today={today} />;
  }
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "America/Toronto" });
  return <AdminQuoteStatus seed={[]} today={today} />;
}
