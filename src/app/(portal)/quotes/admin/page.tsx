import Link from "next/link";
import { requireCustomerSession } from "@/lib/customer-session.server";
import { AdminQuoteStatus } from "./AdminQuoteStatus";

/**
 * Quote Status, RUF Diamond's view — 12 Oct deck, p58.
 * Requires a verified backend session with `orders.quote` in every repository
 * mode. Factory Price and admin fixture rows must never reach anonymous or
 * customer sessions, including local fixture demos.
 */
export default async function AdminQuotesPage() {
  const session = await requireCustomerSession();
  if (!session?.capabilities.includes("orders.quote")) {
    return (
      <main style={{ padding: 24 }}>
        <h1>Quote status — RUF Diamond</h1>
        <p>Administrator access with the quote capability is required to view Factory Price.</p>
        <p><Link href="/quotes">Back to customer Quote Status</Link></p>
        <p><Link href="/signin">Sign in</Link></p>
      </main>
    );
  }
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "America/Toronto" });
  return <AdminQuoteStatus seed={[]} today={today} />;
}
