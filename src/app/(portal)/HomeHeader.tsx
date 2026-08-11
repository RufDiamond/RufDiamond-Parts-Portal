"use client";

import { PageHeader } from "@/components";
import { useMachine } from "@/state/MachineContext";

/** The machine lives in client state, so the header reads it there. */
export function HomeHeader() {
  const { selectedModel, selectedVariant } = useMachine();

  return (
    <PageHeader
      eyebrow={
        selectedModel ? `Fat Truck ${selectedModel.name}` : "Parts catalogue"
      }
      title="Find a part"
      meta={[
        selectedVariant?.label ?? "No machine selected",
        "12 systems · 1 published in pilot",
      ]}
    />
  );
}
