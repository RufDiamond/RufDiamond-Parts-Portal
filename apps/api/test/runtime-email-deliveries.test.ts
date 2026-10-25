import { randomBytes, randomUUID } from "node:crypto";
import { afterEach, expect, it, vi } from "vitest";
import { createDatabase } from "../src/db/client.js";
import { encryptProtectedDelivery } from "../src/modules/identity/protected-delivery.js";
import { createRuntimeEmailDeliveries } from "../src/worker/email-deliveries.js";

afterEach(() => vi.unstubAllEnvs());
const keyring = { activeKeyId: "test", keys: { test: randomBytes(32).toString("base64") } };

it("does not acknowledge password reset delivery through a logging stub", async () => {
  const database = createDatabase("postgresql://unused@127.0.0.1:1/unused");
  const targetId = randomUUID(), recordId = randomUUID();
  const context = { purpose: "password_reset" as const, targetId, recordId, payloadVersion: 1 as const, expiresAt: new Date(Date.now()+60000).toISOString() };
  try {
    const deliveries = createRuntimeEmailDeliveries(database.db, keyring, {});
    await expect(deliveries["identity.password-reset.requested"]!({
      eventId: randomUUID(), eventType: "identity.password-reset.requested", aggregateType: "password_reset_token",
      aggregateId: recordId, payloadVersion: 1, providerIdempotencyKey: "reset-event",
      payload: encryptProtectedDelivery(keyring, context, { targetId, recipient: "customer@example.test", resetToken: "test-only-token" }),
    })).rejects.toThrow("PASSWORD_RESET_EMAIL_TRANSPORT_UNCONFIGURED");
  } finally { await database.close(); }
});

it("fails at startup when sending is enabled without approved SMTP configuration", async () => {
  const database = createDatabase("postgresql://unused@127.0.0.1:1/unused");
  try {
    expect(() => createRuntimeEmailDeliveries(database.db, keyring, { QUOTE_EMAIL_SENDING: "enabled" })).toThrow("SMTP_HOST");
  } finally { await database.close(); }
});
