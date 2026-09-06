"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback } from "react";
import { Trail } from "@/components";
import { getFigures, getSystems } from "@/data/repository";
import { useAsync } from "@/state/useAsync";
import { useMachine } from "@/state/MachineContext";
import styles from "./tiles.module.css";

/** Artwork per system, as the deck draws them. */
const ICONS: Record<string, string> = {
  "sys-filters": "filters",
  "sys-frame-assy": "frame-assy",
  "sys-drive-system": "drive-system",
  "sys-hydraulic": "hydraulic",
  "sys-tire-wheel": "tire-wheel",
  "sys-cabin": "cabin",
  "sys-cowling-fender": "cowling-fender",
  "sys-engine": "engine",
  "sys-fuel-system": "fuel-system",
  "sys-electric": "electric",
  // The deck draws ten systems; these two reuse the nearest mark until
  // artwork is supplied — see clients.md.
  "sys-tire-inflation": "tire-wheel",
  "sys-accessories": "frame-assy",
};

/** The deck numbers the systems in catalogue order. */
const NUMBERS: Record<string, number> = {
  "sys-filters": 1,
  "sys-frame-assy": 2,
  "sys-drive-system": 3,
  "sys-hydraulic": 4,
  "sys-tire-wheel": 5,
  "sys-cabin": 6,
  "sys-cowling-fender": 7,
  "sys-engine": 8,
  "sys-fuel-system": 9,
  "sys-electric": 10,
  "sys-tire-inflation": 11,
  "sys-accessories": 12,
};

async function load(variantId: string) {
  const systems = await getSystems(variantId);
  const counts = await Promise.all(
    systems.map((system) =>
      getFigures(variantId, system.id).then((figures) => figures.length),
    ),
  );
  return systems
    .map((system, i) => ({ system, figureCount: counts[i] }))
    .sort((a, b) => (NUMBERS[a.system.id] ?? 99) - (NUMBERS[b.system.id] ?? 99));
}

/** Systems for the selected machine — slide 12. */
export function SystemsGrid() {
  const { hydrated, selectedModel, selectedVariant } = useMachine();
  const variantId = selectedVariant?.id ?? null;

  const run = useCallback(
    () => (variantId ? load(variantId) : Promise.resolve(null)),
    [variantId],
  );
  const { data } = useAsync(run);

  if (!hydrated) return null;

  if (!selectedModel || !selectedVariant) {
    return (
      <div className={styles.screen}>
        <Trail steps={["No machine selected"]} />
        <p className={styles.empty}>
          The catalogue is cut by serial range, so choose a machine first.{" "}
          <Link href="/parts/fat-truck">Select a machine</Link>.
        </p>
      </div>
    );
  }

  const machine = `Fat Truck ${selectedModel.name}`;

  return (
    <div className={styles.screen}>
      <Trail steps={[machine]} />
      <div className={styles.grid}>
        {(data ?? []).map(({ system, figureCount }) => {
          const label = `${NUMBERS[system.id] ?? ""} ${system.name}`.trim();
          const icon = ICONS[system.id];
          const ready = figureCount > 0;

          const body = (
            <>
              <span className={styles.art}>
                {icon ? (
                  <Image
                    src={`/systems/${icon}.png`}
                    alt=""
                    width={220}
                    height={220}
                    className={styles.icon}
                  />
                ) : null}
              </span>
              <span className={styles.label}>
                {label}
                {ready ? null : <span className={styles.note}>No figures</span>}
              </span>
            </>
          );

          return ready ? (
            <Link
              key={system.id}
              href={`/systems/${system.id}`}
              className={styles.tile}
            >
              {body}
            </Link>
          ) : (
            <span
              key={system.id}
              className={`${styles.tile} ${styles.tilePending}`}
            >
              {body}
            </span>
          );
        })}
      </div>
    </div>
  );
}
