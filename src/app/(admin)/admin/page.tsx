import { getCatalogSummary } from "@/data/repository";
import type { CatalogState } from "@/types/catalog";
import { AdminShell } from "./AdminShell";
import styles from "./admin.module.css";
import catalog from "./catalog.module.css";

/** Placeholder until accounts exist. */
const OPERATOR = "C. Kane";

const STATE_LABEL: Record<CatalogState, string> = {
  live: "Live",
  draft: "Draft",
  "awaiting-import": "Awaiting import",
  "not-registered": "Not registered",
};

const STATE_CLASS: Record<CatalogState, string> = {
  live: catalog.chipLive,
  draft: catalog.chipDraft,
  "awaiting-import": catalog.chipAwaiting,
  "not-registered": catalog.chipNotRegistered,
};

export default async function AdminCatalogPage() {
  const { stats, groups, lastPublish } = await getCatalogSummary();

  const record = [
    { label: "Scope", value: `${groups.length} product lines` },
    { label: "Models", value: `${stats.modelsRegistered} registered` },
    { label: "With data", value: String(stats.modelsWithData) },
    { label: "Environment", value: "Production" },
    {
      label: "Last publish",
      value: lastPublish
        ? `${lastPublish.revision} · ${lastPublish.date}`
        : "Never published",
    },
  ];

  const statCells = [
    {
      label: "Models with data",
      value: String(stats.modelsWithData),
      sub: `/ ${stats.modelsRegistered} registered`,
    },
    { label: "Figures", value: String(stats.figures), sub: "FT3 Wagon" },
    { label: "Part records", value: String(stats.partRecords), sub: "" },
    {
      label: "Unmapped callouts",
      value: String(stats.unmappedCallouts),
      sub: "",
    },
  ];

  return (
    <AdminShell
      active="catalog"
      title="Catalog"
      operator={OPERATOR}
      record={record}
      actions={
        <>
          <button type="button" className={styles.button} disabled>
            Export everything
          </button>
          <button
            type="button"
            className={`${styles.button} ${styles.buttonPrimary}`}
            disabled
          >
            Open FT3 Wagon
          </button>
        </>
      }
    >
      <dl className={catalog.stats}>
        {statCells.map((cell) => (
          <div key={cell.label} className={catalog.stat}>
            <dt className={catalog.statLabel}>{cell.label}</dt>
            <dd className={catalog.statValue}>
              {cell.value}{" "}
              {cell.sub ? (
                <small className={catalog.statSub}>{cell.sub}</small>
              ) : null}
            </dd>
          </div>
        ))}
      </dl>

      {groups.map((group) => (
        <div key={group.productLine.id} className={catalog.group}>
          <p className={catalog.groupLine}>{group.productLine.name}</p>

          <table className={catalog.table}>
            <thead>
              <tr>
                <th scope="col">Model</th>
                <th scope="col" className={catalog.colSerial}>
                  Serial range
                </th>
                <th scope="col" className={catalog.colNum}>
                  Figures
                </th>
                <th scope="col" className={catalog.colNum}>
                  Parts
                </th>
                <th scope="col" className={catalog.colStatus}>
                  Status
                </th>
                <th scope="col" className={catalog.colUpdated}>
                  Last updated
                </th>
                <th scope="col" className={catalog.colAction} />
              </tr>
            </thead>

            <tbody>
              {group.models.length === 0 ? (
                <tr>
                  <td className={`${catalog.model} ${catalog.muted}`}>
                    Models pending — database in preparation
                  </td>
                  <td className={`${catalog.mono} ${catalog.muted}`}>—</td>
                  <td className={`${catalog.num} ${catalog.muted}`}>—</td>
                  <td className={`${catalog.num} ${catalog.muted}`}>—</td>
                  <td>
                    <span
                      className={`${catalog.chip} ${STATE_CLASS["not-registered"]}`}
                    >
                      {STATE_LABEL["not-registered"]}
                    </span>
                  </td>
                  <td className={`${catalog.mono} ${catalog.muted}`}>—</td>
                  <td className={catalog.colAction} />
                </tr>
              ) : (
                group.models.map((model) => {
                  const hasData = model.state === "live" || model.state === "draft";

                  return (
                    <tr key={model.modelId}>
                      <td
                        className={
                          hasData ? catalog.modelWithData : catalog.model
                        }
                      >
                        {model.name}
                      </td>
                      <td
                        className={`${catalog.mono} ${hasData ? "" : catalog.muted}`}
                      >
                        {model.serialRange ?? "Awaiting first export"}
                      </td>
                      <td
                        className={`${catalog.num} ${hasData ? "" : catalog.muted}`}
                      >
                        {hasData ? model.figures : "—"}
                      </td>
                      <td
                        className={`${catalog.num} ${hasData ? "" : catalog.muted}`}
                      >
                        {hasData ? model.parts : "—"}
                      </td>
                      <td>
                        <span
                          className={`${catalog.chip} ${STATE_CLASS[model.state]}`}
                        >
                          {STATE_LABEL[model.state]}
                        </span>
                      </td>
                      <td
                        className={`${catalog.mono} ${hasData ? "" : catalog.muted}`}
                      >
                        {model.updatedAt ?? "—"}
                      </td>
                      <td className={catalog.colAction}>
                        <button
                          type="button"
                          className={styles.button}
                          disabled
                          title="Not built yet"
                        >
                          {hasData ? "Edit" : "Import"}
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      ))}

      <div className={catalog.note}>
        <span className={catalog.noteMark}>!</span>
        <span>
          FT3 Wagon is the pilot import: {stats.figures}{" "}
          {stats.figures === 1 ? "figure is" : "figures are"} loaded, and{" "}
          {stats.unmappedCallouts}{" "}
          {stats.unmappedCallouts === 1 ? "callout has" : "callouts have"} no
          part attached. Everything else on the Fat Truck, Agilis and IronHorse
          lines is awaiting its first export from the manufacturer.
        </span>
      </div>
    </AdminShell>
  );
}
