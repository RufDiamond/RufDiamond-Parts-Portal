"use client";

import type { ReactNode } from "react";
import { MachineProvider } from "./MachineContext";
import { RequestProvider } from "./RequestContext";

/**
 * Client state for the whole portal.
 *
 * `children` arrives as a prop from the server layout, so wrapping the tree
 * here does not force any screen to become a client component.
 */
export function AppProviders({ children }: { children: ReactNode }) {
  return (
    <MachineProvider>
      {/* No `company` yet — accounts arrive with auth, and until then the
          discount rate is zero. */}
      <RequestProvider>{children}</RequestProvider>
    </MachineProvider>
  );
}
