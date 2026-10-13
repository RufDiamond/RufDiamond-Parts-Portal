import type { OrderLine } from "@/types/catalog";

/** Order Request — 12 Oct deck, p65–79. */

export type OrderType = "regular" | "urgent" | "schedule";

export type ShippingMethod = "purolator-ground" | "purolator-express" | "manitoulin";

export interface Address {
  firstName: string;
  lastName: string;
  company: string;
  address: string;
  city: string;
  province: string;
  country: string;
  postalCode: string;
  email: string;
  phone: string;
}

/** What the customer has entered so far. Kept whole while they move between sections. */
export interface OrderDraft {
  orderType: OrderType | null;
  /** ISO date; only read when the order type is "schedule". */
  scheduleDate: string;
  poNumber: string;
  /** A serial from the account's fleet, or "other" to type one. */
  vinChoice: string;
  vinOther: string;
  shippingMethod: ShippingMethod | null;
  shipping: Address;
  /** True: billing is the shipping address (p72, "Shipping Address is same as billing Address"). */
  billingSameAsShipping: boolean;
  billing: Address;
  instructions: string;
}

/** What the account already has on file, offered so the form starts filled. */
export interface AccountProfile {
  /** Serial numbers of the account's machines, for the VIN list (p67). */
  serials: string[];
  shipping: Address;
  billing: Address;
}

export interface SubmittedOrder {
  orderNo: string;
  submittedAt: string;
  draft: OrderDraft;
  lines: OrderLine[];
  /** Absent when the account may not see prices. */
  totals: { listTotal?: number; discountApplied?: number; netTotal?: number };
}
