"use client";
import { useMemo } from "react";
import type { Static } from "@sinclair/typebox";
import type { PublicationQueuePageSchema } from "@rufdiamond/contracts";
import { useCustomerSession } from "@/state/SessionBoundary";
import { createAdminApiClient } from "./admin-api-client";
import { PublisherQueue } from "./PublisherQueue";
export function PublisherEntry({ initial }: { initial: Static<typeof PublicationQueuePageSchema> }) {
  const session = useCustomerSession();
  const api = useMemo(() => session ? createAdminApiClient(session.csrfToken) : null, [session]);
  return api && session?.capabilities.includes("publish.execute") ? <PublisherQueue initial={initial} api={api} /> : <p>Named publisher capability is required.</p>;
}
