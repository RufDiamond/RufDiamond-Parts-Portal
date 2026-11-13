import { Checkout } from "./Checkout";

/** The Order Request — 12 Oct deck, p65–79. Reached from Checkout on the cart. */
export default async function CheckoutPage() {
  // Today in Ontario, so a scheduled date is judged where the parts ship from.
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "America/Toronto" });
  return <Checkout today={today} />;
}
