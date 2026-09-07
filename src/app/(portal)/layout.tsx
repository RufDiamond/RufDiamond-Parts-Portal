import type { ReactNode } from "react";
import { PortalShell } from "@/components";

/**
 * Everything after sign-in sits inside the portal chrome: the icon rail and
 * the header. Per the V2 deck, which drops the previous top header, machine
 * chip and pinned title block.
 */

/** The header shows the date the portal was opened, so it cannot be prerendered. */
export const dynamic = "force-dynamic";

export default function PortalLayout({ children }: { children: ReactNode }) {
  const date = new Date().toLocaleDateString("en-CA", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  return <PortalShell date={date}>{children}</PortalShell>;
}
