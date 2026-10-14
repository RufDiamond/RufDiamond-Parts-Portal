import type { Company } from "@/types/catalog";

/**
 * RUF Diamond's current dealers, as the supervisor listed them on 14 Oct.
 * Dealers receive 10% off; individual customers receive no discount. The rate
 * is held per account so a new dealer can be given a different one.
 *
 * Local demonstration data only: connected pages take the company, and its
 * rate, from the signed-in session.
 */
export const DEALERS: Company[] = [
  { id: "co-savage", name: "Savage Equipment", type: "dealer", discountRate: 0.1, defaultShippingAddress: null },
  { id: "co-total-rentals", name: "Total Rentals", type: "dealer", discountRate: 0.1, defaultShippingAddress: null },
  { id: "co-kr-industrial", name: "K&R Industrial Off-Road", type: "dealer", discountRate: 0.1, defaultShippingAddress: null },
  { id: "co-miikana-north", name: "Miikana North", type: "dealer", discountRate: 0.1, defaultShippingAddress: null },
  { id: "co-loch-lomond", name: "Loch Lomond Equipment Sales", type: "dealer", discountRate: 0.1, defaultShippingAddress: null },
];

/** The account the local demonstration signs in as. */
export const DEMO_COMPANY: Company = DEALERS[0];
