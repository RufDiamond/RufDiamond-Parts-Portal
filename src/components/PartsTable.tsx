"use client";

import type { ReactNode } from "react";
import { formatAmount } from "@/lib/format";
import type { Currency, FigurePartRow } from "@/types/catalog";
import { QuantityStepper } from "./QuantityStepper";
import styles from "./PartsTable.module.css";

const NO_SELECTION: ReadonlySet<string> = new Set();

export interface PartsTableProps {
  rows: FigurePartRow[];
  /** Currency shown in the column head. Defaults to the first row's currency. */
  currency?: Currency;
  /** Selected parts; their rows invert and all their markers light. */
  selectedPartIds?: ReadonlySet<string>;
  /** Part under the pointer, including when it is hovered on the drawing. */
  hoveredPartId?: string | null;
  onTogglePart?: (partId: string) => void;
  onHoverPart?: (partId: string | null) => void;
  /** Part id to ordered quantity. Supplying this adds the Order column. */
  orderQuantities?: Record<string, number>;
  onOrderQuantityChange?: (partId: string, qty: number) => void;
  /** Shown in place of the table body when there are no rows. */
  emptyState?: ReactNode;
  caption?: string;
  /** Sums the Cost CAD column. Off by default. */
  showTotal?: boolean;
}

/**
 * The parts list for a figure. Callout numbers, part numbers, quantities and
 * costs are mono with tabular figures so every column aligns.
 */
export function PartsTable({
  rows,
  currency,
  selectedPartIds = NO_SELECTION,
  hoveredPartId = null,
  onTogglePart,
  onHoverPart,
  orderQuantities,
  onOrderQuantityChange,
  emptyState,
  caption,
  showTotal = false,
}: PartsTableProps) {
  if (rows.length === 0 && emptyState) {
    return <>{emptyState}</>;
  }

  const resolvedCurrency = currency ?? rows[0]?.part.currency ?? "CAD";
  const orderable = Boolean(orderQuantities && onOrderQuantityChange);
  const selectable = Boolean(onTogglePart);
  const total = rows.reduce((sum, row) => sum + row.part.listPrice, 0);

  return (
    <table className={styles.table}>
      {caption ? <caption className={styles.caption}>{caption}</caption> : null}
      <thead>
        <tr>
          <th scope="col">Ref</th>
          <th scope="col">Part no.</th>
          <th scope="col">Description</th>
          <th scope="col" className={styles.numHead}>
            Qty
          </th>
          <th scope="col" className={styles.numHead}>
            Cost {resolvedCurrency}
          </th>
          {orderable ? (
            <th scope="col" className={styles.numHead}>
              Order
            </th>
          ) : null}
        </tr>
      </thead>

      <tbody>
        {rows.map((row) => {
          const { part, figurePart, calloutNumbers } = row;
          const active = selectedPartIds.has(part.id);

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
              <td className={styles.refCell}>
                <span className={styles.refList}>
                  {calloutNumbers.length === 0 ? (
                    <span className={styles.noRef}>&mdash;</span>
                  ) : (
                    calloutNumbers.map((number) => (
                      <span key={number} className={styles.refBadge}>
                        {number}
                      </span>
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
                <span className={styles.descriptionText}>
                  {part.description}
                </span>
                {part.status === "active" ? null : (
                  <span className={styles.flag}>{part.status}</span>
                )}
                {figurePart.serviceable ? null : (
                  <span className={styles.flag}>reference only</span>
                )}
                {figurePart.remarks ? (
                  <span className={styles.remarks}>{figurePart.remarks}</span>
                ) : null}
              </td>

              <td className={`${styles.num} ${styles.qty}`}>{figurePart.qty}</td>

              <td className={styles.num}>
                {formatAmount(part.listPrice, part.currency)}
              </td>

              {orderable ? (
                <td
                  className={styles.orderCell}
                  onClick={(event) => event.stopPropagation()}
                >
                  <QuantityStepper
                    label={`Order quantity for ${part.partNumber}`}
                    value={orderQuantities?.[part.id] ?? 0}
                    onChange={(next) => onOrderQuantityChange?.(part.id, next)}
                    disabled={!figurePart.serviceable}
                  />
                </td>
              ) : null}
            </tr>
          );
        })}
      </tbody>

      {showTotal && rows.length > 0 ? (
        <tfoot>
          <tr>
            {/* Ref, Part no., Description */}
            <td colSpan={3} />
            <td className={styles.totalLabel}>Total</td>
            <td className={styles.num}>
              {formatAmount(total, resolvedCurrency)}
            </td>
            {orderable ? <td /> : null}
          </tr>
        </tfoot>
      ) : null}
    </table>
  );
}
