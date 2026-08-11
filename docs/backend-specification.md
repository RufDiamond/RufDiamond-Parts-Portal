# Backend specification

RUFDiamond parts portal · FT3 Wagon pilot

This is the single specification for the backend. It carries the client
context, the data model, the operational requirements, and the open questions,
and it records the schema changes made while the front end was built.

**Supporting documents** — detail lives in these; this spec references rather
than repeats them:

| Document | Covers |
|---|---|
| `catalog-data-structure.md` | Table-by-table structure, source column mapping, import sequence |
| `capability-and-role-spec.md` | Capability register, scopes, role bundles, enforcement |
| `build-plan.md` | Eleven delivery stages and their order of risk |
| `backup-and-recovery-plan.md` | Backup layers, recovery procedures, targets, verification |

---

## 1. Client context

RUFDiamond distributes machines it does not manufacture — Fat Truck (Zeal
Motor, Canada), Agilis and IronHorse (Sweden) — and sells the spare parts. The
catalogue currently sits on a third-party portal that RUFDiamond cannot inspect
and does not fully control; the project exists to bring it in-house so they can
update prices and publish without their supplier or their developer.

The pilot is one machine: **Fat Truck FT3 Wagon**, serial number
`99FT3WXXXXXX and up`. The source export
(`Database_FT3_Wagon_-_14-JUL-2026.xlsx`) contains 635 rows, 536 unique parts,
45 figures, 12 systems, 1 model, 1 variant.

Two facts drive most of the design:

- **A part belongs to many callouts.** The same part number appears at several
  positions on one figure — seven such cases in this single file. Selecting a
  part must highlight *every* occurrence. This is the client's headline
  request.
- **A part belongs to many figures.** Part records are global; figure
  membership is a relationship, not a property of the part.

### What is built

A Next.js front end against an in-memory repository. `src/data/repository.ts`
is the seam: it is the only module that touches the seed, every function is
async, and replacing it with API calls should not change a single call site.
Canonical shapes are in `src/types/catalog.ts` (customer domain) and
`src/types/admin.ts` (admin read models).

Screens built: customer sign-in, machine select, search, systems, figures,
figure detail, request list, confirmation; admin catalog, model editor, hotspot
editor, parts, orders, publishing.

---

## 2. Data model

The table structure is specified in `catalog-data-structure.md` §3 and is
unchanged except where noted below. Names there are snake_case database
columns; names here are the TypeScript shapes the front end consumes.

### 2.1 Hierarchy

```
Product line          Fat Truck · Agilis · IronHorse
  └─ Model            FT3 Wagon
      └─ Variant      SERIAL NUMBER 99FT3WXXXXXX and up
          └─ System   Filters · Cabin · Hydraulic · (12 total)
              └─ Figure       Filters, FIG 1.1
                  └─ Callout  PNC 1, 2, 3 …
                      └─ Part 36-00304
```

Figures hang off the **variant**, not the model. That is what makes
serial-range differences work.

---

## 3. Schema changes made during the front-end build

Three changes were needed to build the screens. Each is stated with what it
was, what it is now, why it changed, and what the backend must guarantee.

### 3.1 `Callout` — coordinates and part are both nullable

```ts
interface Callout {
  id: string;
  figureId: string;
  figurePartId: string | null; // was: string
  number: number;
  x: number | null;            // was: number
  y: number | null;            // was: number
}
```

**Why.** The export carries the PNC-to-part mapping but no drawing and no
coordinates — `catalog-data-structure.md` §4. So an imported callout knows its
part and does not know where it sits. The original type had both fields
required, which made the ordinary post-import state unrepresentable: the only
options were to omit the callout, losing its number and its part, or to invent
a position.

The two nulls mean different things and arise at different rates:

| Field | Null means | How often |
|---|---|---|
| `x` / `y` | Marker not yet placed on the plate | **Every callout, on every import.** This is the manual work the project exists to bring in-house |
| `figurePartId` | No part behind the number | Exception only, where an export row was incomplete |

