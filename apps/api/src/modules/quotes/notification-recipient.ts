import { and, eq, inArray, isNotNull } from "drizzle-orm";
import type { Database } from "../../db/client.js";
import { appUser, company, quoteLine, quoteNotice } from "../../db/schema/index.js";
import { AppError } from "../../plugins/error-handler.js";
import { loadAuthorization } from "../authorization/policy.js";
import type { DeliveryMessage } from "../outbox/worker.js";
export interface QuoteNotificationTarget { to: string[]; quoteNo: string; customerName: string }
export type QuoteNotificationResolver = (message: DeliveryMessage) => Promise<QuoteNotificationTarget>;
export function createQuoteNotificationResolver(database: Database, policy?: string): QuoteNotificationResolver {
  return async message => {
    if (policy !== "original-requester") throw new Error("QUOTE_NOTIFY_POLICY_UNCONFIGURED");
    if (message.eventType !== "quote.notified.email" || message.aggregateType !== "quote_notice"
      || message.payloadVersion !== 1 || !/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(message.aggregateId)) {
      throw new Error("QUOTE_NOTICE_EVENT_INVALID");
    }
    return database.transaction(async tx => {
      const [notice] = await tx.select().from(quoteNotice).where(eq(quoteNotice.id, message.aggregateId)).limit(1);
      if (!notice) throw new Error("QUOTE_NOTICE_NOT_FOUND");
      if (!notice.lineIds.length) throw new Error("QUOTE_NOTIFY_RECIPIENTS_UNRESOLVED");
      const released = await tx.select({ id: quoteLine.id }).from(quoteLine).where(and(
        inArray(quoteLine.id, notice.lineIds), eq(quoteLine.companyId, notice.companyId),
        eq(quoteLine.quoteNo, notice.quoteNo), eq(quoteLine.notifyCustomer, true),
      ));
      if (released.length !== new Set(notice.lineIds).size) throw new Error("QUOTE_NOTIFY_RECIPIENTS_UNRESOLVED");

      // A factory-added row is authored by staff. Resolve original customer
      // requesters across the same quote instead of mailing that staff author.
      const requesters = await tx.selectDistinct({ id: appUser.id, email: appUser.email })
        .from(quoteLine).innerJoin(appUser, eq(quoteLine.submittedByUserId, appUser.id))
        .innerJoin(company, eq(appUser.companyId, company.id)).where(and(
          eq(quoteLine.companyId, notice.companyId), eq(quoteLine.quoteNo, notice.quoteNo),
          isNotNull(quoteLine.requested), eq(appUser.companyId, notice.companyId),
          eq(appUser.status, "active"), eq(company.status, "active"),
        ));
      const recipients: string[] = [];
      for (const requester of requesters) {
        try {
          const auth = await loadAuthorization(tx, requester.id);
          if (auth.companyId === notice.companyId && auth.capabilities.has("orders.own.view")) {
            recipients.push(requester.email);
          }
        } catch (error) {
          if (!(error instanceof AppError && error.status === 403)) throw error;
        }
      }
      if (!recipients.length) throw new Error("QUOTE_NOTIFY_RECIPIENTS_UNRESOLVED");
      return { to: [...new Set(recipients)].sort(), quoteNo: notice.quoteNo, customerName: notice.customerName };
    });
  };
}
