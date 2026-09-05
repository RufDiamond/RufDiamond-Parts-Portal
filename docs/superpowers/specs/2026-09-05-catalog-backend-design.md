# Catalog backend — table design and extraction pipeline

RUFDiamond parts portal · FT3 Wagon pilot · 5 September 2026

This design covers the database schema and the import pipeline that fills it.
It supersedes `catalog-data-structure.md` §3 where the two disagree, for the
reasons recorded in §2; everything else in that document still stands.

Scope is deliberately the **catalog**: product lines through callouts, plus
drawing files and the extraction-review tables. Companies, users, orders,
capabilities and the audit log are named here only where the catalog tables
must anticipate them, and are designed in their own specs.

---

## 1. What changed since the supporting documents were written

Two source files arrived that the earlier documents were written without.

**`FT3W - SCHEMATICS/`** — 44 PNG plates, received 2 September 2026, in twelve
folders whose names map 1:1 onto the twelve systems already seeded in
`src/data/seed.ts`. Filenames encode the group number and figure name:
`FAT TRUCK FT3W 8-4 EXHAUST.png` → group `8.4`, name `Exhaust`, system
`sys-engine`.

**`96-00073 - Parts_catalog_FT3-REV.2.pdf`** — 54 pages, the parts catalog Zeal
Motor publishes. It carries a drawing *and* a full parts table for every
figure. It is a more complete source than the still-missing
`Database_FT3_Wagon_-_14-JUL-2026.xlsx` for everything except price.

Together they answer `backend-specification.md` §6 question 1, which both
supporting documents call the largest cost variable in the project:

> Can the current portal export drawing files — PDF, SVG, DWG, or image? And
> does RUFDiamond hold the original CAD independently of the portal?

**Answer: flat raster, no coordinates, no text layer.** The optimistic branch —
"if the drawings arrive as SVG with the callout numerals as text elements,
coordinates can be extracted automatically and the largest manual task mostly
disappears" — does not apply. But the pessimistic branch is not quite right
either: the numerals are cleanly legible, so a vision pre-pass can propose
coordinates for a human to confirm. That is the middle path this design takes.

### 1.1 Corrections to recorded facts

| Recorded | Actual | Source |
|---|---|---|
| Serial range `99FT3WXXXXXX and up` | `99FT3W251001 and up` | PDF cover |
| 45 figures (`catalog-data-structure.md` §2) | **47** | PDF table of contents |
| 44 figures / "upload 44 drawings" (`build-plan.md` stage 3, 10) | 47 figures, **44 plates held** | TOC vs. folder |
| Catalog revision unrecorded | `REV.2`, document `96-00073`, publication 2026 | PDF cover |

Three figures have no plate: `5.3 Wheel pods assembly - optional`,
`6.15 Safety and tools`, `11.1 Battery`. These are chased from Zeal Motor, not
worked around.

### 1.2 Defects found in the delivery while building this

Two more, found by the importer rather than by reading the folder listing.

**`2.1` and `2.2` are the same image.** `FAT TRUCK FT3W 2-1 BUMPER AND HITCH
RECEIVER.png` and `FAT TRUCK FT3W 2-2 BUMPER AND WINCH.png` are byte-identical
(`sha256 dee6f9df…`), and both show the winch bumper — the content of 2.2. The
plate for `2.1 Bumper and hitch receiver` was never delivered. So the delivery
holds **43 distinct drawings, not 44**, and **four** figures lack a plate.

Which of the two names is wrong is not derivable, so the importer attaches
neither and reports the pair. A byte-identical duplicate check runs over every
delivery from now on: silently attaching one of them would put the winch
drawing under the hitch receiver's parts list, where every marker resolves to
the wrong part.

**`3.1`'s plate has empty callout circles.** Two of its four markers were
delivered with no numeral inside them. The circles are locatable, but their
numbers can only be inferred from where the leader lines point. Both are stored
at confidence 0.3 with the inference recorded, and neither is servable.

Both defects are in the delivery, not in the catalog: the PDF's own pages 2, 3
and 4 are correct. Re-exporting the plates would fix them.

