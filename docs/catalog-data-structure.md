# Catalog data structure

RUFDiamond parts portal · derived from `Database_FT3_Wagon_-_14-JUL-2026.xlsx`
· July 2026

---

## 1. Hierarchy

The customer's path through the catalog and the database structure are the same
shape:

```
Product line          Fat Truck · Agilis · IronHorse
  └─ Model            FT3 Wagon
      └─ Variant      SERIAL NUMBER 99FT3WXXXXXX and up
          └─ System   Filters · Cabin · Hydraulic · (12 total)
              └─ Figure       Filters, FIG 1.1
                  └─ Callout  PNC 1, 2, 3 …
                      └─ Part 36-00304
```

Two relationships in that chain are not one-to-one and drive most of the design:

**A part belongs to many callouts.** The same part number appears at several
positions in one figure. Confirmed in the source data: seven cases in this
single file, including `36-00157` and `36-00338` on the engine accessory belt
and `10-405025-122` on the windshield assembly. This is the basis of the
client's request to highlight every occurrence of a selected part.

**A part belongs to many figures.** Filters, fasteners, and seals recur across
systems and models. Part records are global; figure membership is a
relationship, not a property of the part.

---

## 2. Source column mapping

The current portal's export carries sixteen columns. Where each belongs:

| Source column | Destination | Notes |
|---|---|---|
| `No.` | discard | Row index in the export only |
| `PART NO` | `part.part_number` | Natural key. Formats: `36-00304`, `10-405025-122` |
| `DESCRIPTION` | `part.description` | |
| `MODEL` | `model.name` | Single value in this file: FT3 WAGON |
| `VARIANTS` | `variant.label` | Single value: SERIAL NUMBER 99FT3WXXXXXX and up |
| `AGGREGATE / SYSTEM` | `system.name` | 12 distinct values |
| `GROUPNO` | `figure.group_no` | Figure identifier, e.g. `FT3W FIG- 1.1` |
| `ASSEMBLY NAME - PAGE` | `figure.name` | 45 distinct values |
| `START DATE` | `figure_part.effective_from` | Uniformly 2026-01-01 in this export |
| `END DATE` | `figure_part.effective_to` | **Empty throughout** — schema supports it, data doesn't use it |
| `QTY` | `figure_part.qty` | Quantity in that figure, not stock |
| `PNC` | `callout.number` | The callout reference on the drawing |
| `UNIT PRICE (CAD)` | `part.list_price` | Single price only — no tier data in source |
| `MAKER` | `part.manufacturer` | **Empty throughout** |
| `S/NS` | `figure_part.serviceable` | `S` throughout — presumed serviceable / non-serviceable |
| `REMARKS` | `figure_part.remarks` | Fitment notes. Load-bearing — see §5 |

**Volume in this one file:** 635 rows, 45 figures, 12 systems, 1 model,
1 variant.

---

## 3. Tables

### Structure

**`product_line`** — id, name, manufacturer, country, is_distributed
Three rows to start. `is_distributed` distinguishes IronHorse (Swedish-made,
distributed) from Agilis (RUFDiamond-designed), which matters for publishing
rights on drawings.

**`model`** — id, product_line_id, name, display_photo, sort_order, status
`status` is draft / published / awaiting_import.

**`variant`** — id, model_id, label, serial_from, serial_to, catalog_revision
The serial range. Customers choose one before seeing any parts. Keep
`serial_from` and `serial_to` as separate columns rather than parsing the label,
so range comparison is possible later.

**`system`** — id, name, sort_order
Global list. Which systems apply to a model is a join, since not every model
has every system.

**`model_system`** — model_id, system_id, enabled
Disabling hides a system's figures from customers without deleting them.

**`figure`** — id, variant_id, system_id, name, group_no, drawing_file_id,
status, sort_order
Belongs to a **variant**, not a model — this is what makes serial-range
differences work.

### Parts

**`part`** — id, part_number, description, manufacturer, list_price, currency,
superseded_by_part_id, status
Global. `part_number` unique. `superseded_by_part_id` self-references so the old
record survives and old figures stay accurate.

**`part_requires`** — part_id, required_part_id, qty
Parses the `REMARKS` relationships into structured data — see §5.

