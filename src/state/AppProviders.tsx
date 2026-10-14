"use client";

import type { ReactNode } from "react";
import type { Company } from "@/types/catalog";
import { DEMO_COMPANY } from "@/data/accounts";
import { MachineProvider } from "./MachineContext";
import { RequestProvider } from "./RequestContext";
import { SessionBoundary } from "./SessionBoundary";
import { scopeKey } from "./customer-session";
import type { MeResponse } from "@rufdiamond/contracts";

/**
 * Local fixture demo account only (a dealer, so its 10% shows). Connected
 * pages receive the current authenticated company and never use this value
 * as an API fallback.
 */
const PLACEHOLDER_COMPANY: Company = DEMO_COMPANY;

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
