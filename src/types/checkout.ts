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
  /** Typed by the customer on every order (14 Oct): no list to pick from without checking. */
  vin: string;
  shippingMethod: ShippingMethod | null;
  shipping: Address;
  /** True: billing is the shipping address (p72, "Shipping Address is same as billing Address"). */
  billingSameAsShipping: boolean;
  billing: Address;
  /** "Save this new address" — offered whenever an address is being entered (14 Oct). */
  saveShipping: boolean;
  saveBilling: boolean;
  instructions: string;
}

/** The addresses the account last chose to save; the next order starts from these. */
export interface SavedAddresses {
  shipping: Address | null;
  billing: Address | null;
}

export interface SubmittedOrder {
  orderNo: string;
  submittedAt: string;
  draft: OrderDraft;
  lines: OrderLine[];
  /** Absent when the account may not see prices. */
  totals: { listTotal?: number; discountApplied?: number; netTotal?: number };
}