**`figure_part`** — id, figure_id, part_id, qty, remarks, serviceable,
effective_from, effective_to
One row per part per figure. Carries the figure-specific quantity and remarks.

**`callout`** — id, figure_id, figure_part_id, number, x, y
**One row per marker on the drawing.** Several rows may point at the same
`figure_part`, which is what makes multi-occurrence highlighting a simple query
rather than a special case.

### Drawings

**`drawing_file`** — id, filename, format, storage_path, width, height,
uploaded_at, version
`x` and `y` on `callout` are relative to this file's dimensions, so store them
as percentages rather than pixels — the drawing can be replaced at a different
resolution without invalidating every mapping.

### Commerce and access

**`company`** — id, name, type (customer / dealer), discount_rate, price_tier
`discount_rate` is a column, not a constant. Dealers 10%, retail 0%,
configurable per the client's point 5.

**`company_product_line`** — company_id, product_line_id
Which lines a customer may see. A Fat Truck customer gets one row; a dealer
gets several.

**`company_machine`** — company_id, variant_id, unit_reference
The customer's own fleet. Turns machine select into a two-item list instead of
a nine-model grid.

**`user`** — id, company_id, name, email, role_id, status

**`order`** — id, company_id, user_id, variant_id, reference, status,
list_total, discount_applied, net_total, submitted_at
Stores the machine variant so fitment can be checked before quoting.

**`order_line`** — id, order_id, part_id, part_number_snapshot,
description_snapshot, qty, unit_price_snapshot, line_total
Snapshot the identifiers and price at submission. A price change next month must
not rewrite last month's order.

**`audit_log`** — id, actor_user_id, capability, object_type, object_id,
previous_value, new_value, occurred_at

---

## 4. The gap in the source data

The export contains **no drawing files and no callout coordinates.**

It records that PNC 7 on FIG 1.1 is part `31-00469`. It does not contain the
drawing image, and it does not contain where callout 7 sits on that image.

So the migration splits in two:

| Layer | Source | Effort |
|---|---|---|
| Parts, figures, systems, quantities, prices, remarks | The Excel export | Automated import, hours |
| Drawing files | **Unresolved** | Depends on export capability |
| Callout coordinates | **Not in any export** | Manual placement unless the drawings carry them |

For FT3 Wagon alone: 45 figures, and the callout count in this file implies
several hundred markers. Across nine models, several thousand.

**Two questions to settle before the pilot is quoted:**

1. Can the current portal export drawing files — PDF, SVG, DWG, or image?
2. Does RUFDiamond hold the original CAD or drawing source independently of the
   portal?

If the drawings come out as SVG with the callout numerals as text elements,
coordinates can be extracted automatically and this problem mostly disappears.
If they come out as flat raster images, every marker is placed by hand. The
difference between those two answers is the largest cost variable in the
project.

---

## 5. Remarks need parsing, not storing

The `REMARKS` field carries fitment rules in prose — the kind that reads
"Req. 14-00016 (2x), 17-00021" or "Does not include assembly". Two observations:

**It is load-bearing.** A gas spring ordered without its ball socket ends is a
wasted order and a return. In the current portal this column sits in horizontal
overflow, which is why the redesign promotes it inline.

**It is machine-readable enough to extract.** Part-number patterns and
quantities can be pulled into `part_requires` during import, with the original
text kept in `figure_part.remarks` as the fallback. Do the extraction as a
reviewed step, not silently — a mis-parsed fitment rule is worse than an
unparsed one.

---

## 6. Import sequence

1. Product lines, systems — reference data, entered once
2. Model, variants — from `MODEL` and `VARIANTS`
3. Figures — distinct `GROUPNO` + `ASSEMBLY NAME - PAGE` per variant
4. Parts — distinct `PART NO`, deduplicated across figures
5. `figure_part` — one row per source row
6. `part_requires` — parsed from `REMARKS`, flagged for human review
7. Drawing files — separate process, see §4
8. Callouts — `PNC` numbers exist immediately; `x` and `y` require the drawings

Steps 1–6 are a scripted import that runs in minutes. Steps 7–8 are the
project's real work.
