# Open items for RUFDiamond

Questions and confirmations for the client. Kept current as work proceeds —
add here rather than burying a decision in a commit message.

Status key: **BLOCKING** stops work · **DECIDE** shapes work already underway ·
**CONFIRM** an assumption we have made and proceeded on · **LATER** phase two.

---

## 1. Design and front end

### 1.0 The admin console has been removed — DECIDE
On instruction, the admin console was removed from the front end because the
V2 deck covers the customer side only. **Its behaviour is recorded in
`docs/admin-features.md`** and the code remains in git at commit `1fe7668`.
No data-layer code was removed.

This is the one decision with a schedule cost attached: the **figure / hotspot
editor** went with it, and that is the tool used to place callout markers.
**566 of 572 markers are still unplaced.** Nothing can place them until that
screen is rebuilt, so designs for it are the highest-priority admin item.

### 1.1 Screens with no design — DECIDE
The V2 deck (`Screens New RD Parts Portal - V2 - 30-SEP-2026.pptx`, 56 slides)
covers the customer side only. These are built or needed and have no design:

**Customer**
| Screen | Note |
|---|---|
| Quote Status | Nav button exists; slide 3 describes a quote history table; no screen drawn |
| Order Status | Nav button exists; slide 56 describes it in prose; no screen drawn |
| Technical Info | Deck states this is phase two |
| Sign-in / account | Nothing in the deck, but profiles, saved carts and order history all require it |

*Support and Website need no screen — they open the mail client and an external
site.*

**Admin console — no coverage at all**
| Screen | Note |
|---|---|
| Admin shell | Left nav rail and the record bar |
| Catalog | Stat strip, models grouped by product line |
| Model editor | Systems checklist, serial variants |
| Figure / hotspot editor | Callout mapping — the tool the pilot exists to deliver |
| Parts browser | Filters, CSV import and export |
| Orders inbox | Quoting and status |
| Publishing board | Ready/blocked queue, history, rollback |

**Recommendation:** the last three will change shape once the quote flow lands —
the Orders inbox becomes Quote Status admin with Factory Price and Customer
Price side by side. Better to design those against the new flow than against
the screens we have today.

### 1.2 The portal is dark, not light — CORRECTED
Recorded because an earlier build had it wrong. Every slide sets its own
background to theme `tx1` at `lumMod 85% / lumOff 15%`, which resolves to
**`#262626`**. The palette measured from the slides:

| Token | Value | Used for |
|---|---|---|
| ground | `#262626` | every screen's background |
| panel outline | `#7F7F7F` | 1px rule around content panels |
| surface | `#FFFFFF` | rail cards, drawing plate, parts table |
| button | `#747474` fill, `#E6E9EC` 0.8px edge | toolbar and actions, white bold 12pt |
| date pill | `#D0D0D0` with `#747474` text | header, top right |
| table header | `#E8E8E8` | parts table head |

Title is white, 28pt. Rail labels are bold 8pt. Slide 3 states that selection
is shown by **highlighting a button's outline**, so active navigation is an
outline, not a fill.

### 1.3 Typeface licensing — DECIDE
The deck sets its text in **Biome** (472 of 524 runs). Biome is a licensed
Monotype family and a web licence is separate from a desktop one.

- Does RUFDiamond hold a web font licence for Biome?
- If not, do they want the closest free substitute, or a different face chosen
  deliberately?

The deck's own theme is the stock Office theme (Aptos), so it carries no brand
palette — the portal's colours are being taken from the screens themselves:
white ground, black text, grey table headers, RUF Diamond red as the single
accent, sampled as `#D0212E` from the wordmark on the parts catalogue cover.

### 1.4 Model photographs — CONFIRM
Seven Fat Truck models are shown on the deck's model grid, but the deck
contains only **five distinct photographs**: 2.8 Wagon, 2.8C and FT3 Wagon all
reuse the same render. Are those placeholders, and can RUFDiamond supply a
photograph per model? We are using the deck's images meanwhile, resized for
web.

