"use client";
import { ZeroPriceNotice } from "@/components/ZeroPriceNotice";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { ComingSoon, EmptyState } from "@/components";
import { formatFigureRef, formatPrice } from "@/lib/format";
import { useRequest } from "@/state/RequestContext";
import type { PartUsageRow } from "@/types/catalog";
import styles from "./search.module.css";

export interface SearchResultsProps {
  query: string;
  mode: "part" | "description" | "any";
  /** Product line the search was launched from, for the Back link. */
  brand: string;
  rows: PartUsageRow[];
}

const HEADING: Record<SearchResultsProps["mode"], string> = {
  part: "Search by Part Number",
  description: "Search by Description",
  any: "Search",
};

/** An em dash, for a usage column the catalogue cannot fill. */
const NONE = "—";

/**
 * Results for a part number or description search — slides 19 and 20.
 *
 * One row per PLACE a part is used, so a part fitted on four figures is four
 * rows: the model, serial, system, page and assembly columns describe the
 * usage, and collapsing them would lose the answer the reader came for.
 */
export function SearchResults({ query, mode, brand, rows }: SearchResultsProps) {
  const router = useRouter();
  const { addParts, lines } = useRequest();

  /*
   * Rows are keyed by part AND figure: the same part on two figures is two
   * rows, and ticking one must not tick the other.
   */
  const keyOf = (row: PartUsageRow, index: number) =>
    `${row.part.id}:${row.figureId ?? "none"}:${index}`;

  const [ticked, setTicked] = useState<ReadonlySet<string>>(() => new Set());

  const toggle = (key: string) => {
    setAdded(null);
    setTicked((current) => {
      const next = new Set(current);
      if (!next.delete(key)) next.add(key);
      return next;
    });
  };

  const allTicked = rows.length > 0 && ticked.size === rows.length;

  const toggleAll = () => {
    setAdded(null);
    setTicked(
      allTicked ? new Set() : new Set(rows.map((row, i) => keyOf(row, i))),
    );
  };

  /** The parts behind the ticked rows, each counted once. */
  const tickedParts = useMemo(() => {
    const seen = new Map<string, PartUsageRow["part"]>();
    rows.forEach((row, index) => {
      if (ticked.has(keyOf(row, index))) seen.set(row.part.id, row.part);
    });
    return [...seen.values()];
  }, [rows, ticked]);

  const onCart = useMemo(
    () => new Set(lines.map((line) => line.partId)),
    [lines],
  );

  /** Ticked parts already on the cart. Ticking them again adds nothing. */
  const alreadyOnCart = useMemo(
    () => tickedParts.filter((part) => onCart.has(part.id)).length,
    [tickedParts, onCart],
  );

  /*
   * What the button will actually do, said out loud. The count on the label is
   * the number of NEW parts, so ticking five rows of which two are already on
   * the cart offers to add three — clicking and seeing the cart rise by two
   * fewer than the label promised is the confusing part.
   */
  const toAdd = tickedParts.length - alreadyOnCart;

  /** The last add, held until the selection changes, so the click has a result. */
  const [added, setAdded] = useState<number | null>(null);

  /**
   * Quantity is unknown outside a figure, so a search adds one of each.
   *
   * The ticks clear on success: they are a shortlist for one action, and
   * leaving them set invites a second click that silently does nothing.
   */
  const addTickedToCart = () => {
    const additions = tickedParts
      .filter((part) => !onCart.has(part.id))
      .map((part) => ({ part, qty: 1 }));
    if (additions.length === 0) return;
    addParts(additions);
    setAdded(additions.length);
    setTicked(new Set());
  };

  const emailTicked = () => {
    const chosen = tickedParts.length > 0 ? tickedParts : rows.map((r) => r.part);
    const body = [
      `Parts found for "${query}"`,
      "",
      "Part no.\tDescription",
      ...chosen.map((part) => `${part.partNumber}\t${part.description}`),
    ].join("\n");
    window.location.href =
      `mailto:?subject=${encodeURIComponent(`Parts enquiry — ${query}`)}` +
      `&body=${encodeURIComponent(body)}`;
  };

  const back = () => {
    if (brand) router.push(`/parts/${brand}`);
    else router.back();
  };

  const [cartComingSoon, setCartComingSoon] = useState(false);
  const [term, setTerm] = useState(query);
  const research = () => {
    const next = term.trim();
    if (!next) return;
    router.push(
      `/search?mode=${mode}&q=${encodeURIComponent(next)}` +
        (brand ? `&brand=${brand}` : ""),
    );
  };

  return (
    <div className={styles.screen}>
      <ZeroPriceNotice prices={rows.map(row => row.part.listPrice)} />
      <div className={styles.bar}>
        <form
          className={styles.search}
          onSubmit={(event) => {
            event.preventDefault();
            research();
          }}
        >
          <label className={styles.label} htmlFor="search-again">
            {HEADING[mode]}:
          </label>
          <div className={styles.field}>
            <input
              id="search-again"
              className={styles.input}
              value={term}
              onChange={(event) => setTerm(event.target.value)}
              autoComplete="off"
            />
            <button
              type="submit"
              className={styles.go}
              aria-label="Search again"
            >
              &rsaquo;
            </button>
          </div>
        </form>

        <span className={styles.spacer} />

        <button
          type="button"
          className={styles.button}
          onClick={() => {
            addTickedToCart();
            router.push("/request");
          }}
          disabled={rows.length === 0}
          title="Add anything ticked, then open the request list"
        >
          <Image src="/toolbar/quote.png" alt="" width={40} height={52}
            className={styles.buttonIcon} />
          Request a quote
        </button>

        <button
          type="button"
          className={styles.button}
          onClick={addTickedToCart}
          disabled={toAdd === 0}
          title={
            tickedParts.length === 0
              ? "Tick a row first"
              : toAdd === 0
                ? "Everything ticked is already on the cart"
                : `Add ${toAdd} part${toAdd === 1 ? "" : "s"} to the cart` +
                  (alreadyOnCart > 0
                    ? ` — ${alreadyOnCart} of the ${tickedParts.length} ticked ${alreadyOnCart === 1 ? "is" : "are"} already on it`
                    : "")
          }
        >
          <Image src="/toolbar/cart-add.png" alt="" width={40} height={40}
            className={styles.buttonIcon} />
          Add to cart{toAdd > 0 ? ` · ${toAdd}` : ""}
        </button>

        <button
          type="button"
          className={styles.button}
          onClick={emailTicked}
          disabled={rows.length === 0}
        >
          <Image src="/toolbar/email.png" alt="" width={40} height={28}
            className={styles.buttonIcon} />
          Email
        </button>

        <button
          type="button"
          className={styles.button}
          onClick={() => setCartComingSoon(true)}
          title="The cart screen has not been built yet"
        >
          <Image src="/toolbar/check-cart.png" alt="" width={40} height={40}
            className={styles.buttonIcon} />
          Check cart · {lines.length}
        </button>

        <button
          type="button"
          className={`${styles.button} ${styles.back}`}
          onClick={back}
        >
          &laquo; Back
        </button>
      </div>

      <div className={styles.surface}>
        {rows.length === 0 ? (
          <EmptyState
            icon="search-x"
            eyebrow={query ? "No match" : "Nothing searched"}
            title={
              query
                ? mode === "description"
                  ? "No part description contains that text"
                  : "No part carries that number"
                : "Enter a part number or a description"
            }
            description={
              query
                ? "Check the characters, or try fewer of them — a partial number matches, so 61-001 finds every window part. Separators are ignored, so 61001 finds the same."
                : "Search from a product line screen, or type a term above."
            }
            note={query ? `Searched: ${query}` : undefined}
            action={
              <button type="button" className={styles.button} onClick={back}>
                &laquo; Back
              </button>
            }
          />
        ) : (
          <div className={styles.scroller}>
            <table className={styles.table}>
              <thead>
                <tr className={styles.head}>
                  <th scope="col" className={styles.tickHead}>
                    <input
                      type="checkbox"
                      className={styles.checkbox}
                      checked={allTicked}
                      onChange={toggleAll}
                      aria-label="Select every result"
                    />
                  </th>
                  <th scope="col" className={styles.noHead}>No.</th>
                  <th scope="col" className={styles.partNoHead}>Part no.</th>
                  <th scope="col">Description</th>
                  <th scope="col" className={styles.priceHead}>Unit price</th>
                  <th scope="col" className={styles.modelHead}>Model</th>
                  <th scope="col" className={styles.serialHead}>Serial</th>
                  <th scope="col" className={styles.systemHead}>System</th>
                  <th scope="col" className={styles.pageHead}>Page</th>
                  <th scope="col" className={styles.assemblyHead}>
                    Assembly name
                  </th>
                </tr>
              </thead>

              <tbody>
                {rows.map((row, index) => {
                  const key = keyOf(row, index);
                  const on = ticked.has(key);
                  const { part } = row;

                  return (
                    <tr
                      key={key}
                      className={styles.row}
                      data-active={on || undefined}
                      onClick={() => toggle(key)}
                    >
                      <td className={styles.tickCell}>
                        <input
                          type="checkbox"
                          className={styles.checkbox}
                          checked={on}
                          onChange={() => toggle(key)}
                          onClick={(event) => event.stopPropagation()}
                          aria-label={`Select ${part.partNumber}`}
                        />
                      </td>
                      <td className={styles.no}>{index + 1}</td>
                      <th scope="row" className={styles.partNo}>
                        {part.partNumber}
                      </th>
                      <td className={styles.description}>{part.description}</td>
                      <td className={styles.price}>
                        <span className={styles.priceRow}>
                          <span className={styles.currency}>$</span>
                          <span>
                            {formatPrice(part.listPrice, part.currency)}
                          </span>
                        </span>
                      </td>
                      <td className={styles.model}>{row.modelName ?? NONE}</td>
                      <td className={styles.serial}>{row.serial ?? NONE}</td>
                      <td className={styles.system}>{row.systemName ?? NONE}</td>
                      <td className={styles.page}>
                        {row.figureId && row.groupNo ? (
                          <button
                            type="button"
                            className={styles.pageLink}
                            onClick={(event) => {
                              event.stopPropagation();
                              router.push(`/figures/${row.figureId}`);
                            }}
                            title="Open this figure"
                          >
                            {formatFigureRef(row.groupNo)}
                          </button>
                        ) : (
                          NONE
                        )}
                      </td>
                      <td className={styles.assembly}>
                        {row.assemblyName ?? NONE}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {cartComingSoon ? (
        <ComingSoon
          title="Check cart — coming soon"
          onClose={() => setCartComingSoon(false)}
        >
          The cart screen has not been designed yet. Use{" "}
          <strong>Request a quote</strong> to review what you have gathered and
          send it to RUF Diamond.
        </ComingSoon>
      ) : null}

      {rows.length > 0 ? (
        <p className={styles.count}>
          {added !== null ? (
            <span className={styles.added}>
              {added} {added === 1 ? "part" : "parts"} added to the cart ·{" "}
            </span>
          ) : null}
          {rows.length} {rows.length === 1 ? "result" : "results"} for
          &ldquo;{query}&rdquo;
          {ticked.size > 0 ? ` · ${ticked.size} ticked` : ""}
        </p>
      ) : null}
    </div>
  );
}
