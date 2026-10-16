import Link from "next/link";
import { requireCustomerSession } from "@/lib/customer-session.server";
import { DealerDiscountAdmin } from "./DealerDiscountAdmin";

/**
 * Small accounts admin for dealer discountRate (PPT follow-up F).
 * Not a full RBAC redesign — staff with users.all.manage only.
 */
export default async function DealerDiscountPage() {
  const session = await requireCustomerSession();
  if (!session?.capabilities.includes("users.all.manage")) {
    return (
      <main style={{ padding: 24 }}>
        <h1>Dealer discounts</h1>
        <p>Account management capability is required.</p>
        <p><Link href="/">Home</Link></p>
      </main>
    );
  }
  return <DealerDiscountAdmin companyId={session.companyId} csrfToken={session.csrfToken} />;
}