**The PDF has since been deleted from `~/Downloads`.** The transcriptions in
`src/import/catalog-source.ts` and `src/import/pilot-tables.ts` are currently
the project's only copy of its content, and they cover the contents page and
four figures out of forty-seven. Getting the file back is the largest
outstanding dependency.

**Filenames are not figure identity.** System 11's PNGs are numbered one below
the PDF's, because the PDF inserts `11.1 Battery` ahead of them. The PDF's own
TOC numbers two different figures `11.5` and skips `11.4`, and its page
references are wrong in places (4.1 and 4.2 both claim page 7). Plate-to-figure
matching is therefore a reviewed step with the PDF as authority, never a
filename parse.

---

## 2. Four findings that change the tables

### 2.1 The printed `#` is a list position, not a callout number

FIG 2.1 lists nine rows; its plate carries seven markers. Rows 8 and 9 read
`NOT SHOWN`. FIG 3.1: eight rows, four markers. FIG 2.2: seventeen rows, twelve
markers. Not-shown is a permanent, intended state — hardware you order but
cannot see on the plate.

`catalog-data-structure.md` §3 derives the printed number from `callout.number`,
which makes this unrepresentable. A not-shown row would either lose its printed
number, or acquire a callout that can never be placed and so blocks publication
under `backend-specification.md` §4 forever.

**Decision.** `figure_part.item_no` holds the printed number and is always
present. `callout` rows exist only where the item is drawn — zero or more per
`figure_part`. A part drawn twice gets two callouts sharing one `item_no`,
which is still the basis of multi-occurrence highlighting.

### 2.2 A marker may have no row

FIG 4.1's plate carries markers 27, 28 and 29; its table stops at 26. This is a
defect in the source document, but it is present on day one, so
`callout.figure_part_id` stays nullable exactly as `backend-specification.md`
§3.1 has it. `callout.number` is retained rather than derived, because an
orphan marker still has a numeral to render.

### 2.3 Options are parts

`2.2 BUMPER AND WINCH (OPTION 88-00262 / 88-00263)` in a figure title. `TOW
PACKAGE OPTION (88-00023)` on a row. `AIR CONDITIONING OPTION (88-00256)`,
`HOT STICKS STORAGE TUBES OPTION (88-00168)`, `4-WAY BACKUP CAMERA OPTION
(88-00255)`.

An `88-` part is a kit that groups other parts, and membership applies at two
levels: a whole figure can be an option, and a single row within an ordinary
figure can be. This is first-class in every electronic parts catalog —
including IntelliCatalog, the portal RUFDiamond is migrating off — and is
absent from the current schema.

**Decision.** A `part_kit` membership table, plus `option_part_id` on both
`figure` and `figure_part`. Retrofitting kit membership across 47 figures after
the fact is materially more expensive than modelling it now.

### 2.4 Notes are a small taxonomy

Observed: `NOT SHOWN`, `MIDDLE NOT SHOWN`, `OTHER SIDE NOT SHOWN`, `NOT SHOWN -
FOR 19-00210`, `NOT SHOWN - REPLACEMENT PART`, `MOUNTING HARDWARE`, `WITH AIR
GAP`, option references, and cross-figure pointers such as `*See 9.1 FUEL
SYSTEM for hydraulic oil tank and oil level sender`.

`catalog-data-structure.md` §5 anticipated only `Req. X (2x)`.

**Decision.** Parse the three structural signals — shown/not-shown, option
reference, required part — into columns and relations. Everything else stays in
`figure_part.remarks` as text, displayed as it is today. Per §5 of that
document, extraction is reviewed, never silent.

Some notes are **truncated in the source itself**: FIG 4.1 row 9 reads `2 ON THE
OTHER BACKSIDE OF REAR BUMP`, clipped by the note column's width in the original
Word document. These cannot be recovered from this file and are flagged for
manual completion rather than stored as if whole.

---

## 3. Tables

