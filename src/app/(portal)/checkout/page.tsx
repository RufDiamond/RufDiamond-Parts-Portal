import { getAccountProfile } from "@/data/account-profile.server";
import { Pending } from "../Pending";
import { Checkout } from "./Checkout";

/** The Order Request — 12 Oct deck, p65–79. Reached from Checkout on the cart. */
export default async function CheckoutPage() {
  const profile = await getAccountProfile();
  // No order service exists behind the connected API yet.
  if (profile === null) return <Pending eyebrow="Not available yet" title="Order request" />;
  // Today in Ontario, so a scheduled date is judged where the parts ship from.
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "America/Toronto" });
  return <Checkout profile={profile} today={today} />;
}
