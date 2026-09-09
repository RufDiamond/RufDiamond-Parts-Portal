"use client";
import { useMemo } from "react";
import type { SourceReviewDetail } from "@rufdiamond/contracts";
import { useCustomerSession } from "@/state/SessionBoundary";
import { createAdminApiClient } from "@/features/diagram-mapping/admin-api-client";
import { SourceReview } from "./SourceReview";
export function SourceReviewEntry({
  initial,
}: {
  initial: SourceReviewDetail;
}) {
  const session = useCustomerSession(),
    client = useMemo(
      () => (session ? createAdminApiClient(session.csrfToken) : null),
      [session],
    );
  if (!client || !session)
    return <p>Authenticated source review access is required.</p>;
  const canReview =
    initial.canReview &&
    session.capabilities.includes("publish.execute") &&
    session.capabilities.includes(
      initial.target === "import" ? "parts.import" : "catalog.callout.map",
    );
  return (
    <SourceReview
      initial={{ ...initial, canReview }}
      api={{
        read: () => client.sourceReview(initial.target, initial.id),
        approve: (id, version, input, key) =>
          client.approveSourceReview(initial.target, id, version, input, key),
      }}
    />
  );
}
