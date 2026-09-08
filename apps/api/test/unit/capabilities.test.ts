import { describe, expect, it } from "vitest";

import { CAPABILITY_KEYS, isCapabilityKey } from "../../src/modules/authorization/capabilities.js";
import { requireCapability } from "../../src/modules/authorization/policy.js";
import type { AuthorizationContext } from "../../src/modules/authorization/types.js";

const committedCapabilityKeys = [
  "catalog.model.view", "catalog.model.create", "catalog.model.edit", "catalog.model.delete",
  "catalog.variant.manage", "catalog.system.manage", "catalog.figure.view", "catalog.figure.create",
  "catalog.figure.edit", "catalog.figure.delete", "catalog.drawing.upload", "catalog.callout.map",
  "catalog.callout.manage", "parts.record.view", "parts.record.create", "parts.record.edit",
  "parts.record.delete", "parts.record.supersede", "parts.relationship.edit", "parts.import",
  "parts.export", "pricing.cost.view", "pricing.cost.edit", "pricing.tier.manage",
  "pricing.tier.assign", "publish.draft.view", "publish.execute", "publish.rollback",
  "publish.block.override", "orders.list.build", "orders.submit", "orders.own.view",
  "orders.all.view", "orders.quote", "orders.status.edit", "orders.export", "orders.behalf",
  "accounts.company.view", "accounts.company.manage", "accounts.fleet.manage", "users.own.manage",
  "users.all.manage", "roles.manage", "audit.log.view", "audit.log.export",
] as const;

function authorization(capabilities: readonly string[]): AuthorizationContext {
  return {
    userId: "user-1",
    companyId: "company-1",
    capabilities: new Set(capabilities),
    brandIds: [],
    accountIds: [],
    variantIds: [],
    canViewDraft: false,
    canViewPrices: false,
    scopeVersion: "scope-v1",
    priceTierId: null,
    discountRate: "0.000000",
  };
}

describe("capability registry", () => {
  it("matches every committed capability key exactly", () => {
    expect(CAPABILITY_KEYS).toEqual(committedCapabilityKeys);
    expect(new Set(CAPABILITY_KEYS).size).toBe(45);
    for (const key of committedCapabilityKeys) expect(isCapabilityKey(key)).toBe(true);
  });

  it("fails closed for unknown capability keys", () => {
    expect(isCapabilityKey("catalog.figure.read")).toBe(false);
    expect(() => requireCapability(authorization(["catalog.figure.read"]), "catalog.figure.read"))
      .toThrowError(expect.objectContaining({ code: "FORBIDDEN", status: 403 }));
  });

  it("always denies the publication blocker override even when assigned", () => {
    expect(() => requireCapability(authorization(["publish.block.override"]), "publish.block.override"))
      .toThrowError(expect.objectContaining({ code: "FORBIDDEN", status: 403 }));
  });
});
