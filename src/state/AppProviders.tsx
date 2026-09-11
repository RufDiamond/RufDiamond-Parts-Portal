"use client";

import type { ReactNode } from "react";
import type { Company } from "@/types/catalog";
import { MachineProvider } from "./MachineContext";
import { RequestProvider } from "./RequestContext";
import { SessionBoundary } from "./SessionBoundary";
import { scopeKey } from "./customer-session";
import type { MeResponse } from "@rufdiamond/contracts";

/**
 * Local fixture demo account only. Connected pages receive the current
 * authenticated company and never use this value as an API fallback.
 */
const PLACEHOLDER_COMPANY: Company = {
  id: "co-placeholder",
  name: "Red Lake Mine",
  type: "dealer",
  // 10% is the dealer rate the client uses, and the reference's default.
  discountRate: 0.1,
  // The address the deck itself types on slide 52, so the default-address
  // button has something real to fill until accounts exist.
  defaultShippingAddress: "62 Smelter Road, Coniston, Ontario, Canada P0M 1M0",
};

/**
 * Client state for the whole portal.
 *
 * `children` arrives as a prop from the server layout, so wrapping the tree
 * here does not force any screen to become a client component.
 */
export function AppProviders({ children, session = null }: { children: ReactNode; session?: MeResponse | null }) {
  const company: Company = session ? {
    id: session.company.id, name: session.company.name, type: session.company.type,
    ...(Object.hasOwn(session.company, "discountRate") ? { discountRate: Number("discountRate" in session.company ? session.company.discountRate : undefined) } : {}),
    defaultShippingAddress: session.company.defaultShippingAddress ? Object.values(session.company.defaultShippingAddress).filter(Boolean).join(", ") : null,
  } : PLACEHOLDER_COMPANY;
  return (
    <SessionBoundary session={session}>
    <MachineProvider key={session ? scopeKey(session) : "fixture"} persist={!session}>
      <RequestProvider company={company} apiSession={session}>{children}</RequestProvider>
    </MachineProvider>
    </SessionBoundary>
  );
}
