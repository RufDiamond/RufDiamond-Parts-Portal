import type { Database } from "../db/client.js";
import { createPasswordResetDelivery, type DeliveryKeyring } from "../modules/identity/protected-delivery.js";
import type { OutboxDelivery } from "../modules/outbox/worker.js";
import { createUnconfiguredQuoteEmailPort, quoteEmailDeliveries } from "../modules/quotes/email-delivery.js";
import { createQuoteNotificationResolver } from "../modules/quotes/notification-recipient.js";
import { createSmtpQuoteEmailPort, loadSmtpConfig } from "../modules/quotes/smtp-email.js";

export function createRuntimeEmailDeliveries(database: Database, keyring: DeliveryKeyring, env: Readonly<Record<string, string | undefined>>): Record<string, OutboxDelivery> {
  const smtp = loadSmtpConfig(env);
  const port = smtp ? createSmtpQuoteEmailPort(smtp) : createUnconfiguredQuoteEmailPort();
  return {
    ...quoteEmailDeliveries(port, createQuoteNotificationResolver(database, env.QUOTE_NOTIFY_RECIPIENT_POLICY)),
    "identity.password-reset.requested": createPasswordResetDelivery({
      keyring,
      port: { async deliverPasswordReset() {
        // The reset landing page/delivery contract is not configured. Retain
        // retries/dead-letter visibility instead of silently logging success.
        throw new Error("PASSWORD_RESET_EMAIL_TRANSPORT_UNCONFIGURED");
      } },
    }),
  };
}