Postgres, Drizzle as the query layer, per `build-plan.md` stage 2. Names are
snake_case columns; the TypeScript shapes in `src/types/catalog.ts` remain the
contract the repository must satisfy.

Marked **new** where the table or column does not appear in
`catalog-data-structure.md` §3.

### 3.1 Reference data

```
product_line   id · name · manufacturer · country · is_distributed
system         id · code · name · sort_order
```

`system.code` is **new** — the printed number 1–12. It orders the catalog the
way the document does and is how the PNG folder names resolve.

### 3.2 Machine hierarchy

```
model          id · product_line_id · name · display_photo · sort_order
               · status            active | legacy | discontinued
               · catalog_state     live | draft | awaiting-import | not-registered
               · updated_at

variant        id · model_id · label · serial_from · serial_to
               · catalog_revision
               · doc_number        new
               · edition           new
               · published_year    new

model_system   model_id · system_id · enabled
```

`status` and `catalog_state` stay split per `backend-specification.md` §3.3.
`doc_number`, `edition` and `published_year` are **new**: the source document
identifies itself as `96-00073`, `1st Edition`, `Rev 2 - Publication 2026`, and
a catalog that cannot cite its own revision cannot be reconciled against a later
one.

### 3.3 Figures and drawings

```
figure         id · variant_id · system_id · group_no · name · sort_order
               · status            published | draft | superseded
               · drawing_file_id   nullable
               · option_part_id    new · nullable — the 88- kit this figure is an option for
               · footnote          new · nullable — free text printed under the list
               · source_page       new · nullable — page in 96-00073, for audit

drawing_file   id · filename · format · storage_path · width · height
               · checksum          new
               · uploaded_at · version

figure_reference   new
               from_figure_id · to_figure_id · note
```

`drawing_file` stays standalone with `figure.drawing_file_id` pointing at the
current one, preserving the existing `Figure` type. Superseded versions keep
their rows, so a re-scanned plate does not destroy history. `checksum` makes the
import idempotent over the plate files.

`figure_reference` captures `*See 9.1 FUEL SYSTEM …` as a link rather than only
as prose, so the portal's existing figure navigation can follow it.

**One drawing per figure holds.** FIG 4.1 spans two PDF pages, but what
overflows is the *parts list*, under a repeated title — not a second plate. The
importer merges continued tables into one figure.

### 3.4 Parts

```
part           id · part_number (unique) · description · manufacturer
               · list_price        nullable — the PDF carries no prices
               · currency · superseded_by_part_id · status

part_requires  part_id · required_part_id · qty
part_kit       new
               kit_part_id · member_part_id · qty
```

`list_price` becomes **nullable**. The PDF has no prices anywhere; they arrive
with the xlsx or a CSV. A null price is a part that cannot be ordered yet, and
must render as such rather than as `$0.00`.

`part_requires` stays directional and asymmetric per `backend-specification.md`
§3.2 — a seal kit does not require its element back.

### 3.5 Figure membership and markers

```
figure_part    id · figure_id · part_id
               · item_no           new — the printed #, unique per figure
               · qty · remarks · serviceable
               · shown             new — false for NOT SHOWN rows
               · option_part_id    new · nullable
               · notes_truncated   new — source text was clipped; needs completion
               · effective_from · effective_to

               unique (figure_id, item_no)

callout        id · figure_id · figure_part_id nullable · number
               · x · y            nullable percentages, 0–100
               · source           new · vision | manual | imported
               · confidence       new · nullable, vision only
               · confirmed_at     new · nullable
               · confirmed_by     new · nullable
```

`(figure_id, number)` is **not** unique, per `backend-specification.md` §3.1.
`(figure_id, item_no)` **is**.

Coordinates remain percentages 0–100, never pixels, and null rather than zero —
`0, 0` is a legitimate position. The plates are 1280×720 with two exceptions
(`7.2` at 3856×2459, `8.4` at 1893×889), so a pixel scheme would break on
replacement.

`source` and `confirmed_at` are what make the vision pre-pass safe: a marker
proposed by a model is stored, shown to the admin, and **not servable** until a
person confirms it. See §5.

