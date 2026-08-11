"use client";

import Link from "next/link";
import { useCallback } from "react";
import {
  Breadcrumbs,
  EmptyState,
  Icon,
  PageHeader,
  SystemTile,
} from "@/components";
import { getFigures, getSystems } from "@/data/repository";
import { SYSTEM_ICONS } from "@/lib/systemIcons";
import { useAsync } from "@/state/useAsync";
import { useMachine } from "@/state/MachineContext";
import screen from "@/styles/screen.module.css";

async function loadSystems(variantId: string) {
  const systems = await getSystems(variantId);
  const counts = await Promise.all(
    systems.map((system) =>
      getFigures(variantId, system.id).then((figures) => figures.length),
    ),
  );
  return systems.map((system, index) => ({
    system,
    figureCount: counts[index],
  }));
}

export default function SystemsPage() {
  const { hydrated, selectedModel, selectedVariant } = useMachine();
  const variantId = selectedVariant?.id ?? null;

  // The variant lives in sessionStorage, so this cannot be fetched on the
  // server. Idle until a machine is chosen.
  const run = useCallback(
    () => (variantId ? loadSystems(variantId) : Promise.resolve(null)),
    [variantId],
  );
  const { data, loading } = useAsync(run);

  if (!hydrated) {
    return (
      <main className={screen.screen}>
        <p className={screen.loading}>Loading…</p>
      </main>
    );
  }

  if (!selectedModel || !selectedVariant) {
    return (
      <main className={screen.screen}>
        <PageHeader eyebrow="Contents" title="Systems" />
        <EmptyState
          icon="layers"
          eyebrow="No machine"
          title="No machine selected"
          description="The catalogue is cut by serial range, so pick a machine first."
          action={
            <Link
              href="/machine"
              className={`${screen.button} ${screen.buttonPrimary}`}
            >
              Select machine
            </Link>
          }
        />
      </main>
    );
  }

  const published = data?.filter((entry) => entry.figureCount > 0).length ?? 0;

  return (
    <main className={screen.screen}>
      <div className={screen.trail}>
        <Breadcrumbs
          items={[
            { label: "Fat Truck", href: "/machine" },
            { label: selectedModel.name, href: "/" },
            { label: "Systems" },
          ]}
        />
      </div>

      <PageHeader
        hasTrail
        eyebrow={`Fat Truck ${selectedModel.name} · ${selectedVariant.label}`}
        title="Systems"
        meta={[
          `${data?.length ?? 12} systems · ${published} published in pilot`,
        ]}
        actions={
          <Link
            href="/"
            className={`${screen.button} ${screen.buttonGhost}`}
          >
            <Icon name="arrow-left" size="md" />
            Back to search
          </Link>
        }
      />

      {loading || !data ? (
        <p className={screen.loading}>Loading systems…</p>
      ) : (
        <div className={screen.grid4}>
          {data.map(({ system, figureCount }) => (
            <SystemTile
              key={system.id}
              name={system.name}
              figureCount={figureCount}
              icon={SYSTEM_ICONS[system.id]}
              revision={selectedVariant.catalogRevision}
              href={`/systems/${system.id}`}
            />
          ))}
        </div>
      )}
    </main>
  );
}
