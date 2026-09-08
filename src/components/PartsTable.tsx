"use client";

import { useMemo, useState } from "react";
import { CalloutMarker, type CalloutMarkerState } from "./CalloutMarker";
import { formatPrice } from "@/lib/format";
import type { Currency, FigurePartRow } from "@/types/catalog";
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
  /** Parts already on the cart. */
  requestedPartIds?: ReadonlySet<string>;
  onToggleRequested?: (partId: string) => void;
}

const NONE: ReadonlySet<string> = new Set();

type Column = "ref" | "partNo" | "description" | "qty" | "price" | "remarks";

/**
 * The figure's parts list — slide 14.
 *
 * Columns and their order are the deck's: a tick, REF. NO., PART NO.,
 * DESCRIPTION, QTY, UNIT PRICE and REMARKS, with a filter row sitting directly
 * under the header.
 */
export function PartsTable({
  rows,
  currency,
  selectedPartIds = NONE,
  hoveredPartId = null,
  onTogglePart,
  onHoverPart,
  requestedPartIds = NONE,
  onToggleRequested,
}: PartsTableProps) {
  const [filters, setFilters] = useState<Record<Column, string>>({
    ref: "",
    partNo: "",
    description: "",
    qty: "",
    price: "",
    remarks: "",
  });

  const unit = currency ?? rows[0]?.part.currency ?? "CAD";
  const selectable = Boolean(onTogglePart);
  const tickable = Boolean(onToggleRequested);

  /*
   * Ref numbers carry the same three states as the squares on the plate, by
   * the same rule: the selected or hovered part is lit, and once anything is
   * selected everything else steps back. A number in the list and its marker
   * on the drawing must never disagree.
   */
  const markerState = (partId: string): CalloutMarkerState => {
    if (selectedPartIds.has(partId) || partId === hoveredPartId) return "active";
    return selectedPartIds.size > 0 ? "muted" : "default";
  };

  const visible = useMemo(() => {
    const active = Object.entries(filters).filter(([, v]) => v.trim());
    if (active.length === 0) return rows;

    return rows.filter((row) => {
      const values: Record<Column, string> = {
        ref: row.calloutNumbers.join(" "),
        partNo: row.part.partNumber,
        description: row.part.description,
        qty: String(row.figurePart.qty),
        price: formatPrice(row.part.listPrice, row.part.currency),
        remarks: row.figurePart.remarks ?? "",
      };
      return active.every(([key, value]) =>
        values[key as Column].toLowerCase().includes(value.trim().toLowerCase()),
      );
    });
  }, [rows, filters]);

  const set = (key: Column, value: string) =>
    setFilters((current) => ({ ...current, [key]: value }));

  const allTicked =
    rows.length > 0 && rows.every((row) => requestedPartIds.has(row.part.id));

  const filterCell = (key: Column, label: string) => (
    <td className={styles.filterCell}>
      <input
        className={styles.filterInput}
        value={filters[key]}
        onChange={(event) => set(key, event.target.value)}
        aria-label={`Filter by ${label}`}
      />
    </td>
  );

  return (
    <div className={styles.scroller}>
      <table className={styles.table}>
        <thead>
          <tr className={styles.head}>
            {tickable ? (
              <th scope="col" className={styles.tickHead}>
                <input
                  type="checkbox"
                  className={styles.checkbox}
                  checked={allTicked}
                  onChange={() =>
                    rows.forEach((row) => {
                      const on = requestedPartIds.has(row.part.id);
                      if (on === allTicked) onToggleRequested?.(row.part.id);
                    })
                  }
                  aria-label="Select every part on this figure"
                />
              </th>
            ) : null}
            <th scope="col" className={styles.refHead}>
              Ref. no.
            </th>
            <th scope="col" className={styles.partNoHead}>
              Part no.
            </th>
            <th scope="col">Description</th>
            <th scope="col" className={styles.qtyHead}>
              Qty
            </th>
            <th scope="col" className={styles.priceHead}>
              Unit price ({unit})
            </th>
            <th scope="col" className={styles.remarksHead}>
              Remarks
            </th>
          </tr>

          <tr className={styles.filterRow}>
            {tickable ? <td className={styles.filterCell} /> : null}
            {filterCell("ref", "reference number")}
            {filterCell("partNo", "part number")}
            {filterCell("description", "description")}
            {filterCell("qty", "quantity")}
            {filterCell("price", "unit price")}
            {filterCell("remarks", "remarks")}
          </tr>
        </thead>

        <tbody>
          {visible.length === 0 ? (
            <tr>
              <td className={styles.empty} colSpan={tickable ? 7 : 6}>
                No parts match these filters.
              </td>
            </tr>
          ) : (
            visible.map((row) => {
              const { figurePart, part, calloutNumbers } = row;
              const active = selectedPartIds.has(part.id);
              const hovered = part.id === hoveredPartId;

              return (
                <tr
                  key={figurePart.id}
                  className={styles.row}
                  data-active={active || undefined}
                  data-hovered={hovered || undefined}
                  onMouseEnter={() => onHoverPart?.(part.id)}
                  onMouseLeave={() => onHoverPart?.(null)}
                  onClick={
                    selectable ? () => onTogglePart?.(part.id) : undefined
                  }
                >
                  {tickable ? (
                    <td className={styles.tickCell}>
                      <input
                        type="checkbox"
                        className={styles.checkbox}
                        checked={requestedPartIds.has(part.id)}
                        onChange={() => onToggleRequested?.(part.id)}
                        onClick={(event) => event.stopPropagation()}
                        aria-label={`Add ${part.partNumber} to the cart`}
                      />
                    </td>
                  ) : null}

                  <td className={styles.ref}>
                    {calloutNumbers.length === 0 ? (
                      <span className={styles.noRef}>&mdash;</span>
                    ) : (
                      /*
                       * The row is clickable too, so a click that a marker has
                       * already handled is stopped here — letting it reach the
                       * row would toggle the same part straight back off.
                       */
                      <span
                        className={styles.refMarks}
                        onClick={(event) => event.stopPropagation()}
                      >
                        {calloutNumbers.map((number) => (
                          <CalloutMarker
                            key={number}
                            number={number}
                            size="sm"
                            state={markerState(part.id)}
                            title={`${part.partNumber} \u2014 ${part.description}`}
                            onActivate={
                              selectable
                                ? () => onTogglePart?.(part.id)
                                : undefined
                            }
                            /*
                             * Assert the hover, never clear it: the pointer
                             * leaving a marker is usually still inside the row,
                             * and the row's own mouseleave is what ends it.
                             */
                            onHoverChange={(hovering) => {
                              if (hovering) onHoverPart?.(part.id);
                            }}
                          />
                        ))}
                      </span>
                    )}
                  </td>

                  <th scope="row" className={styles.partNo}>
                    {part.partNumber}
                  </th>

                  <td className={styles.description}>{part.description}</td>
                  <td className={styles.qty}>{figurePart.qty}</td>
                  <td className={styles.price}>
                    {formatPrice(part.listPrice, part.currency)}
                  </td>
                  <td className={styles.remarks}>
                    {figurePart.remarks ?? ""}
                  </td>
                </tr>
              );
            })
          )}
        </tbody>
      </table>
    </div>
  );
}
