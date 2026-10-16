import { loadConfig } from "../config.js";
import { createDatabase } from "../db/client.js";
import { quoteEmailDeliveries, createLoggingQuoteEmailPort } from "../modules/quotes/email-delivery.js";
import { createPasswordResetDelivery } from "../modules/identity/protected-delivery.js";
import { main } from "./main.js";

const config = loadConfig(process.env);
const database = createDatabase(config.databaseUrl);
const emailPort = createLoggingQuoteEmailPort();

await main({
  transactionRunner: database,
  deliveries: {
    ...quoteEmailDeliveries(emailPort),
    "identity.password-reset.requested": createPasswordResetDelivery({
      keyring: config.deliveryEncryption,
      port: {
        deliverPasswordReset: async (message) => {
          console.info(`[password-reset] → ${message.recipient}`);
        },
      },
    }),
  },
  onTerminalFailure: (alert) => {
    console.error(`[outbox-terminal] ${alert.eventType} ${alert.eventId} after ${alert.attempts} attempts`);
  },
});

await database.close();
