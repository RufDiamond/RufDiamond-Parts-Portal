export const CAPABILITY_KEYS = [
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

export type CapabilityKey = typeof CAPABILITY_KEYS[number];

const capabilityKeys = new Set<string>(CAPABILITY_KEYS);

export function isCapabilityKey(value: string): value is CapabilityKey {
  return capabilityKeys.has(value);
}
