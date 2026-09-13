/**
 * Stage 4 — parts tables for the pilot systems.
 *
 * Systems 1, 2 and 3: four figures, forty rows. A deliberate spread — a
 * trivial figure, one with `NOT SHOWN` rows, one that is itself an option,
 * and one with more not-shown rows than shown.
 *
 * PROVENANCE. These rows were read from pages 1–4 of the source catalog, now
 * held at `docs/source/96-00073-parts-catalog-ft3-rev2.pdf`
 * (`sha256 00698197a467…`, 54 pages). It has no text layer, so every value
 * came through a vision read rather than a parse, and none of them has been
 * checked against the document a second time.
 *
 * That is exactly why they load as `extraction_row` records first. Nothing
 * here is trusted: part numbers are format-checked, rows that fail are held,
 * and every accepted row keeps a link back to the page it came from.
 */

export interface SourceRow {
  itemNo: number;
  partNumber: string;
  description: string;
  qty: number;
  notes: string | null;
}

export interface SourceTable {
  groupNo: string;
  sourcePage: number;
  /**
   * Marker numbers visible on the plate, read from the drawing itself. Held
   * separately from the rows so the two can be cross-checked: a row that is
   * shown but has no marker, or a marker with no row, is a finding rather
   * than something to paper over.
   */
  calloutNumbersOnPlate: number[];
  rows: SourceRow[];
}

