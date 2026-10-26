"use client";

import Link from "next/link";
import { useEffect, useMemo, useReducer, useState } from "react";
import { EmptyState } from "@/components";
import {
  ORDER_TERMS, ORDER_TYPES, PROVINCES, SECTIONS, SHIPPING_METHODS, addressProblem, billingOf,
  emptyDraft, formatOrderNo, needsShippingMethod, readSavedAddresses, saveAddressesFrom, sectionProblem, vinOf,
  type Section,
} from "@/lib/checkout";
import { formatAmount } from "@/lib/format";
import { createQuoteApi } from "@/state/quote-api";
import { computeTotals, useRequest } from "@/state/RequestContext";
import { useCustomerSession } from "@/state/SessionBoundary";
import type { Address, OrderDraft, SubmittedOrder } from "@/types/checkout";
import styles from "./checkout.module.css";

export const DRAFT_STORAGE_KEY = "rdpp:order-draft:v1";
export const ORDER_STORAGE_KEY = "rdpp:last-order:v1";
export const ORDER_SEQUENCE_KEY = "rdpp:order-sequence:v1";

const TITLES: Record<Section, string> = {
  type: "Order type",
  detail: "Order type detail",
  shipping: "Shipping method",
  addresses: "Shipping and billing address",
  instructions: "Special instructions",
};

