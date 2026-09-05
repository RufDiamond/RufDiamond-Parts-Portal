"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Icon } from "@/components";
import { useMachine } from "@/state/MachineContext";
import type { Model, ProductLine, Variant } from "@/types/catalog";
import styles from "./brand.module.css";

export interface BrandModel {
  model: Model;
  variants: Variant[];
  /** Web path of the model photo, or null where none has been supplied. */
  photo: string | null;
  figureCount: number;
}

export interface BrandPartsProps {
  productLine: ProductLine;
  models: BrandModel[];
}

/**
 * A product line's landing screen, per slide 10: pick a model from the photo
 * grid, or go straight in by part number or description.
 */
export function BrandParts({ productLine, models }: BrandPartsProps) {
  const router = useRouter();
  const { setMachine } = useMachine();
  const [partNo, setPartNo] = useState("");
  const [description, setDescription] = useState("");

  /** Choosing a model sets the machine, then opens its systems. */
  const open = (entry: BrandModel) => {
    const variant = entry.variants[0];
    if (!variant) return;
    setMachine(entry.model, variant);
    router.push("/systems");
  };

  const search = (mode: "part" | "description", value: string) => {
    const q = value.trim();
    if (!q) return;
    router.push(
      `/search?mode=${mode}&q=${encodeURIComponent(q)}&brand=${productLine.id}`,
    );
  };

  return (
    <div className={styles.screen}>
      <div className={styles.gridPanel}>
        <p className={styles.label}>Search by model:</p>

        {models.length === 0 ? (
        <p className={styles.empty}>
          No models are registered for {productLine.name} yet. The parts data
          for this line has not been received from the factory.
        </p>
        ) : (
          <div className={styles.grid}>
            {models.map((entry, index) => {
            const ready = entry.figureCount > 0 && entry.variants.length > 0;
            return (
              <button
                key={entry.model.id}
                type="button"
                className={`${styles.tile} ${ready ? "" : styles.tilePending}`}
                onClick={() => (ready ? open(entry) : undefined)}
                disabled={!ready}
                title={
                  ready
                    ? `Open ${entry.model.name}`
                    : "Catalogue not yet imported for this model"
                }
              >
                <span className={styles.photo}>
                  {entry.photo ? (
                    <Image
                      src={entry.photo}
                      alt=""
                      width={720}
                      height={405}
                      className={styles.photoImg}
                      sizes="(max-width: 700px) 100vw, 260px"
                      priority={index < 4}
                    />
                  ) : (
                    <span className={styles.photoNone}>No photo</span>
                  )}
                </span>
                <span className={styles.tileName}>
                  {productLine.name} {entry.model.name}
                </span>
                {ready ? null : (
                  <span className={styles.tileNote}>Catalogue in preparation</span>
                )}
              </button>
            );
            })}
          </div>
        )}
      </div>

      <div className={styles.searches}>
        <form
          className={styles.search}
          onSubmit={(e) => {
            e.preventDefault();
            search("part", partNo);
          }}
        >
          <label className={styles.label} htmlFor="by-part">
            Search by part number:
          </label>
          <div className={styles.field}>
            <input
              id="by-part"
              className={styles.input}
              value={partNo}
              onChange={(e) => setPartNo(e.target.value)}
              placeholder="36-00304"
              autoComplete="off"
            />
            <button
              type="submit"
              className={styles.go}
              aria-label="Search by part number"
            >
              <Icon name="arrow-right" size="md" />
            </button>
          </div>
        </form>

        <form
          className={styles.search}
          onSubmit={(e) => {
            e.preventDefault();
            search("description", description);
          }}
        >
          <label className={styles.label} htmlFor="by-description">
            Search by description:
          </label>
          <div className={styles.field}>
            <input
              id="by-description"
              className={styles.input}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="air filter"
              autoComplete="off"
            />
            <button
              type="submit"
              className={styles.go}
              aria-label="Search by description"
            >
              <Icon name="arrow-right" size="md" />
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
