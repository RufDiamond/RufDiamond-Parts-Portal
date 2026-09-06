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

| Term | Matches | A part it finds |
|---|---|---|
| `filter` | 7 | Hatz oil filter |
| `hose` | 31 | Hose/tube seal clamp 1-5/8" to 1-7/8" |
| `seat` | 13 | Rh seat & safety belt |
| `radiator` | 11 | Radiator bushing support |
| `bolt` | 17 | M6 bolt |
| `windshield` | 10 | Gas spring (lexan windshield) |
| `latch` | 14 | Rotary push-to-close latch, striker bolt , steel, zi |
| `bearing` | 1 | OIL-EMBEDDED FLANGED SLEEVE BEARING FOR 12 MM SHAFT  |
| `pump` | 5 | Charge pump |
| `valve` | 10 | Air release valve clamp |
| `cable` | 18 | Tailgate cable |
| `fuse` | 3 | Mega®/ amg safety fuse block with cover, 300a, 32vdc |
| `light` | 14 | Rear light |
| `tire` | 5 | Tire 63 x 24-24. |

### Cases worth trying

- `zinc plated` — 33 matches, a two-word term; the search has to handle a phrase, not just one word.
- `air filter` — the deck's own placeholder; 2 matches.
- `screw` — 32 matches, all fasteners; a good test of a long result list.
- `grommet` — 2 matches, a short result list.
- `xyzzy` — no matches, for the empty state.


## What is not built yet

The two search boxes on the brand screen already route to
`/search?mode=part|description&q=…`, but that route is still a placeholder —
the results screens are slides 17–27 and have not been built. So these values
will not return anything on screen yet; they are here so the results screens
can be built and checked against real data the moment the design is settled.