### 1.5 Hero images are missing from the deck — BLOCKING (for the login screen)
The login screen (slide 1) carries two large photographs down the left. Both
are **linked, not embedded**, so they did not travel with the file — the deck
references them from the designer's own machine. We are showing a placeholder
panel meanwhile. Please send those two images, or say what should sit there.

### 1.6 The PDF export arrived corrupted — BLOCKING (for design fidelity)
`PDF Screens New RD Parts Portal - V2 - 30-SEP-2026.pdf` cannot be opened: it
contains **19,871,315 UTF-8 replacement characters**, meaning the binary was
decoded as text somewhere in transit. Every compressed stream is destroyed and
all 56 pages render blank. The file is 88 MB where the original was ~49 MB —
the inflation is the corruption itself.

To send a good copy: export from Keynote to the Desktop, then drag that file
in directly. Do not route it through anything that treats it as text.

Meanwhile the screens are being read from the PPTX, which is intact.

### 1.7 Dealer logo — CONFIRM
Slide 53 shows a "Dealer Logo" placeholder on the customer quote request, and
the screens carry a logo block top-left. Is that RUFDiamond's own mark
everywhere, or does a dealer's own logo appear for their users?

---

## 2. Catalogue data

### 2.1 Half the catalogue has no price — DECIDE
**263 of 536 parts** carry `UNIT PRICE (CAD)` of 0 in
`Database FT3 Wagon - 14-JUL-2026.xlsx`. Full list delivered as
`unpriced-parts-ft3-wagon.csv`.

Mostly fasteners, but not only: `51-00045 Hydraulic motor (Poclain MSE08)` and
`19-00511 O-ring seal` are among them.

**Decided:** the portal prints exactly what the export carries, so these show as
`0.00`, matching the design deck. **Still open:** will RUFDiamond supply the
missing prices, and when?

### 2.2 Section 11 figure numbering is wrong at source — CONFIRM
`FIG- 11.3` in the export carries **two** assembly names — *Fuse box & firewall*
and *Overhead controls* — and their PNCs collide 11 times (PNC 1 resolves to
both `89-00193` and `49-00021`, and so on). There is no `11.2` at all.

The schematics pack numbers *Overhead controls* as `11-2`, which fills the gap
and removes the collision. **We have corrected Overhead controls to 11.2 on that
basis.** Please confirm this matches the factory's intent.

### 2.3 The export drops text the printed catalogue carries — CONFIRM
On FIG 12.1 the printed catalogue marks two CAN cables
`CABLE FOR SERVICE TOOL - NOT SHOWN`; the export carries only
`CABLE FOR SERVICE TOOL`. The `- NOT SHOWN` suffix is gone.

This matters because a remark saying an item is not shown is what stops us
creating a callout for it. Two callouts on that figure will therefore never be
placeable and will block publication until corrected.

- Is the export truncating `REMARKS`, or was it entered differently?
- If it truncates, how many other rows are affected?

### 2.4 Figure identity — CONFIRM
- Figures must be keyed on **(GROUPNO, ASSEMBLY NAME)**, not GROUPNO alone —
  44 distinct group numbers but 45 distinct pairs.
- **The catalogue has 45 figures.** `build-plan.md` says 44 and
  `catalog-data-structure.md` says 45; the export settles it.
- FIG 12.1 is `SERVICE & SPECIALITY TOOL` in the export but
  `POCLAIN INSTALLATION TOOL` on the schematic. Which name is correct?

### 2.5 Serial range is masked in the export — DECIDE
The export gives `SERIAL NUMBER 99FT3WXXXXXX and up`. The printed catalogue
cover gives `99FT3W251001 and up`, and the catalogue is `Rev 2` where our data
says revision `A`. Which should the portal display?

