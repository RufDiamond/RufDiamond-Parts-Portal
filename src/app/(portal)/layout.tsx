import type { ReactNode } from "react";
import { PortalShell } from "@/components";
import { AppProviders } from "@/state";
import { requireCustomerSession } from "@/lib/customer-session.server";

/**
 * Everything after sign-in sits inside the portal chrome: the icon rail and
 * the header. Per the V2 deck, which drops the previous top header, machine
 * chip and pinned title block.
 */

/** The header shows the date the portal was opened, so it cannot be prerendered. */
export const dynamic = "force-dynamic";

export default async function PortalLayout({ children }: { children: ReactNode }) {
  const session = await requireCustomerSession();
  const date = new Date().toLocaleDateString("en-CA", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  return <AppProviders session={session}><PortalShell date={date}>{children}</PortalShell></AppProviders>;
}