export const PILOT_TABLES: SourceTable[] = [
  {
    groupNo: "1.1",
    sourcePage: 1,
    calloutNumbersOnPlate: [1, 2, 3, 4, 5, 6],
    rows: [
      { itemNo: 1, partNumber: "36-00304", description: "BLOWER AIR FILTER", qty: 1, notes: null },
      { itemNo: 2, partNumber: "31-00469", description: "FUEL FILTER", qty: 1, notes: null },
      { itemNo: 3, partNumber: "56-00007", description: "HYDRAULIC OIL FILTER", qty: 2, notes: null },
      { itemNo: 4, partNumber: "35-00068", description: "AIR FILTER ENGINE", qty: 1, notes: null },
      { itemNo: 5, partNumber: "30-00040", description: "OIL FILTER ENGINE", qty: 1, notes: null },
      { itemNo: 6, partNumber: "31-00471", description: "FUEL PRE-FILTER", qty: 1, notes: null },
    ],
  },
  {
    groupNo: "2.1",
    sourcePage: 2,
    calloutNumbersOnPlate: [1, 2, 3, 4, 5, 6, 7],
    rows: [
      { itemNo: 1, partNumber: "82-00127", description: "PINTLE HOOK", qty: 1, notes: "TOW PACKAGE OPTION (88-00023)" },
      { itemNo: 2, partNumber: "10-404012-122", description: "M10 HEX SCREW", qty: 3, notes: "MIDDLE NOT SHOWN" },
      { itemNo: 3, partNumber: "13-110020-122", description: "M10 WASHER", qty: 3, notes: "MIDDLE NOT SHOWN" },
      { itemNo: 4, partNumber: "12-210000-12", description: "M10 HEX FLANGED NUT", qty: 3, notes: "MIDDLE NOT SHOWN" },
      { itemNo: 5, partNumber: "70-02270", description: "RECEIVER HITCH BUMPER", qty: 1, notes: "FRONT OR REAR BUMPER" },
      { itemNo: 6, partNumber: "19-00210", description: "NONSLIP BUMPER", qty: 2, notes: "OTHER SIDE NOT SHOWN" },
      { itemNo: 7, partNumber: "62-00881", description: "DOOR STOPPER SHIM", qty: 2, notes: "OTHER SIDE NOT SHOWN" },
      { itemNo: 8, partNumber: "10-210016-121", description: "M10 DOOR STOPPER SCREW", qty: 4, notes: "NOT SHOWN" },
      { itemNo: 9, partNumber: "10-110100-121", description: "M10 BUMPER TO FRAME SCREW", qty: 2, notes: "NOT SHOWN" },
    ],
  },
  {
    groupNo: "2.2",
    sourcePage: 3,
    calloutNumbersOnPlate: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
    rows: [
      { itemNo: 1, partNumber: "82-00127", description: "PINTLE HOOK", qty: 1, notes: "TOW PACKAGE OPTION (88-00023)" },
      { itemNo: 2, partNumber: "87-00136", description: "WINCH FAIRLEAD", qty: 1, notes: null },
      { itemNo: 3, partNumber: "80-00013", description: "WINCH MOUNTED HITCH RECEIVER", qty: 1, notes: null },
      { itemNo: 4, partNumber: "10-710050-145", description: "M12 THREADED ROD STUDS", qty: 4, notes: null },
      { itemNo: 5, partNumber: "87-00320", description: "FRONT WINCH BUMPER", qty: 1, notes: null },
      { itemNo: 6, partNumber: "87-00107", description: "WARN 81400 CONTACTOR", qty: 1, notes: null },
      { itemNo: 7, partNumber: "87-00071", description: "8000 LBS WINCH", qty: 1, notes: null },
      { itemNo: 8, partNumber: "62-00881", description: "DOOR STOPPER SHIM", qty: 2, notes: "FOR ADJSUTMENT - OTHER SIDE NOT SHOWN" },
      { itemNo: 9, partNumber: "19-00210", description: "NONSLIP BUMPER", qty: 2, notes: "OTHER SIDE NOT SHOWN" },
      { itemNo: 10, partNumber: "10-110100-121", description: "M10 HEX SCREW", qty: 3, notes: "MIDDLE NOT SHOWN" },
      { itemNo: 11, partNumber: "13-110020-122", description: "M10 WASHER", qty: 3, notes: "MIDDLE NOT SHOWN" },
      { itemNo: 12, partNumber: "12-210000-122", description: "M10 NUT TOP LOCK", qty: 3, notes: "MIDDLE NOT SHOWN" },
      { itemNo: 13, partNumber: "10-504020-120", description: "DOOR STOPPER SCREW", qty: 4, notes: "NOT SHOWN - FOR 19-00210" },
      { itemNo: 14, partNumber: "12-504000-121", description: "DOOR STOPPER NUT", qty: 4, notes: "NOT SHOWN - FOR 19-00210" },
      { itemNo: 15, partNumber: "87-00329", description: "WARN WINCH ROPE 8000 LBS 100FT", qty: 1, notes: "NOT SHOWN - REPLACEMENT PART" },
      { itemNo: 16, partNumber: "87-00195", description: "WINCH REMOTE CONTROLLER 8000 LBS", qty: 1, notes: "NOT SHOWN - REPLACEMENT PART" },
      { itemNo: 17, partNumber: "87-00332", description: 'ROLLER TYPE FAIRLEAD 10"', qty: 1, notes: "SPECIAL FAIRLEAD WITH LOW PROFILE ROLLERS" },
    ],
  },
  {
    groupNo: "3.1",
    sourcePage: 4,
    calloutNumbersOnPlate: [1, 2, 3, 4],
    rows: [
      { itemNo: 1, partNumber: "51-00045", description: "HYDRAULIC MOTOR (POCLAIN MSE08)", qty: 1, notes: "WITH AIR GAP" },
      { itemNo: 2, partNumber: "10-316060-121", description: "M16 SOCKET SCREW", qty: 10, notes: "MOUNTING HARDWARE" },
      { itemNo: 3, partNumber: "12-216000-122", description: "M16 FLANGED NUT", qty: 10, notes: "MOUNTING HARDWARE" },
      { itemNo: 4, partNumber: "19-00204", description: "M14 WHEEL STUD", qty: 8, notes: null },
      { itemNo: 5, partNumber: "46-00107", description: "SPEED SENSOR", qty: 1, notes: "NOT SHOWN" },
      { itemNo: 6, partNumber: "56-00066", description: "HYDRAULIC MOTOR SOUND COVER", qty: 4, notes: "NOT SHOWN" },
      { itemNo: 7, partNumber: "19-00511", description: "O-RING SEAL", qty: 1, notes: "WHEEL SEAL - NOT SHOWN" },
      { itemNo: 8, partNumber: "41-00243", description: "SPEED SENSOR POCLAIN FT3/FT5", qty: 1, notes: "NOT SHOWN" },
    ],
  },
];