**What the backend must guarantee.**

- **Neither state may reach a customer.** A callout is servable only with both
  a position and a part. Publication is what enforces this (§4); the client
  also drops incomplete callouts when building markers
  (`buildDrawingMarkers` in `src/lib/drawing.ts`), but the API should not
  depend on it.
- `(figureId, number)` is **not** unique. A part fitted in two places carries a
  distinct PNC per position, and several callouts may resolve to the same part.
  This is the basis of multi-occurrence highlighting and is a valid mapping,
  never an error.
- Counts shown to customers should count *placed* callouts. A figure claiming
  six while only four can be drawn reads as a bug.
- Coordinates are percentages, 0–100, of the drawing's dimensions — never
  pixels. See §5.

**Import behaviour.** Per `build-plan.md` stage 3, create `callout` rows from
`PNC` with `figure_part_id` set and coordinates left null. The import should
never fabricate a position.

### 3.2 `Part.requires` — "also requires" at part level

```ts
interface Part {
  // ...
  supersededByPartId: string | null;
  requires: PartRequirement[]; // new
  status: PartStatus;
}

interface PartRequirement {
  partId: string;
  qty: number;
}
```

**Why.** This is the front end catching up with a decision already made in
`catalog-data-structure.md` §3 and §5, which specifies a `part_requires` table
and argues that remarks should be parsed rather than only stored. The original
TypeScript types had no equivalent, so the admin could not resolve a fitment
rule to a record, link to it, or export it as structured data.

Remarks live on `figure_part` — a part's appearance on *one* figure — which is
the wrong level twice over: the relationship would repeat on every figure the
part appears on, and would need hand-keeping in step. A seal kit travels with
its filter element wherever that element appears.

**What the backend must guarantee.**

- `partId` must resolve. The repository drops unresolvable references rather
  than emitting a dangling row; the API should reject them at write time.
- The relationship is directional and not symmetric. The seal kit does not
  require the element back — do not infer a reverse edge.
- Supersession stays as specified: `superseded_by_part_id` on the superseded
  record, pointing forward. The admin renders the reverse ("Replaces …") by
  lookup; only the one edge is stored.
- Free-text `figure_part.remarks` is still supported and still displayed. This
  adds a structured channel beside it; per §5 of the data-structure document,
  extraction is a reviewed import step, never silent.

### 3.3 `Model.catalogState` and `Model.updatedAt`

```ts
type CatalogState = "live" | "draft" | "awaiting-import" | "not-registered";

interface Model {
  id: string;
  productLineId: string;
  name: string;
  status: ModelStatus;      // unchanged: active | legacy | discontinued
  catalogState: CatalogState; // new
  updatedAt: string | null;   // new — ISO date
}
```

**Why.** `catalog-data-structure.md` §3 specifies a single `model.status` of
draft / published / awaiting_import. Building the console showed that two
different lifecycles were being packed into one column:

- **`ModelStatus`** — the machine. Whether the manufacturer still builds and
  supports it. Owned by the manufacturer's product management.
- **`catalogState`** — the catalogue for that machine. Owned by RUFDiamond's
  catalogue team.

They move independently. A model can be an active machine with no catalogue at
all, which is the majority case today: nine models registered, one with data.
Overloading one column would have made "active but not yet imported"
unrepresentable.

`updatedAt` is null until an export has been imported; the catalogue table
renders that as `—`.

| State | Meaning |
|---|---|
| `live` | Published; customers are seeing it |
| `draft` | Data imported, not publishable yet — typically unmapped callouts |
| `awaiting-import` | Registered, no export received from the manufacturer |
| `not-registered` | Known to exist, no record set up |

**What the backend must guarantee.**

- The customer side never branches on `catalogState`; it is an admin concern.
  What customers may see is governed by publication and by the `environment`
  scope in `capability-and-role-spec.md` §3.
- A model must not reach `live` while any of its callouts are unmapped — see
  §4. The client disables the control and states the reason, but the API must
  enforce it.