function read<T>(key: string): T | null {
  try {
    const raw = sessionStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function write(key: string, value: unknown) {
  try {
    if (value === null) sessionStorage.removeItem(key);
    else sessionStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Persistence is a convenience; never let it break the order.
  }
}

/** The next order number. Local to this browser until an order service exists. */
function nextOrderNo(): string {
  let sequence = 1;
  try {
    sequence = Number(localStorage.getItem(ORDER_SEQUENCE_KEY) ?? "0") + 1;
    localStorage.setItem(ORDER_SEQUENCE_KEY, String(sequence));
  } catch {
    // Without storage every order is 00001; acceptable for a local demonstration.
  }
  return formatOrderNo(sequence);
}

/** The parts of the checkout that survive a refresh. */
interface Saved {
  draft: OrderDraft;
  /** Index of the furthest section opened. */
  reached: number;
  submitted: SubmittedOrder | null;
  hydrated: boolean;
}

type SavedAction =
  | { type: "hydrate"; stored: { draft: OrderDraft; reached: number } | null; fresh: OrderDraft; submitted: SubmittedOrder | null }
  | { type: "update"; patch: Partial<OrderDraft> }
  | { type: "reach"; index: number }
  | { type: "submitted"; order: SubmittedOrder | null }
  | { type: "reset"; draft: OrderDraft };

function savedReducer(state: Saved, action: SavedAction): Saved {
  switch (action.type) {
    case "hydrate":
      return {
        ...state,
        hydrated: true,
        submitted: action.submitted,
        // A draft saved by an older version may lack newer fields; fill them in.
        ...(action.stored
          ? { draft: { ...action.fresh, ...action.stored.draft }, reached: Math.min(action.stored.reached, SECTIONS.length - 1) }
          : { draft: action.fresh }),
      };
    case "update":
      return { ...state, draft: { ...state.draft, ...action.patch } };
    case "reach":
      return { ...state, reached: Math.max(state.reached, action.index) };
    case "submitted":
      return { ...state, submitted: action.order };
    case "reset":
      return { ...state, draft: action.draft, reached: 0, submitted: null };
  }
}

function AddressLines({ address }: { address: Address }) {
  return (
    <>
      <strong>{address.firstName} {address.lastName}</strong>
      {address.company ? <strong>{address.company}</strong> : null}
      <span>{address.address}</span>
      <span>{address.city}, {address.province}, {address.country} - {address.postalCode}</span>
      <span>{address.email}</span>
      <span>{address.phone}</span>
    </>
  );
}

const FIELDS: { key: keyof Address; label: string; type?: string; autoComplete: string }[] = [
  { key: "firstName", label: "First Name", autoComplete: "given-name" },
  { key: "lastName", label: "Last Name", autoComplete: "family-name" },
  { key: "company", label: "Company", autoComplete: "organization" },
  { key: "address", label: "Address", autoComplete: "street-address" },
  { key: "city", label: "City", autoComplete: "address-level2" },
  { key: "province", label: "Province", autoComplete: "address-level1" },
  { key: "country", label: "Country", autoComplete: "country-name" },
  { key: "postalCode", label: "Postal Code", autoComplete: "postal-code" },
  { key: "email", label: "Email", type: "email", autoComplete: "email" },
  { key: "phone", label: "Phone No.", type: "tel", autoComplete: "tel" },
];

function AddressForm({ kind, address, onChange }: {
  kind: "shipping" | "billing";
  address: Address;
  onChange: (next: Address) => void;
}) {
  return (
    <div className={styles.addressForm}>
      {FIELDS.map((field) => {
        const id = `${kind}-${field.key}`;
        return (
          <label key={field.key} className={styles.field} htmlFor={id}>
            <span>{field.label}:</span>
            {field.key === "province" ? (
              <select id={id} value={address.province} autoComplete={field.autoComplete}
                onChange={(event) => onChange({ ...address, province: event.target.value })}>
                <option value="">Select…</option>
                {PROVINCES.map((province) => <option key={province}>{province}</option>)}
                {address.province && !PROVINCES.includes(address.province) ? <option>{address.province}</option> : null}
              </select>
            ) : (
              <input id={id} type={field.type ?? "text"} value={address[field.key]} autoComplete={field.autoComplete}
                onChange={(event) => onChange({ ...address, [field.key]: event.target.value })} />
            )}
          </label>
        );
      })}
    </div>
  );
}

/**
 * The Order Request — 12 Oct deck, p65–79.
 *
 * Five sections open one after another; a finished one turns green. Every
 * section stays editable and nothing entered is lost by going back. Each
 * section's state is worked out from the whole draft, so a change that makes
 * a later section wrong turns that section orange again with the reason (p69).
 * The last step is the review with the order terms, then Submit.
 */
export function Checkout({ today }: { today: string }) {
  const session = useCustomerSession();
  const quoteApi = useMemo(() => (session ? createQuoteApi(session.csrfToken) : null), [session]);
  const { lines, currency, discountRate, clear, linesHydrated, company } = useRequest();
  const companyId = company?.id ?? session?.companyId ?? "guest";
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  /** A new order, starting from the addresses this account last saved. */
  const fresh = () => emptyDraft(readSavedAddresses(companyId));
  const [saved, dispatch] = useReducer(savedReducer, undefined, () => ({ draft: emptyDraft(), reached: 0, submitted: null, hydrated: false }));
  const { draft, reached, submitted, hydrated } = saved;
  const [tried, setTried] = useState<ReadonlySet<Section>>(new Set());
  const [editing, setEditing] = useState({ shipping: false, billing: false });
  const [view, setView] = useState<"form" | "review">("form");
  const [announce, setAnnounce] = useState(false);

  // A refresh mid-order must not lose what was typed. Read after mount.
  useEffect(() => {
    dispatch({ type: "hydrate", stored: read(DRAFT_STORAGE_KEY), fresh: emptyDraft(readSavedAddresses(companyId)), submitted: read<SubmittedOrder>(ORDER_STORAGE_KEY) });
  }, [companyId]);
  useEffect(() => {
    if (hydrated && !submitted) write(DRAFT_STORAGE_KEY, { draft, reached });
  }, [hydrated, submitted, draft, reached]);

  const update = (patch: Partial<OrderDraft>) => dispatch({ type: "update", patch });
  const problems = useMemo(
    () => Object.fromEntries(SECTIONS.map((section) => [section, sectionProblem(section, draft, today)])) as Record<Section, string | null>,
    [draft, today],
  );
  const totals = useMemo(() => computeTotals(lines, discountRate), [lines, discountRate]);

  const advance = (index: number) => {
    const section = SECTIONS[index];
    setTried((current) => new Set(current).add(section));
    if (problems[section]) return;
    if (index === SECTIONS.length - 1) {
      const first = SECTIONS.findIndex((item) => problems[item]);
      if (first === -1) setView("review");
      return;
    }
    dispatch({ type: "reach", index: index + 1 });
  };

  const submit = async () => {
    if (session && !session.capabilities.includes("orders.submit")) return;
    if (SECTIONS.some((section) => problems[section]) || lines.length === 0) return;
    setSubmitError(null);
    let orderNo = nextOrderNo();
    if (quoteApi) {
      setSubmitting(true);
      try {
        if (!draft.orderType) throw new Error("Choose an order type before submitting.");
        const result = await quoteApi.submitCommerceOrder({
          orderType: draft.orderType,
          scheduleDate: draft.orderType === "schedule" ? draft.scheduleDate || null : null,
          poNumber: draft.poNumber.trim(),
          vin: vinOf(draft),
          shippingMethod: draft.orderType === "schedule" ? null : draft.shippingMethod,
          shipping: draft.shipping,
          billing: billingOf(draft),
          instructions: draft.instructions,
          currency,
          lines: lines.map((line) => {
            if (line.quoteLineId) {
              return {
                kind: "quote" as const,
                quoteLineId: line.quoteLineId,
                ...(line.quoteLineVersion ? { expectedVersion: line.quoteLineVersion } : {}),
                qty: line.qty,
              };
            }
            if (!line.releaseId || !line.releasePartId) {
              throw new Error("Reload the catalogue part before ordering. Its release is not on this line.");
            }
            return {
              kind: "catalogue" as const,
              releaseId: line.releaseId,
              releasePartId: line.releasePartId,
              qty: line.qty,
            };
          }),
        });
        orderNo = result.reference;
      } catch (error) {
        setSubmitError(error instanceof Error ? error.message : "Order submit failed.");
        setSubmitting(false);
        return;
      }
      setSubmitting(false);
    }
    const order: SubmittedOrder = {
      orderNo,
      submittedAt: new Date().toISOString(),
      draft,
      lines,
      totals,
    };
    write(ORDER_STORAGE_KEY, order);
    saveAddressesFrom(companyId, draft);
    write(DRAFT_STORAGE_KEY, null);
    clear();
    dispatch({ type: "submitted", order });
    setAnnounce(true);
  };

  const startOver = () => {
    write(ORDER_STORAGE_KEY, null);
    dispatch({ type: "reset", draft: fresh() });
    setTried(new Set());
    setView("form");
  };

  if (session && !session.capabilities.includes("orders.submit")) {
    return <main className={styles.empty}><h1>Order access</h1><p>Your role can build requests. A purchaser must submit quotes and orders.</p><Link href="/request">View request list</Link></main>;
  }
  if (!hydrated || !linesHydrated) return null;

  if (!submitted && lines.length === 0) {
    return (
      <div className={styles.empty}>
        <EmptyState title="Your cart is empty" description="Add parts to the cart, then choose Checkout to place an order."
          action={<Link href="/">Find parts</Link>} />
      </div>
    );
  }

  if (submitted || view === "review") {
    const order = submitted ?? { orderNo: null, draft, lines, totals };
    const shownTotals = order.totals;
    const billing = billingOf(order.draft);
    const type = ORDER_TYPES.find((item) => item.value === order.draft.orderType)?.label ?? "";
    const via = SHIPPING_METHODS.find((item) => item.value === order.draft.shippingMethod)?.label;
    const money = shownTotals.netTotal !== undefined;
    return (
      <div className={styles.review}>
        <section className={styles.summary} aria-labelledby="order-heading">
          <h1 id="order-heading" className={styles.orderTitle}>
            {order.orderNo ? `Order No: ${order.orderNo}` : "Order Confirmation"}
          </h1>
          {submitted ? (
            <p className={styles.localNote} role="note">
              Recorded in this browser only. The order service is not connected yet, so this order has not been sent to RUF Diamond.
            </p>
          ) : null}

          <h2 className={styles.blockTitle}>Billing Address</h2>
          <p className={styles.address}><AddressLines address={billing} /></p>

          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th scope="col">Item</th>
                  <th scope="col">Part No.</th>
                  <th scope="col">Part Name</th>
                  <th scope="col">Confirm Qty.</th>
                  {money ? <><th scope="col">Unit Price ({currency})</th><th scope="col">Subtotal Price ({currency})</th></> : null}
                </tr>
              </thead>
              <tbody>
                {order.lines.map((line, index) => (
                  <tr key={line.partId}>
                    <td className={styles.num}>{index + 1}</td>
                    <td className={styles.mono}>{line.partNumberSnapshot}</td>
                    <td>{line.descriptionSnapshot}</td>
                    <td className={styles.num}>{line.qty}</td>
                    {money ? <>
                      <td className={styles.money}>$ {formatAmount(line.unitPriceSnapshot, currency)}</td>
                      <td className={styles.money}>$ {formatAmount(line.lineTotal, currency)}</td>
                    </> : null}
                  </tr>
                ))}
              </tbody>
              {money ? (
                <tfoot>
                  {/* No discount line for an account without one — individual customers (14 Oct). */}
                  {shownTotals.discountApplied ? <>
                    <tr><th scope="row" colSpan={5}>Subtotal ({currency})</th><td className={styles.money}>$ {formatAmount(shownTotals.listTotal, currency)}</td></tr>
                    <tr><th scope="row" colSpan={5}>Discount</th><td className={styles.money}>$ {formatAmount(shownTotals.discountApplied, currency)}</td></tr>
                  </> : null}
                  <tr className={styles.total}><th scope="row" colSpan={5}>Total</th><td className={styles.money}>$ {formatAmount(shownTotals.netTotal, currency)}</td></tr>
                </tfoot>
              ) : null}
            </table>
          </div>
          <p className={styles.taxNote}>Prices exclude taxes.</p>

          {order.draft.instructions.trim() ? (
            <>
              <h2 className={styles.blockTitle}>Special Instructions:</h2>
              <p className={styles.instructions}>{order.draft.instructions}</p>
            </>
          ) : null}

          <h2 className={styles.blockTitle}>Shipping Address</h2>
          <p className={styles.address}><AddressLines address={order.draft.shipping} /></p>

          <p className={styles.orderFacts}>
            <strong>{type.toUpperCase()}</strong>
            {order.draft.orderType === "schedule" ? <strong>Ship on: {order.draft.scheduleDate}</strong> : null}
            {needsShippingMethod(order.draft) && via ? <strong>Via: {via}</strong> : null}
            <span>PO: {order.draft.poNumber}</span>
            <span>VIN: {vinOf(order.draft)}</span>
          </p>

          <div className={styles.reviewActions}>
            {submitted ? (
              <>
                <Link href="/" className={styles.back}>Home</Link>
                <button type="button" className={styles.submit} onClick={startOver}>New order</button>
              </>
            ) : (
              <>
                <button type="button" className={styles.back} onClick={() => setView("form")}>Back</button>
                {submitError ? <p role="alert">{submitError}</p> : null}
                <button type="button" className={styles.submit} onClick={() => void submit()} disabled={submitting}>
                  {submitting ? "Submitting…" : "Submit"}
                </button>
              </>
            )}
          </div>
        </section>

        <section className={styles.terms} aria-labelledby="terms-heading">
          <h2 id="terms-heading" className={styles.termsTitle}>Pricing Disclaimer &amp; Order Terms</h2>
          <ol>
            {ORDER_TERMS.map((term) => (
              <li key={term.title}>
                <h3>{term.title}</h3>
                <p>{term.parts.map((part, index) => part.strong ? <strong key={index}>{part.text}</strong> : <span key={index}>{part.text}</span>)}</p>
              </li>
            ))}
          </ol>
        </section>

        {announce ? (
          <div className={styles.overlay} role="dialog" aria-modal="true" aria-label="Order Confirmation" onClick={() => setAnnounce(false)}>
            <div className={styles.dialog} onClick={(event) => event.stopPropagation()}>
              <p className={styles.dialogTitle}>Order Confirmation</p>
              <p role="status">Your order has been submitted successfully.</p>
              <button type="button" className={styles.ok} onClick={() => setAnnounce(false)} autoFocus>OK</button>
            </div>
          </div>
        ) : null}
      </div>
    );
  }

  const stateOf = (index: number) => {
    const section = SECTIONS[index];
    if (index < reached) return problems[section] ? "attention" : "complete";
    return "current";
  };
  const messageOf = (index: number) => {
    const section = SECTIONS[index];
    return problems[section] && (index < reached || tried.has(section)) ? problems[section] : null;
  };

  const sectionShell = (index: number, body: React.ReactNode, className = "") => {
    const section = SECTIONS[index];
    const last = index === SECTIONS.length - 1;
    const message = messageOf(index);
    return (
      <section key={section} className={`${styles.section} ${className}`} data-state={stateOf(index)} aria-labelledby={`${section}-title`}>
        <div className={styles.sectionBody}>
          <h2 id={`${section}-title`} className={styles.sectionTitle}>{TITLES[section]}</h2>
          {body}
          {message ? <p className={styles.problem} role="alert">{message}</p> : null}
        </div>
        {index === reached || last ? (
          <button type="button" className={styles.next} onClick={() => advance(index)}
            aria-label={last ? "Review order" : `Continue to ${TITLES[SECTIONS[index + 1]].toLowerCase()}`}
            title={last ? "Review order" : "Continue"}>
            <span aria-hidden="true">➜</span>
          </button>
        ) : null}
      </section>
    );
  };

  const visible = (section: Section) => SECTIONS.indexOf(section) <= reached;

  return (
    <form className={styles.form} onSubmit={(event) => event.preventDefault()} aria-label="Order request">
      <div className={styles.row}>
        {sectionShell(0, (
          <fieldset className={styles.choices}>
            <legend className={styles.hidden}>Order type</legend>
            {ORDER_TYPES.map((type) => (
              <div key={type.value} className={styles.choiceRow}>
                <label className={styles.choice}>
                  <input type="radio" name="order-type" checked={draft.orderType === type.value}
                    onChange={() => update({ orderType: type.value })} />
                  {type.label}
                </label>
                {type.value === "schedule" ? (
                  <input type="date" className={styles.date} aria-label="Scheduled ship date" value={draft.scheduleDate}
                    min={today} disabled={draft.orderType !== "schedule"}
                    onChange={(event) => update({ scheduleDate: event.target.value })} />
                ) : null}
              </div>
            ))}
            {draft.orderType === "schedule" ? (
              <p className={styles.hint}>RUF Diamond will be reminded to schedule this order in advance.</p>
            ) : null}
          </fieldset>
        ))}

        {visible("detail") ? sectionShell(1, (
          <div className={styles.detail}>
            <label className={styles.field} htmlFor="po-number">
              <span>PO No.:</span>
              <input id="po-number" value={draft.poNumber} placeholder="Please enter PO No."
                onChange={(event) => update({ poNumber: event.target.value })} />
            </label>
            <label className={styles.field} htmlFor="vin">
              <span>VIN No.:</span>
              <input id="vin" value={draft.vin} placeholder="Please enter VIN No." autoComplete="off"
                onChange={(event) => update({ vin: event.target.value.toUpperCase() })} />
            </label>
            <p className={styles.hint}>Type the serial number of the machine these parts are for. Some parts differ by VIN.</p>
          </div>
        )) : null}

        {visible("shipping") ? sectionShell(2, needsShippingMethod(draft) ? (
          <fieldset className={styles.choices}>
            <legend className={styles.hidden}>Shipping method</legend>
            {SHIPPING_METHODS.map((method) => (
              <label key={method.value} className={styles.choice}>
                <input type="radio" name="shipping-method" checked={draft.shippingMethod === method.value}
                  onChange={() => update({ shippingMethod: method.value })} />
                {method.label}
              </label>
            ))}
          </fieldset>
        ) : (
          <p className={styles.hint}>
            Not needed for a scheduled order — RUF Diamond arranges shipping.
            {draft.shippingMethod ? " Your earlier choice is kept if you switch back." : ""}
          </p>
        )) : null}
      </div>

      {visible("addresses") ? sectionShell(3, (
        <div className={styles.addresses}>
          {(["shipping", "billing"] as const).map((kind) => {
            const address = kind === "billing" && draft.billingSameAsShipping ? draft.shipping : draft[kind];
            const showForm = kind === "shipping" || !draft.billingSameAsShipping
              ? editing[kind] || addressProblem(address) !== null
              : false;
            return (
              <div key={kind} className={styles.addressCard}>
                <h3 className={styles.addressTitle}>{kind === "shipping" ? "Shipping Address" : "Billing Address"}</h3>
                {showForm ? (
                  <>
                    <AddressForm kind={kind} address={address} onChange={(next) => update({ [kind]: next })} />
                    <label className={styles.same}>
                      <input type="checkbox" checked={kind === "shipping" ? draft.saveShipping : draft.saveBilling}
                        onChange={(event) => update(kind === "shipping" ? { saveShipping: event.target.checked } : { saveBilling: event.target.checked })} />
                      Save this new address
                    </label>
                  </>
                ) : (
                  <p className={styles.address}><AddressLines address={address} /></p>
                )}
                {kind === "shipping" ? (
                  <label className={styles.same}>
                    <input type="checkbox" checked={draft.billingSameAsShipping}
                      onChange={(event) => update({ billingSameAsShipping: event.target.checked })} />
                    Shipping address is same as billing address
                  </label>
                ) : null}
                {kind === "billing" && draft.billingSameAsShipping ? null : (
                  <button type="button" className={styles.update}
                    onClick={() => setEditing((current) => ({ ...current, [kind]: !current[kind] }))}
                    disabled={showForm && addressProblem(address) !== null}>
                    {editing[kind] ? "Done" : kind === "shipping" ? "Update Shipping Address" : "Update Billing Address"}
                  </button>
                )}
              </div>
            );
          })}
        </div>
      ), styles.wide) : null}

      {visible("instructions") ? sectionShell(4, (
        <textarea className={styles.textarea} aria-label="Special instructions" value={draft.instructions}
          placeholder="Please enter any special request or instructions or comments here."
          onChange={(event) => update({ instructions: event.target.value })} />
      ), styles.wide) : null}
    </form>
  );
}
