"use client";
import { ZeroPriceNotice } from "@/components/ZeroPriceNotice";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { EmptyState, Icon } from "@/components";
import { formatFigureRef } from "@/lib/format";
import { useMachine } from "@/state/MachineContext";
import { createQuoteApi } from "@/state/quote-api";
import { registerQuoteRequest } from "@/state/quote-store";
import { useRequest } from "@/state/RequestContext";
import { useCustomerSession } from "@/state/SessionBoundary";
import type { PartUsageSummary } from "@/types/catalog";
import styles from "./quote.module.css";

export interface QuoteRequestProps {
  /** Where each part is used, keyed by part id. */
  usage: Record<string, PartUsageSummary>;
  /**
   * Set when the view is opened inside another screen — the figure workspace
   * shows it in place of the plate (slides 48-49) rather than navigating. The
   * screen's own toolbar already says REQUEST A QUOTE, so the header bar comes
   * off, and "Add more parts" goes back to the plate instead of the catalogue.
   */
  embedded?: boolean;
  onAddMoreParts?: () => void;
}

type ShippingMethod = "standard" | "expedited";

/** An em dash, for a column the catalogue cannot fill. */
const NONE = "—";

/**
 * Request a quote — slide 44.
 *
 * The parts gathered so far, each with the model, serial range, system, page
 * and assembly it came from, a comment per line and a general one, and an
 * estimated shipping block. Prices are deliberately absent: the deck drops the
 * unit price column here because the quote is what establishes the price.
 */