- `updatedAt` is set by the import and edit paths, never by the client.

---

## 4. Publish blocking is derived, not stored

A figure is publishable only when **every callout has both a position and a
part**. A customer must never meet a numbered marker with nothing behind it, and
must never meet a parts-list row whose number is nowhere on the plate.

This is enforced by derivation rather than by a flag someone has to remember to
clear. `getPublishQueue()` walks every model in `draft`, counts callouts that
are unplaced (`x`/`y` null) and callouts that are partless (`figure_part_id`
null or unresolvable), and emits a blocked entry naming the affected figures —
leading on coordinates, because that is what an import is actually missing:

> **FT3 Wagon — first release.** 2 callouts have no position on the drawing,
> and 1 has no part attached across 1 figure (FIG 1.1). Place the markers in
> the figure editor.

Place the markers and the blocker disappears on its own; there is no second
piece of state to keep in sync. Structural blockers that are not derivable
(IronHorse has received no parts export at all) are held as data alongside.

**Requirements.**

- The block is a server-side rule. `publish.execute` must re-check both
  conditions at the moment of publishing, not trust the client's disabled
  button.
- `publish.block.override` exists in the capability register and should be
  granted to nobody in the pilot, so that the eventual need for it is a
  deliberate grant rather than a code change made under pressure.
- Blocked controls stay visible and state their reason. A hidden control
  explains nothing. (This is the one deliberate exception to the "absent, not
  disabled" rule in `capability-and-role-spec.md` §6.2, which concerns
  capabilities a user can never hold; a blocker is a condition they can clear.)

### 4.1 What the hotspot editor does

Settled, and reflected in the built screen:

- **Primary gesture: placing.** Select a callout — which already knows its part
  from the import — then click the drawing to give it a position. The click is
  converted to percentages of the plate and stored as `x`/`y`.
- **Progress tracks positions.** The counter reads *"n of m placed"*, and the
  record bar carries the same figure. This is the number that makes the
  remaining eight models predictable, per `build-plan.md` stage 10.
- **Secondary path: attaching.** Where a callout arrived without a part, the
  editor offers a searchable picker and a quantity. It is offered only for that
  case, so the ordinary flow is not cluttered by it.
- **Completion requires both.** "Mark figure complete" stays disabled until
  every callout has a position *and* a part, and any later edit clears the
  complete flag.
- A part may key several callouts. The picker states the count as information
  ("Attached at 2 callouts in this figure"), never as a warning.

## 5. Related invariants

Not schema changes, but load-bearing and easy to break silently.

- **Callout coordinates are percentages, 0–100, never pixels**, and are absent
  until placed. Drawings are re-rendered at different widths and can be replaced
  at a different resolution; pixel offsets would detach every marker. Already
  specified in `catalog-data-structure.md` §3 and flagged in `build-plan.md`
  stage 2 as painful to change later. Store them null rather than zero — `0, 0`
  is a legitimate position, so it cannot double as "unplaced".
- **Order lines are snapshots.** `order_line` copies part number, description
  and unit price at submission so a price change next month cannot rewrite last
  month's order.
- **Discount is never stored on a line.** It belongs to the company reading the
  list and is applied at display time from `company.discount_rate`. Totals are
  a pure function of the lines and the rate; the pilot rate is 10% for dealers.
