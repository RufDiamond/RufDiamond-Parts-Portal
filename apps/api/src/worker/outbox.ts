import { loadConfig } from "../config.js";
import { createDatabase } from "../db/client.js";
import { createRuntimeEmailDeliveries } from "./email-deliveries.js";
import { main } from "./main.js";

const config = loadConfig(process.env);
const database = createDatabase(config.databaseUrl);
try {
  const deliveries = createRuntimeEmailDeliveries(database.db, config.deliveryEncryption, process.env);
  await main({
    transactionRunner: database,
    deliveries,
    onTerminalFailure: (alert) => {
      console.error(`[outbox-terminal] ${alert.eventType} ${alert.eventId} after ${alert.attempts} attempts`);
    },
  });
} finally {
  await database.close();
}
