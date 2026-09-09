"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Badge, Icon, Panel, SpecList } from "@/components";
import { useMachine } from "@/state/MachineContext";
import type { Model, Variant } from "@/types/catalog";
import screen from "@/styles/screen.module.css";
import styles from "./machine.module.css";

export interface CataloguedModel {
  model: Model;
  variants: Variant[];
}

export function MachinePicker({
  catalogued,
  lineName,
}: {
  catalogued: CataloguedModel[];
  lineName: string;
}) {
  // A model is selectable once an export has given it a serial range.
  const available = catalogued.filter((entry) => entry.variants.length > 0);
  const awaiting = catalogued.filter((entry) => entry.variants.length === 0);

  const router = useRouter();
  const { setMachine } = useMachine();
  const [chosen, setChosen] = useState<CataloguedModel | null>(null);
  const [pickedVariantId, setPickedVariantId] = useState<string | null>(null);

  const openCatalog = () => {
    if (!chosen) return;
    const variant =
      chosen.variants.find((candidate) => candidate.id === pickedVariantId) ??
      chosen.variants[0];
    if (!variant) return;

    setMachine(chosen.model, variant);
    router.push(`/systems?variantId=${encodeURIComponent(variant.id)}`);
  };

  return (
    <>
      <div className={screen.grid3}>
        {available.map(({ model, variants }) => (
          <button
            key={model.id}
            type="button"
            className={styles.tile}
            onClick={() => {
              setChosen({ model, variants });
              setPickedVariantId(variants[0]?.id ?? null);
            }}
            aria-pressed={chosen?.model.id === model.id}
          >
            <span className={styles.head}>
              <span className="eyebrow">{lineName}</span>
              <Badge variant="solid">In catalog</Badge>
            </span>
            <span className={styles.naming}>
              <span className={styles.name}>{model.name}</span>
              <span className={styles.desc}>
                Amphibious all-terrain vehicle · assembled in Canada
              </span>
            </span>
            <span className={styles.foot}>
              {variants.length}{" "}
              {variants.length === 1 ? "serial range" : "serial ranges"} · 12
              systems
            </span>
          </button>
        ))}

        {awaiting.map(({ model }) => (
          <div key={model.id} className={`${styles.tile} ${styles.tileLocked}`}>
            <span className={styles.head}>
              <span className="eyebrow">{lineName}</span>
              <Badge variant="quiet">Coming in phase two</Badge>
            </span>
            <span className={styles.naming}>
              <span className={styles.name}>{model.name}</span>
              <span className={styles.desc}>
                {lineName} line · catalogue in preparation
              </span>
            </span>
            <span className={styles.foot}>Not published</span>
          </div>
        ))}
      </div>

      {chosen ? (
        <div className={`${screen.section} ${screen.split75}`}>
          <Panel
            eyebrow="Step 2 of 2 · Serial range"
            title={`Fat Truck ${chosen.model.name}`}
            frame="strong"
          >
            <p className={styles.serialCopy}>
              Read the serial from the plate on the right-hand chassis rail,
              behind the front wheel arch. This machine has a single serial
              range in the current catalogue.
            </p>

            <div className={styles.serialList}>
              {chosen.variants.map((variant) => (
                <label key={variant.id} className={styles.serialRow}>
                  <input
                    type="radio"
                    name="serial"
                    className={styles.radio}
                    checked={pickedVariantId === variant.id}
                    onChange={() => setPickedVariantId(variant.id)}
                  />
                  <span className={styles.serialText}>
                    <span className={styles.serialLabel}>{variant.label}</span>
                    <span className={styles.serialMeta}>
                      Catalog revision {variant.catalogRevision}
                      {variant.serialTo ? "" : " · open-ended"}
                    </span>
                  </span>
                </label>
              ))}
            </div>

            <div className={styles.serialActions}>
              <button
                type="button"
                className={`${screen.button} ${screen.buttonPrimary} ${screen.buttonLg}`}
                onClick={openCatalog}
              >
                Open catalog
                <Icon name="arrow-right" size="md" />
              </button>
              <button
                type="button"
                className={`${screen.button} ${screen.buttonGhost} ${screen.buttonLg}`}
                onClick={() => setChosen(null)}
              >
                Choose another machine
              </button>
            </div>
          </Panel>

          <Panel eyebrow="Selected" title="Machine record">
            <SpecList
              items={[
                { label: "Line", value: "Fat Truck" },
                { label: "Model", value: chosen.model.name },
                {
                  label: "Serial range",
                  value: chosen.variants[0]?.label ?? "—",
                },
                {
                  label: "Catalog",
                  value: `REV ${chosen.variants[0]?.catalogRevision ?? "—"}`,
                },
                { label: "Assembled", value: "Canada" },
              ]}
            />
          </Panel>
        </div>
      ) : null}
    </>
  );
}
