"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback } from "react";
import { Trail } from "@/components";
import { getFigureDetail, getFigures, getSystems } from "@/data/repository";
import { useAsync } from "@/state/useAsync";
import { useMachine } from "@/state/MachineContext";
import styles from "../tiles.module.css";

async function load(variantId: string, systemId: string) {
  const systems = await getSystems(variantId);
  const system = systems.find((s) => s.id === systemId) ?? null;
  if (!system) return { system: null, figures: [] };

  const figures = await getFigures(variantId, systemId);
  // The section number is the leading part of the figures' GROUPNO.
  const number = Number.parseInt(figures[0]?.groupNo.split(".")[0] ?? "", 10);
  const withPlates = await Promise.all(
    figures.map(async (figure) => {
      const detail = await getFigureDetail(figure.id);
      return { figure, plate: detail?.drawing?.storagePath ?? null };
    }),
  );
  return {
    system,
    number: Number.isFinite(number) ? number : null,
    figures: withPlates,
  };
}

/** Figures within a system — slide 13. */
export function FiguresGrid({ systemId }: { systemId: string }) {
  const { hydrated, selectedModel, selectedVariant } = useMachine();
  const variantId = selectedVariant?.id ?? null;

  const run = useCallback(
    () => (variantId ? load(variantId, systemId) : Promise.resolve(null)),
    [variantId, systemId],
  );
  const { data } = useAsync(run);

  if (!hydrated) return null;

  if (!selectedModel || !selectedVariant) {
    return (
      <div className={styles.screen}>
        <Trail steps={[{ label: "No machine selected" }]} />
        <p className={styles.empty}>
          Choose a machine first.{" "}
          <Link href="/parts/fat-truck">Select a machine</Link>.
        </p>
      </div>
    );
  }

  const system = data?.system ?? null;
  const machine = `Fat Truck ${selectedModel.name}`;
  const systemStep = system
    ? `${data?.number ?? ""} ${system.name}`.trim()
    : "";

  return (
    <div className={styles.screen}>
      <Trail
        steps={
          systemStep
            ? [
                { label: machine, href: "/systems" },
                { label: systemStep },
              ]
            : [{ label: machine, href: "/systems" }]
        }
      />
      <div className={styles.grid}>
        {(data?.figures ?? []).map(({ figure, plate }) => (
          <Link
            key={figure.id}
            href={`/figures/${figure.id}`}
            className={styles.tile}
          >
            <span className={styles.art}>
              {plate ? (
                <Image
                  src={plate}
                  alt=""
                  width={320}
                  height={180}
                  className={styles.plate}
                />
              ) : null}
            </span>
            <span className={styles.label}>{figure.name}</span>
          </Link>
        ))}
      </div>
    </div>
  );
}