- **A part may key several callouts in one figure, and this is not an error.**
  The editor states it as information ("Attached at 2 callouts in this
  figure"), never as a warning.
- **Money rounds to cents at each step.** Line totals and discounts are rounded
  individually; per-line net figures computed from unrounded values will not
  always sum to a separately rounded total.

---

## 6. Open questions

Carried forward from the supporting documents, plus one raised by the build.
Questions 1 and 2 are the largest cost and scope determinants in the project.

1. **Can the current portal export drawing files** — PDF, SVG, DWG, or image?
   And does RUFDiamond hold the original CAD independently of the portal?
   (`catalog-data-structure.md` §4.) If the drawings arrive as SVG with the
   callout numerals as text elements, coordinates can be extracted
   automatically and the largest manual task mostly disappears. If they arrive
   as flat raster, every marker is placed by hand — 45 figures for FT3 Wagon,
   several thousand markers across nine models.
2. **Are submitted orders binding purchase orders or requests for quote?**
   (`capability-and-role-spec.md` §7.4.) The current portal treats them as
   requests. Binding orders require stock integration and payment handling and
   are a materially larger build.
3. **Should technicians see pricing?** Recommend a per-company setting rather
   than a global rule. (`capability-and-role-spec.md` §7.1.)
4. **Who holds `publish.execute`** — one named person, or anyone in parts and
   service? And do dealers order for end customers or for their own stock,
   which determines whether `orders.behalf` is needed in phase one.
   (`capability-and-role-spec.md` §7.2–7.3.)
5. ~~**Which nullable field does "unmapped" mean?**~~ **Settled in favour of
   the import data.** Callouts arrive from `PNC` with the part attached; what is
   missing is `x`/`y`. The editor's primary gesture is placing a marker, the
   progress counter tracks positions, and the publish blocker fires on missing
   coordinates. Attaching a part remains as a secondary path for incomplete
   export rows, and both conditions block publishing. See §3.1 and §4.1.
6. **How long can the portal be unavailable before it costs money**, and **is
   Canadian data residency contractually required** by any mining, utility or
   defence customer? (`backup-and-recovery-plan.md`.) Both constrain
   infrastructure and should be settled before it is selected.

---

## 7. Operational requirements

### 7.1 Enforcement

From `capability-and-role-spec.md` §6, restated because they are backend
obligations:

1. **Server-side authority.** Every capability check happens on the server.
   Client-side checks control what renders, never what is permitted.
2. **Deny by default.** An unrecognised capability key resolves to deny.
3. **No role-name checks anywhere.** Code checks capability keys only, so
   adding a role is a configuration change.
4. **Fleet and brand filtering at the query layer**, not in the UI. A Fat Truck
   user must not reach IronHorse data by editing a URL.
5. **Draft isolation.** A user without `publish.draft.view` must never receive
   draft data in any response, including search results.
6. **Audit on every mutation** — actor, capability exercised, object, previous
   value, new value, timestamp. Writing to the audit log is unconditional, not
   a capability.

### 7.2 Durability

From `backup-and-recovery-plan.md`. The irreplaceable asset is the **callout
mappings** — roughly 15,000 coordinate records at full scope, the output of the
manual work this project exists to bring in-house. Losing the parts data costs
a re-import; losing the mappings costs remapping every figure by hand.

| Scenario | Maximum data loss | Time to running again |
|---|---|---|
| Human error | The mistake only | < 1 hour |
| Database failure | < 5 minutes | < 4 hours |
| Region outage | < 5 minutes | Provider-dependent |
| Provider loss | < 1 quarter | 2–3 days |

Four independent layers: continuous point-in-time recovery (7-day window),
nightly snapshots (30 daily / 12 monthly / 7 annual, encrypted, Canadian
region), weekly drawing-file archive held separately from the database, and a
quarterly offline export held by RUFDiamond on hardware they control.

A restore rehearsal is a launch gate, per `build-plan.md` stage 9. An untested
backup is a belief, not a plan.

### 7.3 Import

The import is scripted and **must be idempotent** — it will be run many times,
and the second run must update rather than insert. Sequence, dependencies and
the sixteen-column source mapping are in `catalog-data-structure.md` §2 and §6.
Steps 1–6 run in minutes; drawing files and callout coordinates are the
project's real work.

---

## 8. Status of this document

The schema sections in §3–§5 describe changes already made in the front-end
code and verified against it. The data model, capability, operational and
delivery detail is owned by the four supporting documents listed at the top;
where this spec and those disagree, the supporting document is authoritative
for its own subject and this one records only the deltas.