export function QuoteRequest({
  usage,
  embedded = false,
  onAddMoreParts,
}: QuoteRequestProps) {
  const router = useRouter();
  const { selectedModel, selectedVariant } = useMachine();
  const {
    lines,
    includedLines,
    isIncluded,
    toggleIncluded,
    setAllIncluded,
    itemCount,
    linesHydrated,
    updateQty,
    submit,
    company,
    submissionAvailable,
    requestError,
    hydrationError,
    retryHydration,
    discardSavedRequest,
  } = useRequest();

  const machineName = selectedModel?.name ?? "Catalogue";
  /* Every model in the pilot is a Fat Truck; the other lines have no data. */
  const productLine = selectedModel ? "Fat Truck" : null;

  /*
   * The ticks live in the request itself, not in this screen: unticking a part
   * has to take it out of the cost and out of what ships, and both of those
   * are decided where the request is held.
   */
  const allIncluded = lines.length > 0 && includedLines.length === lines.length;

  /** Per-line notes, and which lines have their note open. */
  const [comments, setComments] = useState<Record<string, string>>({});
  const [openComments, setOpenComments] = useState<ReadonlySet<string>>(
    () => new Set(),
  );
  const toggleComment = (partId: string) =>
    setOpenComments((current) => {
      const next = new Set(current);
      if (!next.delete(partId)) next.add(partId);
      return next;
    });

  const [generalOpen, setGeneralOpen] = useState(false);
  const [general, setGeneral] = useState("");

  /*
   * The shipping block is dormant until asked for — slide 51. Estimating is
   * what opens it: the address field becomes writable, the saved address is
   * offered, and the methods stop being greyed. Before that the reader is not
   * being asked to think about shipping at all.
   */
  const [estimating, setEstimating] = useState(false);
  const [address, setAddress] = useState("");
  const [method, setMethod] = useState<ShippingMethod | null>(null);

  const savedAddress = company?.defaultShippingAddress ?? null;
  const session = useCustomerSession();
  const canSubmit = !session || session.capabilities.includes("orders.submit");
  const quoteApi = useMemo(() => (session ? createQuoteApi(session.csrfToken) : null), [session]);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const onSubmit = async () => {
    if (!canSubmit) return;
    setSubmitError(null);
    const details = {
      comments,
      generalComment: general,
      shipping: estimating ? { address: address.trim(), method } : null,
      brand: productLine,
      serial: selectedVariant?.label ?? null,
    };
    if (quoteApi && includedLines.length > 0) {
      setSubmitting(true);
      try {
        const place = (partId: string) => usage[partId];
        const result = await quoteApi.submitQuote({
          productLine: "Fat Truck",
          shipping: details.shipping
            ? { address: details.shipping.address, method: (details.shipping.method ?? "standard") as "standard" | "expedited" }
            : null,
          generalComment: general,
          lines: includedLines.map((line) => {
            const at = place(line.partId);
            return {
              partId: /^[0-9a-f-]{36}$/i.test(line.partId) ? line.partId : null,
              partNumber: line.partNumberSnapshot,
              description: line.descriptionSnapshot,
              qty: line.qty,
              model: at?.modelName?.toUpperCase(),
              serialNumber: at?.serial ?? undefined,
              system: at?.systemName?.toUpperCase(),
              figure: at?.groupNo ? `FIG ${at.groupNo}` : undefined,
              assemblyName: at?.assemblyName?.toUpperCase(),
            };
          }),
        });
        const confirmation = submit(details, result.quoteNo);
        if (confirmation) {
          registerQuoteRequest(confirmation, company?.id ?? session?.companyId ?? "guest", usage);
        }
        router.push("/request/confirmed");
      } catch (error) {
        setSubmitError(error instanceof Error ? error.message : "Quote submit failed.");
      } finally {
        setSubmitting(false);
      }
      return;
    }
    const confirmation = submit(details);
    if (!confirmation) return;
    registerQuoteRequest(confirmation, company?.id ?? "guest", usage);
    router.push("/request/confirmed");
  };

  if (!linesHydrated) {
    if (hydrationError) return <div>
      <p role="alert">{hydrationError}</p>
      <button type="button" onClick={retryHydration}>Retry saved request</button>
      <p>To start over, discard all saved parts in this request. They will not be restored.</p>
      <button type="button" onClick={discardSavedRequest}>Discard saved request</button>
    </div>;
    return <p className={styles.loading}>Loading…</p>;
  }

  if (lines.length === 0) {
    return (
      <div className={styles.screen}>
        <div className={styles.bar}>
          <span className={styles.title}>Request a quote</span>
        </div>
        <div className={styles.surface}>
          <EmptyState
            icon="clipboard-list"
            eyebrow="Empty"
            title="Nothing in the request list"
            description="Tick a part on a figure's parts list, or add one from a search result, to build a quote request here."
            action={
              <Link href="/systems" className={styles.action}>
                <Icon name="layers" size="md" />
                Browse systems
              </Link>
            }
          />
        </div>
      </div>
    );
  }

  return (
    <div className={styles.screen}>
      {!submissionAvailable && <p role="status">Quote submission is unavailable while the request service is not connected. No request will be sent.</p>}
      {requestError && <p role="alert">{requestError}</p>}
      {submitError && <p role="alert">{submitError}</p>}
      <ZeroPriceNotice prices={lines.map(line => line.unitPriceSnapshot)} />
      {embedded ? null : (
      <div className={styles.bar}>
        <span className={styles.title}>Request a quote</span>
        <span className={styles.count}>
          {includedLines.length} of {lines.length}{" "}
          {lines.length === 1 ? "part" : "parts"} · {itemCount}{" "}
          {itemCount === 1 ? "piece" : "pieces"} · Fat Truck {machineName}
        </span>
      </div>
      )}

      <div className={styles.surface}>
        <div className={styles.scroller}>
          <table className={styles.table}>
            <thead>
              <tr className={styles.head}>
                <th scope="col" className={styles.tickHead}>
                  <input
                    type="checkbox"
                    className={styles.checkbox}
                    checked={allIncluded}
                    onChange={() => setAllIncluded(!allIncluded)}
                    aria-label="Include every part in the request"
                  />
                </th>
                <th scope="col" className={styles.noHead}>No.</th>
                <th scope="col" className={styles.partNoHead}>Part no.</th>
                <th scope="col">Description</th>
                <th scope="col" className={styles.qtyHead}>Qty</th>
                <th scope="col" className={styles.modelHead}>Model</th>
                <th scope="col" className={styles.serialHead}>Serial</th>
                <th scope="col" className={styles.systemHead}>System</th>
                <th scope="col" className={styles.pageHead}>Page</th>
                <th scope="col" className={styles.assemblyHead}>
                  Assembly name
                </th>
                <th scope="col" className={styles.commentHead}>
                  <span className="sr-only">Comment</span>
                </th>
              </tr>
            </thead>

            <tbody>
              {lines.map((line, index) => {
                const place = usage[line.partId];
                const on = isIncluded(line.partId);
                const noteOpen = openComments.has(line.partId);

                return (
                  <tr
                    key={line.partId}
                    className={styles.row}
                    data-active={on || undefined}
                  >
                    <td className={styles.tickCell}>
                      <input
                        type="checkbox"
                        className={styles.checkbox}
                        checked={on}
                        onChange={() => toggleIncluded(line.partId)}
                        aria-label={`Include ${line.partNumberSnapshot}`}
                      />
                    </td>
                    <td className={styles.no}>{index + 1}</td>
                    <th scope="row" className={styles.partNo}>
                      {line.partNumberSnapshot}
                    </th>
                    <td className={styles.description}>
                      {line.descriptionSnapshot}
                      {noteOpen ? (
                        <textarea
                          className={styles.note}
                          value={comments[line.partId] ?? ""}
                          onChange={(event) =>
                            setComments((current) => ({
                              ...current,
                              [line.partId]: event.target.value,
                            }))
                          }
                          placeholder={`Note about ${line.partNumberSnapshot}`}
                          rows={2}
                          aria-label={`Comment on ${line.partNumberSnapshot}`}
                        />
                      ) : null}
                    </td>
                    <td className={styles.qty}>
                      <input
                        type="number"
                        min={1}
                        className={styles.qtyInput}
                        value={line.qty}
                        onChange={(event) =>
                          updateQty(
                            line.partId,
                            Math.max(1, Number(event.target.value) || 1),
                          )
                        }
                        aria-label={`Quantity for ${line.partNumberSnapshot}`}
                      />
                    </td>
                    <td className={styles.model}>{place?.modelName ?? NONE}</td>
                    <td className={styles.serial}>{place?.serial ?? NONE}</td>
                    <td className={styles.system}>
                      {place?.systemName ?? NONE}
                    </td>
                    <td className={styles.page}>
                      {place?.figureId && place.groupNo ? (
                        <button
                          type="button"
                          className={styles.pageLink}
                          onClick={() =>
                            router.push(`/figures/${place.figureId}`)
                          }
                          title="Open this figure"
                        >
                          {formatFigureRef(place.groupNo)}
                        </button>
                      ) : (
                        NONE
                      )}
                    </td>
                    <td className={styles.assembly}>
                      {place?.assemblyName ?? NONE}
                    </td>
                    <td className={styles.commentCell}>
                      <button
                        type="button"
                        className={`${styles.rowButton} ${
                          comments[line.partId]?.trim() ? styles.rowButtonSet : ""
                        }`}
                        onClick={() => toggleComment(line.partId)}
                        aria-expanded={noteOpen}
                      >
                        Add comment
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <div className={styles.field}>
        <button
          type="button"
          className={styles.blockButton}
          onClick={() => setGeneralOpen((on) => !on)}
          aria-expanded={generalOpen}
        >
          Add general comments
        </button>
        <input
          className={styles.input}
          value={general}
          onChange={(event) => setGeneral(event.target.value)}
          onFocus={() => setGeneralOpen(true)}
          placeholder="Anything RUF Diamond should know about this request"
          aria-label="General comments"
        />
      </div>

      <div className={styles.field}>
        <button
          type="button"
          className={styles.blockButton}
          onClick={() => setEstimating(true)}
          aria-expanded={estimating}
          title="Enter a destination and choose a shipping method"
        >
          Estimate shipping cost
        </button>

        <div className={styles.addressField}>
          <input
            className={styles.input}
            value={address}
            onChange={(event) => setAddress(event.target.value)}
            disabled={!estimating}
            placeholder="Please enter the complete shipping address, including any available location details"
            aria-label="Shipping address"
          />
          {/* Offered only when there is actually one to offer. */}
          {estimating && savedAddress ? (
            <button
              type="button"
              className={styles.defaultAddress}
              onClick={() => setAddress(savedAddress)}
              title={savedAddress}
            >
              Use my default
              <br />
              shipping address
            </button>
          ) : null}
        </div>
      </div>

      {/* Indented to the field column: these read as the address's own
          follow-up, not as a second thing the Estimate button owns. */}
      <div className={styles.underField}>
        <span aria-hidden="true" />
        <div className={styles.shipping}>
          <fieldset
            className={styles.methods}
            disabled={!estimating}
            aria-describedby="shipping-note"
          >
            <legend className={styles.methodsTitle}>Shipping method</legend>
            <p className={styles.methodsHint}>
              Please select your preferred shipping method:
            </p>
            <label className={styles.radio}>
              <input
                type="radio"
                name="shipping"
                checked={method === "standard"}
                onChange={() => setMethod("standard")}
              />
              Standard shipping
            </label>
            <label className={styles.radio}>
              <input
                type="radio"
                name="shipping"
                checked={method === "expedited"}
                onChange={() => setMethod("expedited")}
              />
              Expedited shipping
            </label>
          </fieldset>

          <p className={styles.notice} id="shipping-note">
            <strong>Please note:</strong> This is an estimated shipping cost
            based on the information available at this stage. The actual cost
            may vary once the final package dimensions and weight are
            determined.
            {estimating && method && address.trim() ? (
              <span className={styles.estimate}>
                {" "}
                {method === "standard" ? "A standard" : "An expedited"} estimate
                will be confirmed with the quote.
              </span>
            ) : null}
          </p>
        </div>
      </div>

      <div className={styles.actions}>
        <button
          type="button"
          className={styles.primary}
          onClick={() =>
            onAddMoreParts ? onAddMoreParts() : router.push("/systems")
          }
        >
          Add more parts
        </button>
        {canSubmit && <button
          type="button"
          className={styles.primary}
          onClick={() => void onSubmit()}
          disabled={!submissionAvailable || includedLines.length === 0 || submitting}
          title={
            includedLines.length === 0
              ? "Tick at least one part"
              : "Send this request to RUF Diamond"
          }
        >
          {submitting ? "Submitting…" : "Submit quote request"}
        </button>}
      </div>
    </div>
  );
}