### 2.6 Three figures have no schematic — CONFIRM
`5.3 Wheel pods assembly`, `6.15 Safety and tools` and `11.1 Battery` appear in
the printed contents. Only 6.15 has parts in the export; the other two have
neither parts nor a plate and have not been created. Are they real figures?

### 2.7 Non-numeric callout references — DECIDE
One row (FIG 11.5, `85-00011`) has a PNC of `A` rather than a number, and the
deck's own sample data shows `REF. NO.` values of `1*` and `1**` and `QTY` of
`AR` (as required).

Our data model types both as integers. The FT3 Wagon export does not need it,
but if other models do, both fields need widening. Do other models use letters,
asterisks or `AR`?

---

## 3. Drawings

### 3.1 Vector artwork — the highest-value question — DECIDE
The plates arrived as **flat PNG renders**, and the parts catalogue PDF has no
text layer at all (54 bytes across 54 pages; no embedded fonts).

If Zeal Motor can supply the same plates as **SVG, or PDF with live vector
artwork**, three things follow at once:

1. Callout coordinates can be extracted automatically, largely removing the
   manual mapping of **566 markers across 43 figures** — the single largest
   labour item in the pilot.
2. Highlighting a selected part becomes exact on all 45 figures, instead of
   the partial reconstruction we can manage from raster.
3. Drawings stay crisp at any zoom, which matters for the Cropped Part view.

**Ask specifically:** does Zeal Motor hold the original CAD, and can they export
per-figure vector artwork independently of the current portal?

### 3.2 Marker placement is manual until then — CONFIRM
6 of 572 callouts are placed. Detection from the raster plates matches the
expected count exactly on 23 of 44 plates, which makes those semi-automatic;
the rest need placing by hand in the figure editor. Recording how long the
first model takes is what makes the remaining eight models quotable.

---

## 4. Commercial flow — phase two

Recorded now so the schema can anticipate it. Slides 53–56 specify:

- Submit Quote Request generates **two documents** (Factory and RUFDiamond)
  sharing one sequential number, sent simultaneously.
- Factory returns a quotation **by email, manually**.
- Admin records **Factory Price and Customer Price separately**; the customer
  must never see Factory Price.
- Admin can add part numbers **not in the catalogue** and the customer can
  order them.
- Customer accepts all or part of the quote, generating a **Factory Order** and
  a **RUFDiamond Order**.
- Admin assigns a **XERO Purchase Order Number** by hand; portal must not
  generate it. XERO integration is a later phase.

**Agreed:** front end first, this flow second.

Open within it:
- **4.1** Who at RUFDiamond may see Factory Price? This needs a capability of
  its own, granted narrowly.
- **4.2** Quote Request numbering — one global sequence, or per brand?
- **4.3** How does the portal *send* the two documents — SMTP from the server,
  or does it hand the admin a PDF to send?
- **4.4** Does an expired or superseded quotation need a validity date?

---

## 5. Carried forward from the earlier specifications

Still unanswered from `capability-and-role-spec.md` §7 and
`backup-and-recovery-plan.md`:

- **5.1** Should technicians see pricing? Recommended as a per-company setting
  rather than a global rule.
- **5.2** Who holds `publish.execute` — one named person, or anyone in parts
  and service?
- **5.3** Do dealers order for end customers or for their own stock? Determines
  whether `orders.behalf` is needed in phase one.
- **5.4** How long can the portal be unavailable before it costs real money?
  Decides whether a warm standby is worth roughly double the hosting cost.
- **5.5** Is Canadian data residency contractually required by any mining,
  utility or defence customer?

---

## 6. Next models

The deck illustrates with **FAT TRUCK 2.4P**, but only FT3 Wagon has data.
Confirmed: build against FT3 Wagon for now.

To load any further model we need, per model: the parts export in the same
sixteen-column format, and the schematics pack. Worth asking which model is
next so the request can go to the factory early — the drawings are the long
pole, not the spreadsheet.
