"use client";

import Link from "next/link";
import { useState } from "react";
import { formatFigureRef } from "@/lib/format";
import type { ModelDetail } from "@/types/admin";
import { AdminShell } from "../../AdminShell";
import shell from "../../admin.module.css";
import catalog from "../../catalog.module.css";
import styles from "./model.module.css";

const OPERATOR = "C. Kane";

const STATE_LABEL = {
  live: "Live",
  draft: "Draft",
  "awaiting-import": "Awaiting import",
  "not-registered": "Not registered",
} as const;

const STATE_CLASS = {
  live: catalog.chipLive,
  draft: catalog.chipDraft,
  "awaiting-import": catalog.chipAwaiting,
  "not-registered": catalog.chipNotRegistered,
} as const;

export function ModelEditor({ detail }: { detail: ModelDetail }) {
  const { model, productLine, variants, systems, figuresByVariant, state } =
    detail;

  const [name, setName] = useState(model.name);
  const [lineId, setLineId] = useState(productLine.id);

  // Which systems this model serves. Switching one off hides its figures from
  // customers; it does not delete them.
  const [activeSystems, setActiveSystems] = useState<ReadonlySet<string>>(
    () => new Set(systems.map((row) => row.system.id)),
  );

  const toggleSystem = (systemId: string) => {
    setActiveSystems((current) => {
      const next = new Set(current);
      if (!next.delete(systemId)) next.add(systemId);
      return next;
    });
  };

  const activeFigures = systems
    .filter((row) => activeSystems.has(row.system.id))
    .reduce((sum, row) => sum + row.figureCount, 0);

  const firstFigureSystem = systems.find((row) => row.figureCount > 0);
  const revision = variants[0]?.catalogRevision;

  return (
    <AdminShell
      active="models"
      title={model.name}
      operator={OPERATOR}
      record={[
        { label: "Record", value: model.name },
        { label: "Product line", value: productLine.name },
        { label: "Variants", value: String(variants.length) },
        { label: "State", value: STATE_LABEL[state] },
        {
          label: "Edited",
          value: `${model.updatedAt ?? "—"} · ${OPERATOR}`,
        },
      ]}
      actions={
        <>
          <span className={`${catalog.chip} ${STATE_CLASS[state]}`}>
            {STATE_LABEL[state]}
          </span>
          <button type="button" className={shell.button} disabled>
            Discard changes
          </button>
          <button
            type="button"
            className={`${shell.button} ${shell.buttonPrimary}`}
            disabled
            title="No backend to save to yet"
          >
            Save
          </button>
        </>
      }
    >
      <div className={styles.columns}>
        <div>
          <p className={`${styles.sectionLabel} ${styles.sectionLabelFirst}`}>
            Identity
          </p>

          <div className={styles.field}>
            <label className={styles.label} htmlFor="product-line">
              Product line
            </label>
            <select
              id="product-line"
              className={styles.select}
              value={lineId}
              onChange={(event) => setLineId(event.target.value)}
            >
              <option value={productLine.id}>{productLine.name}</option>
            </select>
            <p className={styles.help}>
              Product line is a grouping level only. It sets the part-number
              prefix and the country of manufacture, not the look of the
              catalogue.
            </p>
          </div>

          <div className={styles.field}>
            <label className={styles.label} htmlFor="model-name">
              Model name
            </label>
            <input
              id="model-name"
              className={styles.input}
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
          </div>

          <div className={styles.field}>
            <label className={styles.label} htmlFor="model-revision">
              Catalog revision
            </label>
            <input
              id="model-revision"
              className={`${styles.input} ${styles.readonly}`}
              readOnly
              value={
                revision
                  ? `REV ${revision} · ${model.updatedAt ?? "—"}`
                  : "No export imported"
              }
            />
          </div>

          <p className={styles.sectionLabel}>Serial variants</p>
          <p className={styles.intro}>
            Split the model only where parts genuinely differ. Customers pick a
            variant before they see any parts.
          </p>

          <div className={catalog.tableScroll}><table className={catalog.table}>
            <thead>
              <tr>
                <th scope="col">Label</th>
                <th scope="col" className={catalog.colNum}>
                  Figures
                </th>
                <th scope="col" className={catalog.colAction} />
              </tr>
            </thead>
            <tbody>
              {variants.length === 0 ? (
                <tr>
                  <td className={catalog.muted}>No serial range imported</td>
                  <td className={`${catalog.num} ${catalog.muted}`}>—</td>
                  <td />
                </tr>
              ) : (
                variants.map((variant) => (
                  <tr key={variant.id}>
                    <td className={catalog.mono}>{variant.label}</td>
                    <td className={catalog.num}>
                      {figuresByVariant[variant.id] ?? 0}
                    </td>
                    <td className={catalog.colAction}>
                      <button
                        type="button"
                        className={shell.button}
                        disabled
                        title="A model must keep at least one serial variant"
                      >
                        Remove
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table></div>

          <button
            type="button"
            className={shell.button}
            style={{ marginTop: 12 }}
            disabled
          >
            Add a serial variant
          </button>
        </div>

        <div>
          <p className={`${styles.sectionLabel} ${styles.sectionLabelFirst}`}>
            Systems
          </p>
          <p className={styles.intro}>
            Tick the systems this model carries. Unticking one hides its figures
            from customers; it does not delete them.
          </p>

          <div className={styles.checklist}>
            <table className={styles.checkTable}>
              <tbody>
                {systems.map((row) => {
                  const on = activeSystems.has(row.system.id);
                  return (
                    <tr key={row.system.id}>
                      <td className={styles.checkCell}>
                        <input
                          type="checkbox"
                          className={styles.checkbox}
                          checked={on}
                          onChange={() => toggleSystem(row.system.id)}
                          aria-label={row.system.name}
                        />
                      </td>
                      <td
                        className={`${styles.systemName} ${on ? "" : styles.systemOff}`}
                      >
                        {row.system.name}
                      </td>
                      <td
                        className={`${styles.systemMeta} ${on ? "" : styles.systemMetaOff}`}
                      >
                        {row.figureCount === 0
                          ? "No figures"
                          : `${row.figureCount} ${row.figureCount === 1 ? "figure" : "figures"} · ${row.partCount} parts`}
                        {row.unmappedCallouts > 0 ? (
                          <span className={catalog.subline}>
                            {row.unmappedCallouts} unmapped
                          </span>
                        ) : null}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className={styles.checkFoot}>
            <span className={styles.checkFootCount}>
              {activeSystems.size} of {systems.length} active · {activeFigures}{" "}
              {activeFigures === 1 ? "figure" : "figures"}
            </span>
            {firstFigureSystem ? (
              <Link
                href="/admin/figures/fig-filters-1-1"
                className={`${shell.button} ${shell.buttonPrimary}`}
              >
                Open {firstFigureSystem.system.name} ·{" "}
                {formatFigureRef("1.1")}
              </Link>
            ) : null}
          </div>
        </div>
      </div>
    </AdminShell>
  );
}
