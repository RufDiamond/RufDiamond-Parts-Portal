import { getAdminQuoteRecords } from "@/data/quote-status.server";
import { Pending } from "../../Pending";
import { AdminQuoteStatus } from "./AdminQuoteStatus";

/**
 * Quote Status, RUF Diamond's view — 12 Oct deck, p58.
 *
 * Local demonstration only. There is no staff sign-in yet, so this screen is
 * not behind one: before real customers use the portal it has to move behind
 * an administrator session, because it shows Factory Price.
 */
export default async function AdminQuotesPage() {
  const records = await getAdminQuoteRecords();
  if (records === null) return <Pending eyebrow="Not available yet" title="Quote status — RUF Diamond" />;
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "America/Toronto" });
  return <AdminQuoteStatus seed={records} today={today} />;
}