### 3.6 Extraction and review

**New — no equivalent exists.** These tables exist because the source is raster
and every value passes through OCR.

```
import_run     id · source_file · source_checksum · kind
               · started_at · finished_at · status · summary
               · actor_user_id

extraction_row id · import_run_id · figure_id · source_page · row_image_path
               · raw_item_no · raw_part_number · raw_description
               · raw_qty · raw_notes
               · confidence
               · status            pending | accepted | corrected | rejected
               · corrected_json    nullable
               · reviewed_by · reviewed_at · figure_part_id nullable
```

Every accepted `figure_part` traces to the `extraction_row` and page image it
came from. A misread part number is then a lookup, not an investigation.

`source_checksum` plus `kind` make the run idempotent as
`backend-specification.md` §7.3 requires: a second run over the same file
updates rather than inserts.

### 3.7 Deliberately not built here

- **`company`, `company_product_line`, `company_machine`, `user`, `order`,
  `order_line`, `audit_log`, `capability`, `role`, `role_capability`.** These
  belong with auth and orders. Designing `order` before the capability model
  exists is how the unvalidated decisions in `build-plan.md` stage 5 get baked
  in. The catalog tables assume nothing about them.
- **A part-prefix category table.** `10-`/`12-`/`13-` are fasteners, `54-`
  hydraulic fittings, `88-` options, and the pattern is real — but nothing in
  the built screens needs it, and it can be derived later without a migration.
- **A fitted-options configuration model**, where a customer's own unit records
  which `88-` kits it carries and the catalog filters to them. This is what
  IntelliCatalog does off a VIN. It needs `company_machine`, so it waits.

---

## 4. Import pipeline

Five stages. Each writes to `import_run` and can be re-run.

**1 · Reference and hierarchy.** Twelve systems and three product lines from
existing seed values. Model, variant with the real serial range, `model_system`
rows. Deterministic, no extraction.

**2 · Figure skeleton.** The 47 figures from the PDF's table of contents, with
`group_no`, `name` and `system_id`. TOC numbering defects — the duplicated
`11.5`, the missing `11.4` — are recorded as they are printed and corrected by
hand in the admin console, not silently renumbered.

**3 · Plates.** The 44 PNGs are checksummed, copied into storage, measured, and
matched to figures. Matching proposes a figure from the filename and requires
confirmation, because §1.1 shows filenames disagree with the catalog. Three
figures stay without a plate.

**4 · Parts tables.** Pages rendered and read; one `extraction_row` per printed
row, carrying its own row image. Part numbers are format-checked against the
observed patterns (`NN-NNNNN`, `NN-NNNNNN-NNN`, `NN-NNNNNN-NN`); a failure marks
the row `pending` with a reason and never writes a `part`. Notes are parsed for
the three structural signals in §2.4. Accepted rows become `part`,
`figure_part`, `part_requires` and `part_kit`.

**5 · Callout coordinates.** Each plate is read for numbered markers, emitting
`callout` rows with `source = 'vision'`, a confidence, and `confirmed_at` null.
The admin confirms or corrects them in the hotspot editor that already exists.

### 4.1 What runs in this build

Stages 1–3 across the whole catalog: 47 figures, 44 plates, the full hierarchy.

Stages 4–5 for **systems 1, 2 and 3 only** — `1.1 Filters`, `2.1 Bumper and
hitch receiver`, `2.2 Bumper and winch`, `3.1 Hydraulic motor assembly`. Four
figures, roughly forty rows, and a deliberate spread: a trivial figure, one with
`NOT SHOWN` rows, one that is an option, and one with more not-shown rows than
shown.

This is the measurement `build-plan.md` stage 10 calls the most valuable output
of the pilot — cost per figure, which is what makes the remaining eight models
predictable. Running all 47 first would produce that number only after paying
for it.

---

## 5. Publish blocking, restated

`backend-specification.md` §4 derives publishability rather than storing a flag.
That holds, with the rule corrected for §2.1 and tightened for the vision
pre-pass. A figure is publishable when:

