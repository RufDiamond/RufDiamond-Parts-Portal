"use client";

import type { ReactNode } from "react";
import { formatAmount } from "@/lib/format";
import type { Currency, FigurePartRow } from "@/types/catalog";
import { CalloutMarker } from "./CalloutMarker";
import styles from "./PartsTable.module.css";

export interface PartsTableProps {
  rows: FigurePartRow[];
  /** Currency shown in the column head. Defaults to the first row's currency. */
  currency?: Currency;
  /**
   * Parts whose callouts are lit. Clicking a row toggles membership; every
   * marker for that part responds, not just the first.
   */
  selectedPartIds?: ReadonlySet<string>;
  hoveredPartId?: string | null;
  onTogglePart?: (partId: string) => void;
  onHoverPart?: (partId: string | null) => void;
  /**
   * Part ids already on the request list. Supplying this adds the tick column:
   * ticking adds or removes the part, which is separate from selection.
   */
  requestedPartIds?: ReadonlySet<string>;
  onToggleRequested?: (partId: string) => void;
  emptyState?: ReactNode;
  showPrices?: boolean;
}

const NO_SET: ReadonlySet<string> = new Set();

/**
 * The parts list for a figure, keyed to the drawing.
 *
 * Two distinct gestures, as the reference specifies: tick a row to put it on
 * the request list; click a row to light every callout for that part.
 */
export function PartsTable({
  rows,
  currency,
  selectedPartIds = NO_SET,
  hoveredPartId = null,
  onTogglePart,
  onHoverPart,
  requestedPartIds,
  onToggleRequested,
  emptyState,
  showPrices = true,
}: PartsTableProps) {
  if (rows.length === 0 && emptyState) {
    return <>{emptyState}</>;
  }

  const resolvedCurrency = currency ?? rows[0]?.part.currency ?? "CAD";
  const tickable = Boolean(requestedPartIds && onToggleRequested);
  const selectable = Boolean(onTogglePart);

  return (
    <table className={styles.table}>
      <thead>
        <tr>
          {tickable ? <th scope="col" className={styles.tickHead} /> : null}
          <th scope="col" className={styles.refHead}>
            Ref
          </th>
          <th scope="col" className={styles.partNoHead}>
            Part no.
          </th>
          <th scope="col">Description</th>
          <th scope="col" className={styles.numHead}>
            Qty
          </th>
          {showPrices ? (
            <th scope="col" className={styles.priceHead}>
              Price {resolvedCurrency}
            </th>
          ) : null}
        </tr>
      </thead>

      <tbody>
        {rows.map((row) => {
          const { part, figurePart, calloutNumbers } = row;
          const active = selectedPartIds.has(part.id);
          const requested = requestedPartIds?.has(part.id) ?? false;

          return (
            <tr
              key={figurePart.id}
              className={styles.row}
              data-active={active || undefined}
              data-hovered={part.id === hoveredPartId || undefined}
              onClick={selectable ? () => onTogglePart?.(part.id) : undefined}
              onMouseEnter={() => onHoverPart?.(part.id)}
              onMouseLeave={() => onHoverPart?.(null)}
            >
              {tickable ? (
                <td
                  className={styles.tick}
                  onClick={(event) => event.stopPropagation()}
                >
                  <input
                    type="checkbox"
                    className={styles.checkbox}
                    checked={requested}
                    onChange={() => onToggleRequested?.(part.id)}
                    aria-label={`Add ${part.partNumber} to the request list`}
                  />
                </td>
              ) : null}

              <td className={styles.ref}>
                <span className={styles.refList}>
                  {calloutNumbers.length === 0 ? (
                    <span className={styles.noRef}>&mdash;</span>
                  ) : (
                    calloutNumbers.map((number) => (
                      <CalloutMarker
                        key={number}
                        number={number}
                        size="sm"
                        state={active ? "active" : "default"}
                      />
                    ))
                  )}
                </span>
              </td>

              <th scope="row" className={styles.partNo}>
                {selectable ? (
                  <button
                    type="button"
                    className={styles.partButton}
                    onClick={(event) => {
                      // The row handles the click; stop it counting twice.
                      event.stopPropagation();
                      onTogglePart?.(part.id);
                    }}
                    aria-pressed={active}
                  >
                    {part.partNumber}
                  </button>
                ) : (
                  part.partNumber
                )}
              </th>

              <td className={styles.description}>
                <span>{part.description}</span>
                {part.status === "active" ? null : (
                  <span className={styles.note}>{part.status}</span>
                )}
                {figurePart.serviceable ? null : (
                  <span className={styles.note}>Reference only</span>
                )}
                {figurePart.remarks ? (
                  <span className={styles.note}>{figurePart.remarks}</span>
                ) : null}
              </td>

              <td className={styles.num}>{figurePart.qty}</td>

              {showPrices ? (
                <td className={styles.num}>
                  {formatAmount(part.listPrice, part.currency)}
                </td>
              ) : null}
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
