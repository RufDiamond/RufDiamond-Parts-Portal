"use client";

import Link from "next/link";
import { useCallback, useState } from "react";
import { CalloutMarker, EmptyState, Icon, Panel } from "@/components";
import { searchParts } from "@/data/repository";
import { formatPrice } from "@/lib/format";
import { useAsync } from "@/state/useAsync";
import { useRequest } from "@/state/RequestContext";
import screen from "@/styles/screen.module.css";
import styles from "./home.module.css";

const STEPS = [
  "Pick a system — 12 on this machine",
  "Pick a figure — exploded sheet per assembly",
  "Click a callout to read its part number",
];

/** Both modes side by side, as the reference lays them out. */
export function SearchPanel() {
  const [query, setQuery] = useState("");
  const { addParts, lines } = useRequest();

  const trimmed = query.trim();

  const run = useCallback(
    () => (trimmed ? searchParts(trimmed) : Promise.resolve([])),
    [trimmed],
  );
  const { data: results, loading } = useAsync(run);

  const inRequest = new Set(lines.map((line) => line.partId));

  return (
    <div className={screen.split75}>
      <Panel eyebrow="Mode 1" title="I know the part number" frame="strong">
        <div className={styles.modeBody}>
          <p className={styles.copy}>
            Enter a part number or a description from the parts list. Search is
            scoped to the selected machine and serial range.
          </p>

          <div className={styles.searchRow}>
            <input
              className={styles.searchInput}
              type="search"
              autoComplete="off"
              aria-label="Part number or description"
              placeholder="e.g. 36-00304 or hydraulic oil cartridge"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
            <button
              type="button"
              className={`${screen.button} ${screen.buttonPrimary} ${screen.buttonLg}`}
              onClick={() => setQuery("")}
              disabled={!trimmed}
            >
              Clear
            </button>
          </div>

          {!trimmed ? (
            <div className={styles.tryRow}>
              <span className="eyebrow">Try</span>
              <span className={styles.tryValues}>
                36-00304 · 56-00007 · 30-00040
              </span>
            </div>
          ) : loading ? (
            <p className={screen.loading}>Searching…</p>
          ) : results && results.length > 0 ? (
            <div>
              {results.map((part) => (
                <div key={part.id} className={styles.resultRow}>
                  <span className={styles.rowRef}>{part.partNumber}</span>
                  <span className={styles.rowLabel}>{part.description}</span>
                  <span className={styles.resultMaker}>
                    {part.manufacturer ?? "—"}
                  </span>
                  <span className={styles.resultNum}>
                    {formatPrice(part.listPrice, part.currency)}
                  </span>
                  <button
                    type="button"
                    className={screen.button}
                    onClick={() => addParts([{ part, qty: 1 }])}
                  >
                    <Icon name="plus" size="sm" />
                    {inRequest.has(part.id) ? "Add again" : "Add"}
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <EmptyState
              icon="search-x"
              eyebrow="No result"
              title="No match in this catalogue revision"
              description="Check the number against the plate on the machine, or browse the assemblies for this system."
              note={trimmed}
              action={
                <Link href="/systems" className={screen.button}>
                  <Icon name="layers" size="md" />
                  Browse systems
                </Link>
              }
            />
          )}
        </div>
      </Panel>

      <Panel eyebrow="Mode 2" title="Find it visually">
        <div className={styles.modeBody}>
          <p className={styles.copy}>
            Work down from the machine to the system, the figure and the
            callout on the drawing.
          </p>

          <div className={styles.steps}>
            {STEPS.map((step, index) => (
              <div key={step} className={styles.step}>
                <CalloutMarker number={index + 1} size="sm" />
                <span>{step}</span>
              </div>
            ))}
          </div>

          <Link
            href="/systems"
            className={`${screen.button} ${screen.buttonLg} ${screen.buttonFull}`}
          >
            <Icon name="layers" size="md" />
            Browse systems
          </Link>
        </div>
      </Panel>
    </div>
  );
}
