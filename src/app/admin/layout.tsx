import type { ReactNode } from "react";
import Link from "next/link";
import { requireCustomerSession } from "@/lib/customer-session.server";
import { SessionBoundary, SignOutButton } from "@/state/SessionBoundary";
export const dynamic = "force-dynamic";
export default async function AdminLayout({ children }: { children: ReactNode }) {
  const session = await requireCustomerSession();
  if (!session || session.scopes.environment !== "draft" || !["publish.draft.view", "catalog.figure.view"].every(key => session.capabilities.includes(key))) return <main><h1>Admin access unavailable</h1><Link href="/">Return to catalogue</Link></main>;
  return <SessionBoundary session={session}><div style={{ padding: "24px", maxWidth: 1600, margin: "0 auto" }}><nav aria-label="Administration"><a href="/admin">Draft figures</a> · {session.capabilities.includes("publish.execute") && <><a href="/admin/publish">Publisher queue</a> · </>}<Link href="/">Customer catalogue</Link> · <SignOutButton /></nav>{children}</div></SessionBoundary>;
}