1. Every `figure_part` with `shown = true` has at least one `callout`.
2. Every `callout` has `x` and `y` non-null.
3. Every `callout` has `confirmed_at` non-null.
4. Every `callout` has a `figure_part_id` that resolves.

Rule 1 replaces "every callout has a position and a part" as the *coverage*
test, because not-shown rows must never require a marker. Rule 3 is new: a
model's guess is not a mapping. `getPublishQueue()` reports each failing rule
separately, naming the figures, and leads on coordinates as it does today.

The check is server-side and re-run at the moment of publishing, per §4.
`publish.block.override` remains granted to nobody.

Counts shown to customers count callouts satisfying rules 2–4. Parts-list rows
that are not shown render as such and are still orderable.

---

## 6. The repository seam

`src/data/repository.ts` is the only module that touches the seed, every
function is async, and `backend-specification.md` §2 requires that replacing it
with real queries changes no call site. That constraint is kept: the Drizzle
implementation lands behind the same signatures, and `src/types/catalog.ts` is
extended, not reshaped.

Three additions to the domain types follow from §3:

```ts
interface FigurePart {
  // ...
  itemNo: number;         // the printed #
  shown: boolean;         // false for NOT SHOWN rows
  optionPartId: string | null;
}

interface Callout {
  // ...
  source: "vision" | "manual" | "imported";
  confidence: number | null;
  confirmedAt: string | null;
}

interface Part {
  // ...
  listPrice: number | null;   // was: number — the PDF carries no prices
}
```

`FigurePartRow.calloutNumbers` keeps its meaning and stays empty for not-shown
rows, which is now a displayed state rather than a gap.

`listPrice` becoming nullable is a breaking change to every screen that renders
a price. Those call sites render "Price on request" rather than a zero.

---

## 7. Verification

The design is wrong unless these hold against the real files.

| Check | Expected |
|---|---|
| Migration from empty | Runs clean, tables created in FK order |
| Import run twice | Second run updates; no duplicate parts, figures or callouts |
| Figure count | 47 figures across 12 systems |
| Plate count | 43 distinct images stored; 2.1, 5.3, 6.15 and 11.1 without a plate |
| Duplicate plates | The 2.1/2.2 pair is reported and neither is attached |
| FIG 1.1 | 6 rows, 6 callouts, all shown |
| FIG 2.1 | 9 rows, 7 callouts; items 8 and 9 `shown = false` |
| FIG 2.2 | 17 rows, 12 callouts; figure carries `option_part_id` → `88-00262` |
| FIG 3.1 | 8 rows, 4 callouts; items 5–8 `shown = false` |
| Multi-occurrence | A part at two `item_no`s highlights at both |
| Bad part number | A deliberately corrupted row stays `pending`, writes no `part` |
| Publish block | FIG 2.1 is publishable with items 8 and 9 unmarked |
| Publish block | An unconfirmed vision callout blocks publication |
| Price null | A part with no price renders "Price on request", never `$0.00` |

The FIG 2.1 publish case is the one that would have failed under the old rule,
and is the reason §2.1 exists.

---

## 8. Open questions this design does not settle

Carried from `backend-specification.md` §6, unchanged:

- Whether submitted orders are binding purchase orders or requests for quote.
- Whether technicians see pricing.
- Who holds `publish.execute`.
- Portal downtime tolerance and Canadian data residency.

Newly raised:

- **Where do prices come from?** The PDF has none. Either
  `Database_FT3_Wagon_-_14-JUL-2026.xlsx` is produced, or RUFDiamond supplies a
  part-number-to-price CSV. Until one arrives the catalog is browsable and not
  orderable.
- **Will Zeal Motor re-export the plates?** Four figures have none, `2.1` was
  sent as a duplicate of `2.2`, and `3.1`'s numerals are missing from two of
  its circles. Can they also supply better than 1280×720? Marker placement
  accuracy is bounded by plate resolution.
- **Is `96-00073 Rev 2` the revision RUFDiamond sells against?** The whole
  import is keyed to it.
