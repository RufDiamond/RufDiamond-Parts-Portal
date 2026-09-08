# Admin console — feature record

The admin console was removed from the front end on 5 September 2026 because
the V2 design deck covers the customer side only and the client asked for the
old design views to go. **This is the record of what it did**, so it can be
rebuilt against the new design without re-deriving the behaviour.

The code is not lost — it is in git history at commit `1fe7668` under
`src/app/(admin)/`. Recover a screen with:

```
git show 1fe7668:src/app/\(admin\)/admin/parts/PartsBrowser.tsx
```

Nothing in the data layer was removed. Every read model these screens used
still exists in `src/types/admin.ts` and `src/data/repository.ts`, so a rebuild
is presentation work, not data work.

---

## Shell

Left nav rail — Catalog, Models, Figures, Parts, Orders (with a count badge),
Publishing. A record bar pinned to the foot of the content column carrying five
labelled fields whose content changes per screen, plus the operator's name.

Deliberately not the customer chrome: no machine chip, no cart, no title block.

## Catalog — `/admin`

- Stat strip: models with data, models registered, figures, part records,
  unmapped callouts.
- Models grouped under their product line. Columns: model, serial range,
  figures, parts, state, updated.
- Catalogue state per model: `live` / `draft` / `awaiting-import` /
  `not-registered` — distinct from the machine's own lifecycle.
- Last published revision and date.

## Model editor — `/admin/models/[modelId]`

- Model identity, product line, catalogue state.
- Serial variants table with a figure count per variant.
- Systems checklist — all twelve, whether or not the model carries figures for
  them, each with figure count, part count and unmapped callout count.

## Figure / hotspot editor — `/admin/figures/[figureId]`

The tool the pilot exists to deliver. **566 of 572 callouts are still to be
placed**, so this is the one screen whose absence has a schedule cost.

- Primary gesture: select a callout, click the plate to give it a position.
  The click is converted to percentages of the drawing, never pixels.
- Progress counter — "n of m placed" — and the same figure on the record bar.
- Secondary path: where a callout arrived with no part, a searchable picker
  and a quantity field attach one. Offered only for that case.
- Unplace and detach actions per callout.
- "Mark figure complete" stays disabled until every callout has both a
  position and a part; any later edit clears the flag.
- A part keying several callouts is stated as information ("attached at 2
  callouts in this figure"), never as a warning.
- Placed markers draw on the plate; a callout with a position but no part
  draws dashed.

## Parts browser — `/admin/parts`

- Filters: free-text query (part number with separators ignored, or
  description), system, part status.
- Columns: part number, description, systems used in, figures used on, total
  quantity, distinct remarks, superseded by, replaces, also requires.
- CSV export whose columns match the import contract, so an exported file can
  be edited and imported back.
- CSV price import panel: upload, validate, preview, approve, log, roll back.

## Orders inbox — `/admin/orders`

- Orders table: reference, customer, product line, model, serial range, line
  count, value, discount tier, state.
- States: new, quoted, shipped, requires dealer approval.
- Filter by state; CSV export for accounting.

**Note:** this screen is superseded by the quote flow in slides 53–56. It
becomes Quote Status admin, carrying Factory Price and Customer Price side by
side, with Customer Price alone visible to the customer. Do not rebuild it as
it was — see `clients.md` §4.

## Publishing board — `/admin/publishing`

- Ready-to-publish queue: change, what it affects, who edited it, when.
- Blocked queue with a **derived** reason, not a stored flag. A model in draft
  is blocked while any callout lacks a position or a part, and the reason names
  the affected figures. Clearing the mapping clears the blocker with no second
  piece of state to keep in sync.
- Structural blockers that are not derivable — a product line with no parts
  export at all — are held as data alongside.
- Publish action, disabled with a stated reason rather than hidden.
- Revision history, newest first, with rollback.

---

## Rules that must survive any rebuild

These are not presentation choices. They come from
`capability-and-role-spec.md` and `backend-specification.md`:

1. **Publish blocking is derived**, never a stored flag.
2. **Callout coordinates are percentages, 0–100, never pixels**, and null until
   placed — `0,0` is a legitimate position so it cannot double as "unplaced".
3. **A part may key several callouts in one figure.** Valid mapping, not an
   error.
4. **Every control checks a capability key, never a role name.**
5. **Blocked controls stay visible and state their reason** — the one
   deliberate exception to "absent, not disabled", because a blocker is a
   condition the user can clear.
6. **Audit on every mutation** — actor, capability, object, previous value, new
   value, timestamp.
