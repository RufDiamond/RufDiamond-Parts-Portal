import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "Catalog admin · RufDiamond",
  description: "Catalogue records, imports and publishing.",
};

/**
 * The admin console has its own chrome — no customer header, request list or
 * title block — so this group deliberately adds nothing around the screen.
 */
export default function AdminLayout({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
