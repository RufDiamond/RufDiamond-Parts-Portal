"use client";

import Image from "next/image";
import type { RequestConfirmation } from "@/state/RequestContext";
import type { PartUsageSummary } from "@/types/catalog";
import styles from "./document.module.css";

export type QuoteDocumentVariant = "factory" | "customer";

export interface QuoteDocumentProps {
  variant: QuoteDocumentVariant;
  confirmation: RequestConfirmation;
  /** Where each part is used, for the vehicle serial column. */
  usage: Record<string, PartUsageSummary>;
}

/** A field the pilot has no data for yet, printed as the deck brackets it. */
const PENDING = "—";

/**
 * One Quote Request document — slide 53.
 *
 * Submitting produces TWO of these from the same request and the same
 * sequential number: one addressed to the Factory, one to the dealer. They
 * carry identical parts and notes and differ only in the head — the factory
 * copy names RUF Diamond as the requestor, the dealer copy names the customer.
 */
export function QuoteDocument({
  variant,
  confirmation,
  usage,
}: QuoteDocumentProps) {
  const { details, lines, reference, submittedAt } = confirmation;
  const factory = variant === "factory";

  /*
   * The brand the reader was browsing when they submitted, falling back to
   * what the parts themselves belong to — a request assembled from search
   * results carries no selected machine, and the documents still need a Brand.
   */
  const brand =
    details.brand ??
    lines
      .map((line) => usage[line.partId]?.productLineName)
      .find((name): name is string => Boolean(name)) ??
    null;

  const date = new Date(submittedAt).toLocaleDateString("en-CA", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  return (
    <article className={styles.sheet} data-quote-doc>
      <header className={styles.head}>
        {factory ? (
          <Image
            src="/brand/crop-logo.png"
            alt="RUFDIAMOND"
            width={300}
            height={58}
            className={styles.logo}
          />
        ) : (
          /* The dealer's own mark goes here; the deck leaves it a placeholder
             because it differs per dealer. */
          <span className={styles.dealerLogo}>Dealer logo</span>
        )}

        <div className={styles.addressed}>
          <p className={styles.docTitle}>
            {factory ? "Factory quote request" : "Quote request"}
          </p>
          {factory ? (
            <p className={styles.line}>
              <span className={styles.label}>Requestor:</span> RUF DIAMOND LTD.
            </p>
          ) : (
            <>
              <p className={styles.line}>
                <span className={styles.label}>Customer / User:</span>{" "}
                {confirmation.companyName ?? PENDING}
              </p>
              <p className={styles.line}>
                <span className={styles.label}>Company:</span>{" "}
                {confirmation.companyName ?? PENDING}
              </p>
              <p className={styles.line}>
                <span className={styles.label}>Email:</span> {PENDING}
              </p>
              <p className={styles.line}>
                <span className={styles.label}>Phone:</span> {PENDING}
              </p>
            </>
          )}
          {/*
            On BOTH documents: slide 53 requires the same sequential number to
            appear on the factory and the dealer copy, so the two can be
            matched to each other later.
          */}
          <p className={styles.line}>
            <span className={styles.label}>Quote Request No.:</span>{" "}
            <span className={styles.reference}>{reference}</span>
          </p>
          <p className={styles.line}>
            <span className={styles.label}>Date:</span> {date}
          </p>
        </div>
      </header>

      <p className={styles.intro}>
        Please provide a quotation for the following parts for:
        <br />
        <span className={styles.label}>Brand:</span> {brand ?? PENDING}
      </p>

      <h2 className={styles.sectionTitle}>Parts requested</h2>
      <table className={styles.table}>
        <thead>
          <tr>
            <th scope="col">Part number</th>
            <th scope="col">Description</th>
            <th scope="col">Quantity</th>
            <th scope="col">Unit of measure</th>
            <th scope="col">Vehicle serial number</th>
            <th scope="col">Comments</th>
          </tr>
        </thead>
        <tbody>
          {lines.map((line) => (
            <tr key={line.partId}>
              <td className={styles.mono}>{line.partNumberSnapshot}</td>
              <td>{line.descriptionSnapshot}</td>
              <td className={styles.centre}>{line.qty}</td>
              {/* The export carries no unit of measure; every part is priced
                  each until the factory says otherwise. */}
              <td className={styles.centre}>Unit</td>
              <td className={styles.mono}>
                {details.serial ?? usage[line.partId]?.serial ?? PENDING}
              </td>
              <td>{details.comments[line.partId]?.trim() || ""}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <h3 className={styles.noteTitle}>Note 1 — General comments</h3>
      <p className={styles.note}>
        {details.generalComment.trim() || "None supplied."}
      </p>

      <h3 className={styles.noteTitle}>Note 2 — Availability</h3>
      <p className={styles.note}>
        Please confirm the availability of each requested part and indicate
        whether any part is currently on back order.
      </p>

      {/*
        Printed only when an estimate was actually requested. Slide 53 is
        explicit that the section is omitted otherwise, not left blank.
      */}
      {details.shipping ? (
        <>
          <h3 className={`${styles.noteTitle} ${styles.shippingTitle}`}>
            Shipping cost estimate
          </h3>
          <p className={styles.note}>
            <span className={styles.shippingLead}>
              Please provide a shipping cost estimate to the following address:
            </span>
            <br />
            {details.shipping.address || PENDING}
            {details.shipping.method ? (
              <>
                <br />
                <span className={styles.label}>Method:</span>{" "}
                {details.shipping.method === "standard"
                  ? "Standard shipping"
                  : "Expedited shipping"}
              </>
            ) : null}
          </p>
        </>
      ) : null}

      <p className={styles.close}>
        Thank you for your attention. We look forward to receiving your
        quotation and availability confirmation.
      </p>
      <p className={styles.signoff}>
        Respectfully,
        <br />
        <strong>RUF DIAMOND TEAM</strong>
      </p>
    </article>
  );
}
