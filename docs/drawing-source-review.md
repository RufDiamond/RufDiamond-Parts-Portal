# Drawing source review

RUFDiamond parts portal · FT3 Wagon pilot · September 2026

Findings from the three sources the client supplied on 3 September 2026:

| Source | Contents |
|---|---|
| `96-00073 - Parts_catalog_FT3-REV.2.pdf` | 54 pages, Zeal Motor's own publication, Rev 2 |
| `FT3W - SCHEMATICS` | 44 PNG plates, foldered by system |
| `Database FT3 Wagon - 14-JUL-2026.xlsx` | 635 rows, the 16 columns of §2 |

This closes open question 1 in `backend-specification.md` §6.

**Where the three disagree, the export wins.** It is the parts system's own
output and the only one of the three carrying prices. The PDF contents in
particular has drifted and should not be used to key anything.

---

## 1. The PDF carries no extractable text

`pdffonts` reports no embedded fonts. `pdftotext` over all 54 pages returns 54
bytes — one form feed per page. The producer is "Microsoft: Print To PDF",
which rasterised every page; a few pages are vector paths with the glyphs
converted to outlines.

**So there are no free callout coordinates.** The optimistic case in
`catalog-data-structure.md` §4 — SVG with the numerals as text elements — does
not apply. Nothing can be lifted out of the PDF structure mechanically.

The PDF remains valuable as the authority for figure identity, for the `Notes`
column, and as an independent cross-check on the spreadsheet import.

## 2. The schematics pack solves the drawing-file half

44 plates arrived as PNG, 25 MB total, almost all 1280×720 (two larger:
`7-2 Lower frame panels` at 3856×2459 and `8-4 Exhaust` at 1893×889).

These are clean digital renders with the callout markers already drawn on
them. RUFDiamond can therefore produce drawing files **without the current
portal**, which was the second half of open question 1.

## 3. Coordinate extraction is partly automatable

The markers are machine-drawn primitives — a thin-stroke box or circle
enclosing one or two digits, terminating a leader line. Detecting the enclosed
white interior at a luminance threshold of 160 and filtering for square-ish
regions found **6 of 6 markers on FIG 1.1**, and the positions it returned are
the ones now in the seed; they land exactly on the printed boxes.

The same detector over-triggers badly on dense CAD line art — 14 candidates on
FIG 3.1, which has 4 real markers, because the exploded hardware encloses
similar white regions. It needs a second discriminator (interior must contain a
digit-shaped blob; marker must terminate a leader line) before it is usable
across the set.

**Estimate deliberately withheld.** Photo-style plates look close to solved;
line-art plates are unproven. A prototype across ten mixed plates would give a
real hit rate, and that number is what makes the remaining eight models
quotable — per `build-plan.md` stage 10.

## 4. Reconciling the sources

**The figure count is 45**, as `catalog-data-structure.md` says. `build-plan.md`
says 44 and is wrong; the PDF contents lists 47 and is wrong.

The export contains 44 distinct `GROUPNO` values but **45 distinct
(`GROUPNO`, `ASSEMBLY NAME`) pairs**, so the composite is the real key. All 44
supplied plates match a figure. One figure has no plate:

| Figure | Status |
|---|---|
| 6.15 Safety and tools | No schematic supplied — `drawingFileId: null` |

`5.3 Wheel pods assembly` and `11.1 Battery` appear in the PDF contents but
carry no rows in the export and no plate. They are not in the catalogue data
and have not been created.

### Section 11 — the export and the plates agree; the PDF does not

`FIG- 11.3` in the export carries **two** assembly names, Fuse box & firewall
and Overhead controls, and their PNCs collide 11 times (PNC 1 resolves to both
`89-00193` and `49-00021`, and so on down to 11). It is unambiguously two
figures sharing one number, and the export has no `11.2` at all.

The schematics folder numbers Overhead controls `11-2` and Fuse box `11-3`,
which fills the gap and removes the collision. **The import therefore corrects
Overhead controls from 11.3 to 11.2**, and the two sources then agree
completely across all five electrical figures.

The PDF contents is the outlier: it numbers section 11 `11.1, 11.2, 11.3, 11.3,
11.5, 11.5` and inserts a Battery figure that exists in neither other source.
An earlier draft of this review shifted the plates to 11.2–11.6 on the PDF's
authority; the export shows that was wrong and it has been reverted.

**Confirm the 11.3 → 11.2 correction with the client.** It is a well-supported
inference, not a derivation.

### 12.1 is named differently in each source

The export calls it `SERVICE & SPECIALITY TOOL`; the plate is
`12-1 POCLAIN INSTALLATION TOOL`. The export's name is used and the plate
attached. Worth a question.

### Other data-quality items to raise

- **The contents page references are off by one** in at least section 8: it
  points 8.2 at page 36; 8.2 is printed on page 35.
- **Section headings straddle page breaks.** `8.3 Engine mounts` is printed at
  the foot of page 35 with its drawing on page 36. Page → figure is not 1:1 in
  either direction.
- **A figure's parts table spills across pages** with a repeated header —
  4.1 runs pages 5–6, 6.2 runs 14–15.
- **One marker on page 34 renders as a lowercase `b`** where the leader points
  at row 6.
- **The cover states serial `99FT3W251001 and up`.** The spreadsheet export has
  it masked as `99FT3WXXXXXX`. The catalogue is `Rev 2`; the seed carries
  revision `A`.

## 5. "Not shown" is a third state, and it decides 63 rows

