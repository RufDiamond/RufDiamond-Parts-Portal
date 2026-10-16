/**
 * Quote Status — 12 Oct deck, p54–59.
 *
 * A customer's quote request is registered line by line. The RUF Diamond
 * administrator then fills each line in from the factory's emailed quotation.
 * The administrator's record and the customer's view are deliberately two
 * types: Factory Price exists only on the first, so it cannot reach a
 * customer's screen by accident.
 */

export type Availability = "yes" | "partial" | "no";

/** One line of the administrator's Quote Status table (p58). */
export interface QuoteStatusRecord {
  id: string;
  /** The account that asked. Customers only ever see their own. */
  companyId: string;
  productLine: "Fat Truck" | "IronHorse" | "Agilis";
  /** Shared by every line of one request, e.g. "RD-00001". */
  quoteNo: string;
  /** ISO date the request was submitted — prices run 30 days from here. */
  requestDate: string;
  /** The account's company name, shown in full in the Customer column (14 Oct). */
  customer: string;
  user: string;
  /**
   * What the customer asked for. Null on a line the factory added to the
   * quotation that was never requested (p58, the row under row 3).
   */
  requested: { partNumber: string; description: string; qty: number } | null;
  /** The catalogue part, when the requested part is in the portal's catalogue. */
  catalogPartId: string | null;

  /* Filled in by the administrator from the factory's reply. */
  responseDate: string | null;
  available: Availability | null;
  /** ISO date. */
  estAvailability: string | null;
  /** The part number the factory quoted — may differ from the one requested. */
  newPartNumber: string | null;
  newDescription: string | null;
  newQty: number | null;
  /** What the factory charges RUF Diamond. Administrator only, never shown to customers. */
  factoryPrice: string | null;
  /** What RUF Diamond offers the customer, per unit, as a decimal string. */
  customerPrice: string | null;
  comments: string;
  /** Set once the administrator has released the response to the customer. */
  notifyCustomer: boolean;

  model: string;
  serialNumber: string;
  system: string;
  /** Figure reference, e.g. "FIG 3.1". */
  figure: string;
  assemblyName: string;
}

/** One line of the customer's Quote Status table (p59). */
export interface CustomerQuoteLine {
  id: string;
  quoteNo: string;
  requestDate: string;
  customer: string;
  user: string;
  partNumber: string | null;
  description: string | null;
  qty: number | null;
  /** Null until RUF Diamond has responded and notified the customer. */
  response: {
    available: Availability | null;
    estAvailability: string | null;
    newPartNumber: string | null;
    newDescription: string | null;
    newQty: number | null;
    unitPrice: string | null;
    totalPrice: string | null;
    comments: string;
  } | null;
  /** ISO date: requestDate + 30 days. */
  priceValidUntil: string;
  expired: boolean;
  /**
   * What a fresh quote for this line would ask for. Set once an answered line
   * has expired, so the customer can request a new quotation (14 Oct).
   */
  requote: {
    productLine: QuoteStatusRecord["productLine"];
    partNumber: string;
    description: string;
    qty: number;
    catalogPartId: string | null;
    model: string;
    serialNumber: string;
    system: string;
    figure: string;
    assemblyName: string;
  } | null;
  /** What would go on the cart. Null when the line cannot be ordered as it stands. */
  orderable: {
    partNumber: string;
    description: string;
    qty: number;
    unitPrice: string;
    catalogPartId: string | null;
  } | null;
}
