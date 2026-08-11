"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback } from "react";
import {
  Breadcrumbs,
  EmptyState,
  FigureTile,
  Icon,
  PageHeader,
} from "@/components";
import { getFigureDetail, getFigures, getSystems } from "@/data/repository";
import { useAsync } from "@/state/useAsync";
import { useMachine } from "@/state/MachineContext";
import screen from "@/styles/screen.module.css";

const pad = (n: number) => String(n).padStart(2, "0");

async function loadSystem(variantId: string, systemId: string) {
  const systems = await getSystems(variantId);
  const system = systems.find((candidate) => candidate.id === systemId) ?? null;
  if (!system) return { system: null, figures: [] };

  const figures = await getFigures(variantId, systemId);
  const withCounts = await Promise.all(
    figures.map(async (figure, index) => {
      const detail = await getFigureDetail(figure.id);
      return {
        figure,
        partCount: detail?.rows.length ?? 0,
        calloutCount: detail?.callouts.length ?? 0,
        sheet: `${pad(index + 1)} / ${pad(figures.length)}`,
      };
    }),
  );

  return { system, figures: withCounts };
}

export default function SystemPage() {
  const params = useParams<{ systemId: string }>();
  const systemId = params.systemId;
  const { hydrated, selectedModel, selectedVariant } = useMachine();
  const variantId = selectedVariant?.id ?? null;

  const run = useCallback(
    () => (variantId ? loadSystem(variantId, systemId) : Promise.resolve(null)),
    [variantId, systemId],
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
        <PageHeader eyebrow="System" title="Figures" />
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

  if (loading || !data) {
    return (
      <main className={screen.screen}>
        <p className={screen.loading}>Loading figures…</p>
      </main>
    );
  }

  const backToSystems = (
    <Link href="/systems" className={`${screen.button} ${screen.buttonGhost}`}>
      <Icon name="arrow-left" size="md" />
      Back to systems
    </Link>
  );

  if (!data.system) {
    return (
      <main className={screen.screen}>
        <div className={screen.trail}>
          <Breadcrumbs
            items={[
              { label: selectedModel.name, href: "/" },
              { label: "Systems", href: "/systems" },
              { label: "Unknown" },
            ]}
          />
        </div>
        <PageHeader hasTrail eyebrow="System" title="Not found" />
        <EmptyState
          icon="search-x"
          eyebrow="Unknown"
          title="System not found"
          description="This system is not part of the selected catalogue."
          note={systemId}
          action={backToSystems}
        />
      </main>
    );
  }

  const { system, figures } = data;
  const released = figures.filter(
    (entry) => entry.figure.status === "published",
  ).length;

  return (
    <main className={screen.screen}>
      <div className={screen.trail}>
        <Breadcrumbs
          items={[
            { label: "Fat Truck", href: "/machine" },
            { label: selectedModel.name, href: "/" },
            { label: "Systems", href: "/systems" },
            { label: system.name },
          ]}
        />
      </div>

      <PageHeader
        hasTrail
        eyebrow="System"
        title={system.name}
        meta={[
          figures.length === 0
            ? `Empty in revision ${selectedVariant.catalogRevision}`
            : `${figures.length} ${figures.length === 1 ? "figure" : "figures"} · ${released} released`,
        ]}
        actions={backToSystems}
      />

      {figures.length === 0 ? (
        <EmptyState
          icon="layers"
          eyebrow="Pilot scope"
          title="No figures drawn yet"
          description="This system has no plates in the current catalogue revision. Filters is the system populated in this build."
          note={`${system.name} · revision ${selectedVariant.catalogRevision}`}
          action={backToSystems}
        />
      ) : (
        <div className={screen.grid3}>
          {figures.map(({ figure, partCount, calloutCount, sheet }) => (
            <FigureTile
              key={figure.id}
              groupNo={figure.groupNo}
              name={figure.name}
              status={figure.status}
              partCount={partCount}
              calloutCount={calloutCount}
              sheet={sheet}
              href={`/figures/${figure.id}`}
            />
          ))}
        </div>
      )}
    </main>
  );
}
