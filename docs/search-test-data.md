# Search test data — FT3 Wagon

Every value below is real: it comes from `Database FT3 Wagon - 14-JUL-2026.xlsx`,
the same import that feeds the portal. 536 parts, 273 of them priced.


## Search by Part Number

| Part number | Description | Price (CAD) | Appears in |
|---|---|---|---|
| `36-00304` | Air filter element, powersports, round taper, clamp-on,  | 279.70 | 1.1 Filters, 10.2 Blower |
| `82-00127` | Pintle hook | 645.86 | 2.1 Bumper and hitch receiver, 2.2 Bumper and winch (option 88-00262 / 88-00263) |
| `51-00045` | Hydraulic motor (poclain mse08) | not priced | 3.1 Hydraulic motor assembly |
| `50-00036` | Hydrostatic pump front | not priced | 4.1 Hydraulic system |
| `23-00124` | WHEEL ASSY 8x8 & V2 | 4,928.55 | 5.1 Wheel assembly |
| `61-00037` | Windshield | 2,397.57 | 6.1 Windows, 6.2 Windshield assembly |
| `42-00007` | Front light near flood 12v | 234.69 | 11.4 Lights, 7.1 Cowling and fender |
| `84-00172` | Accessory belt | not priced | 8.1 Engine accessory belt assembly |
| `35-00007` | Fuel cap | 102.38 | 9.1 Fuel & hydraulic oil tank system |
| `36-00058` | Solenoid valve 3/4", 12v dc, normally closed | 149.03 | 10.1 Tire inflation system |
| `41-00022` | Display dm430e / 11 keys [dm430e-0-0-1-0] | 2,082.00 | 11.1 Console electrical systems |
| `46-00023` | Can gateway cable cg150-2 | 1,570.25 | 12.1 Service & speciality tool |

### Cases worth trying

**A part used in several figures** — the results screen has to list every place it appears:

| Part number | Description | Used in |
|---|---|---|
| `12-210000-121` | M10 nut | 5 figures: 10.2 Blower, 4.2 Hydraulic fan, 6.14 Rear seat 6 seater configuration option (88-00258-1)… |
| `10-210025-121` | Hex flanged screw din 6921 m10 x 1.5 x 25 - zinc | 4 figures: 4.2 Hydraulic fan, 6.13 Rear seat 4 seater front facing configuration option (88-000258-3), 6.9 Brushguards and rack… |
| `12-206000-121` | M6 x 1 hex flanged nut | 4 figures: 6.2 Windshield assembly, 6.4 Windshield center hinge, 6.5 Windshield side hinge… |
| `19-00214` | OIL-EMBEDDED FLANGED SLEEVE BEARING FOR 12 MM SH | 4 figures: 6.4 Windshield center hinge, 6.5 Windshield side hinge, 6.6 Front gate… |
| `39-00019` | 14mm HOSE CLAMP | 3 figures: 10.1 Tire inflation system, 4.2 Hydraulic fan, 9.1 Fuel & hydraulic oil tank system… |

**Parts with no price in the export** — the results screen needs a rule for these:

| Part number | Description |
|---|---|
| `10-006030-120` | M6 bolt |
| `10-008020-120` | M8 x 20 flanged bolt |
| `10-008035-120` | M8 button head bolt |
| `10-106014-121` | M6 side panel bolt |
| `10-106050-121` | M6 hex screw |

**A partial number** — `61-001` matches these, so the search should be a prefix or contains match, not exact:

- `61-00115` — Front car operator left window
- `61-00121` — Front car passenger left window
- `61-00126` — Frontcar passsenger right window
- `61-00127` — Front car operator right window
- `61-00139` — Left a pillar window
- `61-00140` — Right a pillar window
- `61-00141` — Rear window
- `61-00143` — Rear hatch assembly

`61-001` → 13 matches in all.

**No match** — nothing in the catalogue starts with this, for the empty state:

- `99-99999`


## Search by Description

**Parts** is how many part records match. **Rows** is how many lines the
results screen prints, which is larger: the screen lists one row per PLACE a
part is used, so a part fitted on three figures is three rows. Check against
Rows when reading the screen, against Parts when testing the query itself.

| Term | Parts | Rows | A part it finds |
|---|---|---|---|
| `air filter` | 2 | 3 | Air filter donaldson |
| `filter` | 7 | 8 | Hatz oil filter |
| `hose` | 31 | 35 | Hose/tube seal clamp 1-5/8" to 1-7/8" |
| `seat` | 13 | 14 | Rh seat & safety belt |
| `radiator` | 11 | 14 | Radiator bushing support |
| `bolt` | 17 | 20 | M6 bolt |
| `windshield` | 10 | 14 | Gas spring (lexan windshield) |
| `latch` | 14 | 17 | Rotary push-to-close latch, striker bolt , steel, zi |
| `bearing` | 1 | 4 | OIL-EMBEDDED FLANGED SLEEVE BEARING FOR 12 MM SHAFT  |
| `pump` | 5 | 5 | Charge pump |
| `valve` | 10 | 10 | Air release valve clamp |
| `cable` | 18 | 20 | Tailgate cable |
| `fuse` | 3 | 3 | Mega®/ amg safety fuse block with cover, 300a, 32vdc |
| `light` | 14 | 17 | Rear light |
| `tire` | 5 | 5 | Tire 63 x 24-24. |
| `window` | 9 | 10 | Front car operator left window |
| `clamp` | 18 | 23 | Vibration damping clamp |

### Cases worth trying

- `zinc plated` — 26 parts / 47 rows, a two-word term; the search has to handle a phrase, not just one word.
- `air filter` — the deck's own placeholder, and the field's placeholder text; 2 parts / 3 rows.
- `screw` — 33 parts / 52 rows, all fasteners; the longest list, and the one that scrolls.
- `bearing` — 1 part but 4 rows, the clearest case of one part on several figures.
- `grommet` — 2 parts / 2 rows, a short result list.
- `xyzzy` — no matches, for the empty state.


## State of the screen

The results screen is built, to slides 19 and 20: ten columns, tick-to-select,
the page reference linking through to its figure, and an empty state for a term
that matches nothing. Both modes work from the brand screen's two boxes.

Still open: slides 21–27 of the deck, which cover the rest of the search
journey and have not been read against this screen.
