import type { Address, OrderDraft, OrderType, ShippingMethod } from "@/types/checkout";

/** The five sections of the Order Request, in the order they unlock (p65–76). */
export const SECTIONS = ["type", "detail", "shipping", "addresses", "instructions"] as const;
export type Section = (typeof SECTIONS)[number];

export const ORDER_TYPES: { value: OrderType; label: string }[] = [
  { value: "regular", label: "Regular Order" },
  { value: "urgent", label: "Urgent Order" },
  { value: "schedule", label: "Schedule" },
];

export const SHIPPING_METHODS: { value: ShippingMethod; label: string }[] = [
  { value: "purolator-ground", label: "Purolator Ground" },
  { value: "purolator-express", label: "Purolator Express" },
  { value: "manitoulin", label: "Manitoulin Transport" },
];

export const PROVINCES = [
  "Alberta", "British Columbia", "Manitoba", "New Brunswick", "Newfoundland and Labrador",
  "Northwest Territories", "Nova Scotia", "Nunavut", "Ontario", "Prince Edward Island",
  "Quebec", "Saskatchewan", "Yukon",
];

export const emptyAddress = (): Address => ({
  firstName: "", lastName: "", company: "", address: "", city: "",
  province: "", country: "Canada", postalCode: "", email: "", phone: "",
});

export const emptyDraft = (): OrderDraft => ({
  orderType: null, scheduleDate: "", poNumber: "", vinChoice: "", vinOther: "",
  shippingMethod: null, shipping: emptyAddress(), billingSameAsShipping: false,
  billing: emptyAddress(), instructions: "",
});

/** p65: carriers apply to Regular and Urgent orders; a scheduled order is arranged by RUF Diamond. */
export const needsShippingMethod = (draft: OrderDraft) => draft.orderType !== "schedule";

export const vinOf = (draft: OrderDraft) =>
  (draft.vinChoice === "other" ? draft.vinOther : draft.vinChoice).trim();

export const billingOf = (draft: OrderDraft) =>
  draft.billingSameAsShipping ? draft.shipping : draft.billing;

const REQUIRED: (keyof Address)[] = ["firstName", "lastName", "address", "city", "province", "country", "postalCode", "email", "phone"];
const LABEL: Record<keyof Address, string> = {
  firstName: "first name", lastName: "last name", company: "company", address: "address", city: "city",
  province: "province", country: "country", postalCode: "postal code", email: "email", phone: "phone number",
};

/** The first thing wrong with an address, or null when it is complete. */
export function addressProblem(address: Address): string | null {
  const missing = REQUIRED.find((field) => !address[field].trim());
  if (missing) return `Enter the ${LABEL[missing]}.`;
  if (address.country.trim().toLowerCase() === "canada" &&
    !/^[A-Za-z]\d[A-Za-z] ?\d[A-Za-z]\d$/.test(address.postalCode.trim())) {
    return "Enter a Canadian postal code, e.g. P3A 5K8.";
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address.email.trim())) return "Enter a valid email address.";
  return null;
}

/**
 * What still needs doing in a section, or null when it is complete.
 *
 * Recomputed from the whole draft every time, so a change in an earlier
 * section that makes a later one wrong shows up there at once (p69).
 */
export function sectionProblem(section: Section, draft: OrderDraft, today: string): string | null {
  switch (section) {
    case "type":
      if (!draft.orderType) return "Choose an order type.";
      if (draft.orderType === "schedule") {
        if (!draft.scheduleDate) return "Choose the date the order should ship.";
        if (draft.scheduleDate <= today) return "A scheduled order needs a date after today.";
      }
      return null;
    case "detail":
      if (!draft.poNumber.trim()) return "Enter your PO number.";
      if (!vinOf(draft)) return draft.vinChoice === "other" ? "Enter the serial number." : "Choose the serial number.";
      return null;
    case "shipping":
      return needsShippingMethod(draft) && !draft.shippingMethod ? "Choose a shipping method." : null;
    case "addresses": {
      const shipping = addressProblem(draft.shipping);
      if (shipping) return `Shipping address: ${shipping}`;
      const billing = draft.billingSameAsShipping ? null : addressProblem(draft.billing);
      return billing ? `Billing address: ${billing}` : null;
    }
    case "instructions":
      return null;
  }
}

/** "00001" — the deck's order number format (p78). */
export const formatOrderNo = (sequence: number) => String(sequence).padStart(5, "0");

/** Pricing Disclaimer & Order Terms, as p78 words them. `strong` marks the deck's bold. */
export const ORDER_TERMS: { title: string; parts: { text: string; strong?: boolean }[] }[] = [
  {
    title: "Pricing",
    parts: [
      { text: "We make every effort to keep our parts pricing accurate and up to date. However, " },
      { text: "prices are subject to change without prior notice", strong: true },
      { text: " due to supplier price adjustments and market conditions. Every order is reviewed before processing, and if a price change affects your order, we will contact you for approval before proceeding. Please note that recent trade volatility between Canada and the United States has affected supply chain costs, which may result in unexpected price changes. While these circumstances are beyond our control, Ruf Diamond is committed to complete transparency and will always communicate any pricing adjustments before finalizing your order." },
    ],
  },
  {
    title: "Critical Parts Orders",
    parts: [{ text: "For critical or urgent parts requests, please email parts@rufdiamond.com and include all relevant information, such as the vehicle VIN, part numbers, quantities, and a description of your requirements." }],
  },
  {
    title: "Tire & Rim Assemblies",
    parts: [
      { text: "When ordering a tire and rim assembly, please specify whether " },
      { text: "you would like the tire to be mounted on the rim prior to shipment", strong: true },
      { text: "." },
    ],
  },
  {
    title: "Order Inspection",
    parts: [
      { text: "Upon receiving your shipment, please inspect the contents immediately and verify that they match both the packing slip and your original order. Any discrepancies, shortages, or shipping damage must be reported to Ruf Diamond within " },
      { text: "24 hours", strong: true },
      { text: " of delivery." },
    ],
  },
  {
    title: "Returns & Cancellations",
    parts: [
      { text: "All returns and order cancellations are subject to a " },
      { text: "50% restocking fee", strong: true },
      { text: ". Returns must receive prior approval from the manufacturer and be requested within " },
      { text: "30 days", strong: true },
      { text: " of receipt. Please note that certain non-returnable items—including, but not limited to, glass, acrylic components, lamps, and selected electronic parts—may not be eligible for return. Return shipping costs are the responsibility of the Dealer." },
    ],
  },
  {
    title: "Back Orders & Partial Shipments",
    parts: [{ text: "If one or more items are on back order, Ruf Diamond reserves the right to ship available items separately to minimize delays." }],
  },
];
