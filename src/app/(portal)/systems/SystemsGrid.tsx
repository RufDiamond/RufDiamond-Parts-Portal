"use client";

import Image, { type StaticImageData } from "next/image";
import Link from "next/link";
import cabin from "../../../../public/systems/cabin.png";
import cowlingFender from "../../../../public/systems/cowling-fender.png";
import driveSystem from "../../../../public/systems/drive-system.png";
import electric from "../../../../public/systems/electric.png";
import engine from "../../../../public/systems/engine.png";
import filters from "../../../../public/systems/filters.png";
import frameAssy from "../../../../public/systems/frame-assy.png";
import fuelSystem from "../../../../public/systems/fuel-system.png";
import hydraulic from "../../../../public/systems/hydraulic.png";
import tireWheel from "../../../../public/systems/tire-wheel.png";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Trail } from "@/components";
import type { SystemsData } from "@/data/customer-navigation.server";
import { useMachine } from "@/state/MachineContext";
import styles from "./tiles.module.css";

/**
 * Artwork per system, as the deck draws them.
 *
 * Imported rather than referenced by path so the build fingerprints each file:
 * redrawing a mark changes its URL, and no one is left looking at a cached
 * copy of the old one.
 */
const ICONS: Record<string, StaticImageData> = {
  "sys-filters": filters,
  "sys-frame-assy": frameAssy,
  "sys-drive-system": driveSystem,
  "sys-hydraulic": hydraulic,
  "sys-tire-wheel": tireWheel,
  "sys-cabin": cabin,
  "sys-cowling-fender": cowlingFender,
  "sys-engine": engine,
  "sys-fuel-system": fuelSystem,
  "sys-electric": electric,
  // The deck draws ten system tiles; FT3 Wagon carries twelve. Tire inflation
  // (section 10) and Accessories (section 12) reuse the nearest mark until
  // artwork is supplied — see clients.md.
  "sys-tire-inflation": tireWheel,
  "sys-accessories": frameAssy,
};

/**
 * A system's section number is not ours to choose: it is the leading part of
 * its figures' GROUPNO in the export, e.g. FIG- 11.3 puts Electric at 11.
 * Deriving it keeps the screen honest if the catalogue is renumbered.
 */
/** Systems for the selected machine — slide 12. */
export function SystemsGrid({ data, requestedVariant }: { data: SystemsData; requestedVariant?: string }) {
  const { selectedVariant } = useMachine();
  const router = useRouter();
  useEffect(() => {
    if (!requestedVariant && selectedVariant) router.replace(`/systems?variantId=${encodeURIComponent(selectedVariant.id)}`);
  }, [requestedVariant, selectedVariant, router]);
  if (!data) {
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

  const machine = data.model.name;

  return (
    <div className={styles.screen}>
      <Trail steps={[{ label: machine }]} />
      <div className={styles.grid}>
        {data.entries.map(({ system, figureCount, number }) => {
          const label = system.name;
          const icon = ICONS[system.id];
          const ready = figureCount > 0;

          const body = (
            <>
              {number === null ? null : (
                <span className={styles.badge}>{number}</span>
              )}
              <span className={styles.art}>
                {icon ? (
                  <Image src={icon} alt="" className={styles.icon} />
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
              href={`/systems/${system.id}?variantId=${encodeURIComponent(data.variant.id)}`}
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
