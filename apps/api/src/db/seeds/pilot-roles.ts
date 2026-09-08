import { sql } from "drizzle-orm";

import type { Transaction } from "../client.js";

const CUSTOMER_READ_CAPABILITIES = [
  "catalog.model.view",
  "catalog.figure.view",
  "parts.record.view",
] as const;

const CUSTOMER_ROLES = ["purchaser", "technician"] as const;

/** Controlled bootstrap: inserts only required read grants and never rewrites a role bundle. */
export async function seedPilotRoleReadCapabilities(tx: Transaction): Promise<void> {
  for (const roleKey of CUSTOMER_ROLES) {
    for (const capabilityKey of CUSTOMER_READ_CAPABILITIES) {
      await tx.execute(sql`
        INSERT INTO role_capability(role_id, capability_key)
        SELECT r.id, c.key
        FROM role r
        JOIN capability c ON c.key = ${capabilityKey}
        WHERE r.key = ${roleKey}
        ON CONFLICT (role_id, capability_key) DO NOTHING
      `);
    }
  }
}
