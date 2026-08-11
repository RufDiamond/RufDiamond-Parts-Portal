"use client";

import { useCallback, useState } from "react";
import { getAllParts } from "@/data/repository";
import { buildPartsCsv, downloadCsv } from "@/lib/adminCsv";
import { formatAmount, formatFigureRef } from "@/lib/format";
import { useAsync } from "@/state/useAsync";
import type { AdminPartRow } from "@/types/admin";
import type { System } from "@/types/catalog";
import { AdminShell } from "../AdminShell";
import shell from "../admin.module.css";
import catalog from "../catalog.module.css";

const OPERATOR = "C. Kane";

type StateFilter = "all" | "superseded" | "requires";

export interface PartsBrowserProps {
  initialParts: AdminPartRow[];
  systems: System[];
}

export function PartsBrowser({ initialParts, systems }: PartsBrowserProps) {
  const [query, setQuery] = useState("");
  const [systemId, setSystemId] = useState("");
  const [stateFilter, setStateFilter] = useState<StateFilter>("all");
  const [importOpen, setImportOpen] = useState(false);

  // Search and the system filter go through the repository so they match
  // whatever the backend will do.
  const run = useCallback(
    () =>
      getAllParts({
        ...(query.trim() ? { query } : {}),
        ...(systemId ? { systemId } : {}),
      }),
    [query, systemId],
  );
  const { data } = useAsync(run);

  // The relationship filters are a view concern, so they stay here.
  const rows = (data ?? initialParts).filter((row) => {
    if (stateFilter === "superseded") {
      return Boolean(row.supersededBy || row.supersedes);
    }
    if (stateFilter === "requires") return row.requires.length > 0;
    return true;
  });

  const supersededCount = (data ?? initialParts).filter(
    (row) => row.part.status === "superseded",
  ).length;

  return (
    <AdminShell
      active="parts"
      title="Parts"
      operator={OPERATOR}
      record={[
        { label: "Records", value: String(initialParts.length) },
        { label: "Superseded", value: String(supersededCount) },
        { label: "Systems", value: String(systems.length) },
        { label: "Showing", value: String(rows.length) },
        { label: "Last import", value: "2026-07-24 · CSV" },
      ]}
      actions={
        <>
          <button
            type="button"
            className={shell.button}
            onClick={() => setImportOpen((open) => !open)}
          >
            Import CSV
          </button>
          <button
            type="button"
            className={shell.button}
            onClick={() =>
              downloadCsv("ft3-wagon-parts", buildPartsCsv(rows))
            }
          >
            Export CSV
          </button>
          <button
            type="button"
            className={`${shell.button} ${shell.buttonPrimary}`}
            disabled
            title="Not built yet"
          >
            New part
          </button>
        </>
      }
    >
      {importOpen ? (
        <div className={catalog.importPanel}>
          <div className={catalog.importHead}>
            <p className={catalog.sectionLabel} style={{ margin: 0 }}>
              Import CSV
            </p>
            <span style={{ marginLeft: "auto" }} />
            <button
              type="button"
              className={shell.button}
              onClick={() => setImportOpen(false)}
            >
              Close
            </button>
          </div>
          <div className={catalog.dropZone}>
            <p className={catalog.dropTitle}>Drop a parts export here</p>
            <p className={catalog.emptyBody} style={{ margin: 0 }}>
              Expected columns: part no., description, system, figure, qty, unit
              price CAD, remarks
            </p>
          </div>
          <p className={catalog.blurb} style={{ margin: "10px 0 0" }}>
            Rows matching an existing part number update that record; the old
            values stay in revision history. Reading the file is not wired up —
            there is no backend to import into yet.
          </p>
        </div>
      ) : null}

      <div className={catalog.filters}>
        <input
          className={catalog.filterInput}
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Part number or description"
          aria-label="Search parts"
        />
        <select
          className={catalog.filterSelect}
          value={systemId}
          onChange={(event) => setSystemId(event.target.value)}
          aria-label="Filter by system"
        >
          <option value="">All systems</option>
          {systems.map((system) => (
            <option key={system.id} value={system.id}>
              {system.name}
            </option>
          ))}
        </select>
        <select
          className={catalog.filterSelect}
          value={stateFilter}
          onChange={(event) =>
            setStateFilter(event.target.value as StateFilter)
          }
          aria-label="Filter by relationship"
        >
          <option value="all">All records</option>
          <option value="superseded">Supersession only</option>
          <option value="requires">Has also-requires</option>
        </select>
      </div>

      <table className={catalog.table}>
        <thead>
          <tr>
            <th scope="col" style={{ width: 96 }}>
              Part no.
            </th>
            <th scope="col">Description</th>
            <th scope="col" style={{ width: 170 }}>
              System
            </th>
            <th scope="col" style={{ width: 70 }}>
              Figure
            </th>
            <th scope="col" className={catalog.colNum} style={{ width: 56 }}>
              Qty
            </th>
            <th scope="col" className={catalog.colNum} style={{ width: 120 }}>
              Unit price CAD
            </th>
            <th scope="col" style={{ width: 280 }}>
              Remarks
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr
              key={row.part.id}
              className={
                row.part.status === "superseded" ? catalog.rowSuperseded : ""
              }
            >
              <td className={catalog.mono} style={{ fontSize: 13 }}>
                {row.part.partNumber}
              </td>
              <td>{row.part.description}</td>
              <td className={catalog.small}>
                {row.systems.length > 0 ? row.systems.join(", ") : "—"}
              </td>
              <td className={catalog.mono}>
                {row.figures.length > 0
                  ? row.figures.map((groupNo) => formatFigureRef(groupNo)).join(", ")
                  : "—"}
              </td>
              <td className={catalog.num}>
                {row.totalQty > 0 ? row.totalQty : "—"}
              </td>
              <td className={catalog.num}>
                {formatAmount(row.part.listPrice, row.part.currency)}
              </td>
              <td className={catalog.small}>
                {row.remarks.map((remark) => (
                  <span key={remark} className={catalog.link}>
                    {remark}
                  </span>
                ))}
                {row.supersededBy ? (
                  <span className={catalog.link}>
                    <span className={catalog.linkKey}>Superseded by</span>{" "}
                    {row.supersededBy.partNumber} ·{" "}
                    {row.supersededBy.description}
                  </span>
                ) : null}
                {row.supersedes ? (
                  <span className={catalog.link}>
                    <span className={catalog.linkKey}>Replaces</span>{" "}
                    {row.supersedes.partNumber} · {row.supersedes.description}
                  </span>
                ) : null}
                {row.requires.map((ref) => (
                  <span key={ref.partId} className={catalog.link}>
                    <span className={catalog.linkKey}>Also requires</span>{" "}
                    {ref.partNumber} · {ref.description}
                    {ref.qty ? ` (${ref.qty}×)` : ""}
                  </span>
                ))}
                {row.remarks.length === 0 &&
                !row.supersededBy &&
                !row.supersedes &&
                row.requires.length === 0
                  ? "—"
                  : null}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {rows.length === 0 ? (
        <div className={catalog.empty}>
          <p className={catalog.emptyTitle}>
            Nothing matches those filters
          </p>
          <p className={catalog.emptyBody}>
            Check the number against the plate on the machine.
          </p>
          <button
            type="button"
            className={shell.button}
            onClick={() => {
              setQuery("");
              setSystemId("");
              setStateFilter("all");
            }}
          >
            Clear the filters
          </button>
        </div>
      ) : null}

      <p className={catalog.count}>
        Showing {rows.length} of {initialParts.length} records
      </p>
    </AdminShell>
  );
}
