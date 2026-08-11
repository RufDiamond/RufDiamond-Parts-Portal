"use client";

import type { ReactNode } from "react";
import type { Company } from "@/types/catalog";
import { MachineProvider } from "./MachineContext";
import { RequestProvider } from "./RequestContext";

/**
 * PLACEHOLDER ACCOUNT.
 *
 * The request screen has to show a discount line, and the rate belongs to the
 * signed-in company — which does not exist until auth lands. This stands in
 * for it. Replace with the company from the session; nothing else changes.
 */
const PLACEHOLDER_COMPANY: Company = {
  id: "co-placeholder",
  name: "Red Lake Mine",
  type: "dealer",
  // 10% is the dealer rate the client uses, and the reference's default.
  discountRate: 0.1,
};

/**
 * Client state for the whole portal.
 *
 * `children` arrives as a prop from the server layout, so wrapping the tree
 * here does not force any screen to become a client component.
 */
export function AppProviders({ children }: { children: ReactNode }) {
  return (
    <MachineProvider>
      <RequestProvider company={PLACEHOLDER_COMPANY}>{children}</RequestProvider>
    </MachineProvider>
  );
}
