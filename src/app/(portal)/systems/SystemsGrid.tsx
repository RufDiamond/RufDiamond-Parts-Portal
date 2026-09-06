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
  // The deck draws ten system tiles; FT3 Wagon carries twelve. Tire inflation
  // (section 10) and Accessories (section 12) reuse the nearest mark until
  // artwork is supplied — see clients.md.
  "sys-tire-inflation": "tire-wheel",
  "sys-accessories": "frame-assy",
};

/**
 * A system's section number is not ours to choose: it is the leading part of
 * its figures' GROUPNO in the export, e.g. FIG- 11.3 puts Electric at 11.
 * Deriving it keeps the screen honest if the catalogue is renumbered.
 */
function sectionNumber(groupNos: string[]): number | null {
  const numbers = groupNos
    .map((g) => Number.parseInt(g.split(".")[0] ?? "", 10))
    .filter((n) => Number.isFinite(n));
  return numbers.length ? Math.min(...numbers) : null;
}

async function load(variantId: string) {
  const systems = await getSystems(variantId);
  const perSystem = await Promise.all(
    systems.map((system) => getFigures(variantId, system.id)),
  );
  return systems
    .map((system, i) => ({
      system,
      figureCount: perSystem[i].length,
      number: sectionNumber(perSystem[i].map((figure) => figure.groupNo)),
    }))
    .sort((a, b) => (a.number ?? 99) - (b.number ?? 99));
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
        <Trail steps={[{ label: "No machine selected" }]} />
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
      <Trail steps={[{ label: machine }]} />
      <div className={styles.grid}>
        {(data ?? []).map(({ system, figureCount, number }) => {
          const label = `${number ?? ""} ${system.name}`.trim();
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
