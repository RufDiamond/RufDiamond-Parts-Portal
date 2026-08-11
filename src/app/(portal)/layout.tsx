import type { ReactNode } from "react";
import { AppHeader } from "@/components";
import { ShellTitleBlock } from "./ShellTitleBlock";

/**
 * Everything after sign-in sits between the ink header and the pinned
 * drawing title block.
 */
export default function PortalLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <AppHeader />
      {children}
      <ShellTitleBlock />
    </>
  );
}