73 of the 635 rows carry a remark containing `NOT SHOWN`. These are **not**
unmapped callouts and must never be counted as such — a figure part with no
marker on the plate is complete, and only a *callout* missing a position or a
part blocks publication.

The distinction that matters is whether the item itself is absent from the
plate or merely *some of its instances* are:

| Remark | Meaning | Callout |
|---|---|---|
| `NOT SHOWN`, `... - NOT SHOWN`, `(NOT SHOWN)` | No marker on the plate | **Not created** |
| `MIDDLE NOT SHOWN` | Marker exists; middle instances omitted | Created |
| `OTHER SIDE NOT SHOWN` / `RIGHT SIDE NOT SHOWN` | Marker exists; mirrored instance omitted | Created |

**Getting this backwards would permanently block publication**, because 59
callouts would sit for ever waiting for a position that no drawing will ever
carry.

### Four rows have a non-numeric PNC

Three are whole-assembly line items (`-`) whose remarks read "Includes parts
1-18" or "Excludes parts #18 to #23". One is lettered `A` on FIG 11.5 and its
remark ends "NOT SHOWN". None produces a callout; all four keep their
`figure_part`.

**A schema note.** `Callout.number` is typed `number`, and the lettered `A`
shows the source does not guarantee that. It costs nothing here — that row has
no marker anyway — but a plate with a genuine lettered callout would not be
representable. Widening it to a string affects sorting and display in six
places and has not been done.

## 6. Multi-occurrence — confirmed, but one cited example is wrong

The headline request is real and visible in the plates:

- **FIG 6.4 draws callout 5 twice**, two circles pointing at the two M5×40
  screws.
- **FIG 6.2 carries `10-405025-122` at both callout 2 and callout 18**, under
  two different descriptions.

The export has **exactly seven** cases of one part appearing twice in one
figure, which is where the "seven cases" in `catalog-data-structure.md` §1 comes
from. But only **five** are genuine second positions:

| Figure | Part | PNCs | Genuine? |
|---|---|---|:-:|
| 6.2 | `10-405025-122` | 2, 18 | yes |
| 6.12 | `65-00369` | 7, 10 | yes |
| 6.14 | `67-00008` | 1, 4 | yes |
| 6.17 | `84-00210` | 2, 16 | yes |
| 11.5 | `85-00031` | 4, 6 | yes |
| 8.1 | `36-00157` | 4, 13 | **no** — 13 is the without-A/C variant, `NOT SHOWN` |
| 8.1 | `36-00338` | 7, 14 | **no** — 14 is the without-A/C variant, `NOT SHOWN` |

The two FIG 8.1 cases cited by name in the data-structure document are option
variants, not second positions. **The correct count is five**, and the import's
not-shown rule removes the other two automatically.

## 7. What the import produced

| | |
|---|---|
| Rows read | 635 |
| Parts created (deduplicated) | 536 |
| Figures created | 45 |
| `figure_part` rows | 635 |
| Callouts created | 572 |
| — already placed | 6 (FIG 1.1, mapped against the plate) |
| Callouts not created — remark says not shown | 59 |
| Callouts not created — PNC not numeric | 4 |

572 + 59 + 4 = 635. Every row is accounted for.

**`part_requires` was deliberately not populated.** 29 remarks contain
something that looks like a part number, but most are option-kit references
(`TOW PACKAGE OPTION (88-00023)`) rather than fitment requirements, and only a
handful (`Add 40-00037 for HORN BUTTON`, `For left side latch p/n 17-00037`)
are genuine. Per §5 of `catalog-data-structure.md` the extraction is a reviewed
step, so the remark text is kept verbatim on `figure_part.remarks` and the
structured links are left for a human pass.

---

## 8. Part highlighting from raster plates

Selecting a part fills its own artwork red, not just its marker. This is
reconstructed geometry, because the plates are flat renders — the technique and
its limits:

1. Flood-fill the enclosed light region a seed point falls in.
2. Fill the region's holes, so a window frame and its glass become one shape.
3. Trace the boundary with marching squares and simplify it.
4. Store the result as an SVG path in plate percentages on `callout.maskPath`.

Rejected wherever a fill exceeds 10% of the plate — that means the outline was
open and the fill escaped into the page ground, which would flash the whole
drawing red. Rejection is silent and the marker highlights alone.

**Seeds cannot be derived from the marker.** A marker sits at the end of a
leader line, off the part, and a part is usually several regions (frame, pane,
detail) that must be merged. Automatic nearest-region assignment was tried on
FIG 6.1 and mis-assigned roughly half — callout 3 took a piece of window 5's
frame, and 4, 6, 7 and 9 caught only a fragment of their window. Seeding is a
human judgement and belongs in the hotspot editor as a second click.

### Where it works

Measured across all 44 plates as closed part-sized regions against callout
count. Flat-panel figures do well; dense exploded hardware does not.

| | Figures | Character |
|---|---|---|
| Strong | 22 | Windows, panels, gates, consoles, electrical trays |
| Partial | 6 | Mixed panels and hardware |
| Poor | 16 | Fittings, hoses, fasteners, overlapping line art |

Poor includes FIG 4.1 Hydraulic system (1 region against 26 callouts), 8.6 Air
to air cooler (0 against 24) and 2.1 Bumper and hitch receiver (0 against 7).
On those plates nothing is separable and marker-only highlighting is the whole
answer.

**Vector plates would make all of this redundant** and exact on all 45 figures,
with no seeding, no area caps and no failures — see §1. This is worth building
only if the answer on vector artwork is a firm no.
