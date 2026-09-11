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
  const publisher = [
    "publish.execute",
    "publish.draft.view",
    "catalog.figure.view",
  ].every((c) => session.capabilities.includes(c));
  const canReviewAssembly =
    initial.canReviewAssembly &&
    publisher &&
    session.capabilities.includes("parts.import");
  const canReview =
    initial.canReview &&
    publisher &&
    (initial.target === "import"
      ? session.capabilities.includes("parts.import")
      : ["catalog.callout.map", "catalog.callout.manage"].every((c) =>
          session.capabilities.includes(c),
        ));
  return (
    <SourceReview
      initial={{ ...initial, canReview, canReviewAssembly }}
      api={{
        read: () => client.sourceReview(initial.target, initial.id),
        approve: (id, version, input, key) =>
          client.approveSourceReview(initial.target, id, version, input, key),
      }}
    />
  );
}
