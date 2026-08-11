# Parts portal — capability and role specification

Draft v1 · for RUFDiamond parts portal · July 2026

This document defines *permissions*, not *roles*. Roles are named bundles of
capabilities and are expected to change. Capabilities are stable and are what
the code checks.

---

## 1. Naming convention

```
<domain>.<object>.<action>
```

Lowercase, dot-separated, singular objects. Wildcards are permitted in role
definitions only (`catalog.*`), never in enforcement checks.

**Rule for implementers:** every UI element and every API endpoint checks a
capability key. No code path anywhere tests a role name. Adding a role must
never require a code change.

---

## 2. Capability register

### 2.1 Catalog structure

| Key | Grants |
|---|---|
| `catalog.model.view` | See a model and its variants in the admin console |
| `catalog.model.create` | Add a new model |
| `catalog.model.edit` | Rename, change brand, edit systems and serial variants |
| `catalog.model.delete` | Remove a model and its dependents |
| `catalog.variant.manage` | Create, edit, and remove serial-range variants |
| `catalog.system.manage` | Enable or disable systems on a model |

### 2.2 Figures and drawings

| Key | Grants |
|---|---|
| `catalog.figure.view` | Open a figure in the admin console |
| `catalog.figure.create` | Add a figure to a system |
| `catalog.figure.edit` | Rename, reorder, change system assignment |
| `catalog.figure.delete` | Remove a figure |
| `catalog.drawing.upload` | Upload or replace the drawing file |
| `catalog.callout.map` | Attach a part record to a callout number |
| `catalog.callout.manage` | Add, move, or remove callout markers |

`catalog.callout.map` is deliberately separate from `catalog.figure.edit`.
Mapping is the highest-volume, lowest-risk task in the system and is the one
most likely to be delegated to a junior or temporary user.

### 2.3 Part records

| Key | Grants |
|---|---|
| `parts.record.view` | See part records in the admin console |
| `parts.record.create` | Create a part |
| `parts.record.edit` | Edit identifiers, description, brand, relationships |
| `parts.record.delete` | Remove a part not referenced by any figure |
| `parts.record.supersede` | Mark a part superseded and link its replacement |
| `parts.relationship.edit` | Edit "also requires" links |
| `parts.import` | Run a CSV or spreadsheet import |
| `parts.export` | Download the parts data |

### 2.4 Pricing

| Key | Grants |
|---|---|
| `pricing.cost.view` | See cost or price fields anywhere |
| `pricing.cost.edit` | Edit prices |
| `pricing.tier.manage` | Create and assign price tiers (list, dealer net, contract) |
| `pricing.tier.assign` | Assign a tier to a customer account |

`pricing.cost.view` is listed as a capability, not assumed. Some operations
withhold pricing from the shop floor; see open question 1.

### 2.5 Publishing

| Key | Grants |
|---|---|
| `publish.draft.view` | See unpublished changes and preview as a customer |
| `publish.execute` | Push draft changes to the live catalog |
| `publish.rollback` | Revert to an earlier published version |
| `publish.block.override` | Publish despite validation failures |

`publish.block.override` should be granted to nobody in the pilot. It exists so
the eventual need for it is a deliberate grant rather than a code change under
pressure.

### 2.6 Orders

| Key | Grants |
|---|---|
| `orders.list.build` | Add parts to a request list |
| `orders.submit` | Submit an order to RUFDiamond |
| `orders.own.view` | See orders raised by own company |
| `orders.all.view` | See orders across all customers |
| `orders.quote` | Enter pricing and lead times on an order |
| `orders.status.edit` | Change order status |
| `orders.export` | Export orders to accounting |
| `orders.behalf` | Raise an order on behalf of a named end customer |

`orders.list.build` without `orders.submit` is the technician case — the rule
currently documented in prose in the customer instruction PDF.

### 2.7 Accounts and users

| Key | Grants |
|---|---|
| `accounts.company.view` | See customer company records |
| `accounts.company.manage` | Create and edit customer companies |
| `accounts.fleet.manage` | Set which machines a company owns |
| `users.own.manage` | Add, remove, and set roles for users in own company |
| `users.all.manage` | Manage users across all companies |
| `roles.manage` | Create roles and change capability bundles |

`users.own.manage` is what prevents every customer staffing change becoming a
support request to RUFDiamond.

### 2.8 Audit

| Key | Grants |
|---|---|
| `audit.log.view` | Read the change log |
| `audit.log.export` | Export the change log |

Writing to the audit log is not a capability. It is unconditional.

---

## 3. Scope model

