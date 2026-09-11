"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Trail } from "@/components";
import type { FiguresData } from "@/data/customer-navigation.server";
import { useMachine } from "@/state/MachineContext";
import styles from "../tiles.module.css";

/**
 * A figure's number exactly as the catalogue writes it: "FIG- 6.1" reads 6.1.
 * The badge holds a fixed corner slot, so nothing needs padding to line up.
 */
function figureNumber(groupNo: string): string {
  return groupNo.replace(/^\s*FIG-?\s*/i, "").trim();
}

/** Figures within a system — slide 13. */
export function FiguresGrid({ systemId, data, requestedVariant }: { systemId: string; data: FiguresData; requestedVariant?: string }) {
  const { selectedVariant } = useMachine();
  const router = useRouter();
  useEffect(() => {
    if (!requestedVariant && selectedVariant) router.replace(`/systems/${systemId}?variantId=${encodeURIComponent(selectedVariant.id)}`);
  }, [requestedVariant, selectedVariant, systemId, router]);
  if (!data) {
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
  const machine = data.model.name;
  const systemStep = system
    ? `${data?.number ?? ""} ${system.name}`.trim()
    : "";

  return (
    <div className={styles.screen}>
      <Trail
        steps={
          systemStep
            ? [
                { label: machine, href: `/systems?variantId=${encodeURIComponent(data.variant.id)}` },
                { label: systemStep },
              ]
            : [{ label: machine, href: `/systems?variantId=${encodeURIComponent(data.variant.id)}` }]
        }
      />
      <div className={styles.grid}>
        {(data?.figures ?? []).map(({ figure, plate }) => (
          <Link
            key={figure.id}
            href={`/figures/${figure.id}`}
            className={styles.tile}
          >
            <span className={styles.badge}>{figureNumber(figure.groupNo)}</span>
            <span className={styles.art}>
              {plate ? (
                <Image
                  src={plate}
                  alt=""
                  width={320}
                  height={180}
                  unoptimized
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