Capabilities say *what*. Scopes say *which records*. A user has one role and
one scope set; enforcement is the intersection.

| Scope | Values | Applies to |
|---|---|---|
| `brand` | all, or a named subset | Catalog and parts capabilities |
| `account` | all, own company, or a named list | Order and user capabilities |
| `fleet` | all models, or the machines a company owns | Customer catalog visibility |
| `environment` | published only, or published + draft | All view capabilities |
| `price_tier` | which tier resolves on display | Pricing display |

Scopes are restrictive and never additive. A capability absent from the role
cannot be granted by a scope.

---

## 4. Role definitions

### Internal — RUFDiamond

**Catalog owner** — `catalog.*`, `parts.*`, `pricing.*`, `publish.execute`,
`publish.rollback`, `publish.draft.view`, `orders.*`, `accounts.*`,
`users.all.manage`, `roles.manage`, `audit.*`
Scope: all brands, all accounts, published + draft.

**Catalog editor** — all `catalog.*` except `catalog.model.delete`, all
`parts.*` except `parts.record.delete`, `pricing.cost.view`,
`publish.draft.view`
Scope: all brands, published + draft. No publish capability by design.

**Publisher** — `publish.draft.view`, `publish.execute`, `publish.rollback`,
`catalog.*.view`, `parts.record.view`, `audit.log.view`
Scope: all brands, published + draft.

**Pricing** — `pricing.*`, `parts.record.view`, `parts.export`,
`publish.draft.view`
Scope: all brands, published + draft.

**Parts and sales** — `orders.all.view`, `orders.quote`, `orders.status.edit`,
`orders.export`, `catalog.*.view`, `parts.record.view`, `pricing.cost.view`,
`accounts.company.view`
Scope: all brands, all accounts.

**Internal viewer** — every `*.view` capability, `pricing.cost.view`
Scope: all brands, all accounts, published only.

### Customer

**Account administrator** — `orders.list.build`, `orders.submit`,
`orders.own.view`, `users.own.manage`, `accounts.fleet.manage` (read own),
`pricing.cost.view`
Scope: own company, own fleet, published only.

**Purchaser** — `orders.list.build`, `orders.submit`, `orders.own.view`,
`pricing.cost.view`
Scope: own company, own fleet, published only.

**Technician** — `orders.list.build`, `orders.own.view`, `pricing.cost.view`
Scope: own company, own fleet, published only.

**Viewer** — `orders.own.view`
Scope: own company, own fleet, published only. No `pricing.cost.view`.

### Dealer

**Dealer** — `orders.list.build`, `orders.submit`, `orders.behalf`,
`orders.own.view`, `pricing.cost.view`
Scope: all brands, all models (not fleet-limited), own dealer account,
published only, dealer-net price tier.

---

## 5. Pilot scope

Implement three roles. Specify all eleven.

| Role | In pilot | Collapses |
|---|:-:|---|
| Catalog admin | yes | Catalog owner + editor + publisher + pricing + parts and sales |
| Purchaser | yes | — |
| Technician | yes | — |
| All others | no | Defined, dormant |

The capability register is implemented in full from day one. Only the role
bundles are reduced. Splitting Catalog admin into its four constituent roles
later is a configuration change, not development work.

---

## 6. Enforcement requirements

1. **Server-side authority.** Every capability check happens on the server.
   Client-side checks control what renders, never what is permitted.
2. **Absent, not disabled.** A capability the user lacks removes the control
   from the interface. Disabled controls a user can never enable are a
   permanent dead end.
3. **Deny by default.** An unrecognised capability key resolves to deny.
4. **Fleet filtering at the query layer.** Machine visibility is a database
   constraint, not a UI filter. A customer must not be able to reach another
   model's parts by editing a URL.
5. **Audit on every mutation.** Actor, capability exercised, object, previous
   value, new value, timestamp.
6. **Draft isolation.** A user without `publish.draft.view` must never receive
   draft data in any response, including search results and API payloads.

---

## 7. Open questions for the client

1. Should technicians see pricing? Recommend making it a per-company setting
   rather than a global rule.
2. Do dealers order for end customers or for their own stock? Determines
   whether `orders.behalf` is required in phase one.
3. Who at RUFDiamond holds `publish.execute` — one named person, or anyone in
   parts and service?
4. Are submitted orders binding purchase orders or requests for quote? The
   current portal treats them as requests. Binding orders require stock
   integration and payment handling and are a materially larger build.

Question 4 is the largest scope determinant in the project and should be
answered before the pilot is quoted.
