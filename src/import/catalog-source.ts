/**
 * The FT3 Wagon catalog structure, transcribed from
 * `96-00073 - Parts_catalog_FT3-REV.2.pdf` (Zeal Motor, Rev 2, publication
 * 2026).
 *
 * Reference data, not extraction output: this is the contents page, which is
 * short enough to transcribe exactly and is the authority on what figures
 * exist. Parts rows are a different matter and go through the review queue —
 * see `pilot-tables.ts`.
 *
 * Two defects in the source contents page are preserved rather than corrected
 * away. `printedGroupNo` records what the document prints; `groupNo` is the
 * corrected value the database keys on.
 *
 *   - Two figures are printed `11.3`, two more `11.5`, and `11.4` is skipped.
 *   - Page references are wrong in places: 4.1 and 4.2 both claim page 7, and
 *     the last entries run past the document's 54 pages. `sourcePage` is
 *     therefore recorded as printed and treated as a hint, never a key.
 */

export interface SourceSystem {
  code: number;
  id: string;
  name: string;
}

export interface SourceFigure {
  systemCode: number;
  /** Corrected, unique within the variant. */
  groupNo: string;
  /** As printed, when it differs from `groupNo`. */
  printedGroupNo?: string;
  name: string;
  /** Page printed in the contents page. Unreliable — see the note above. */
  sourcePage: number | null;
  /**
   * Part numbers of the option kits this whole figure belongs to, taken from
   * the parenthesised codes in its title.
   */
  optionPartNumbers?: string[];
}

/** The twelve systems, matching the ids already seeded in `src/data/seed.ts`. */
export const SOURCE_SYSTEMS: SourceSystem[] = [
  { code: 1, id: "sys-filters", name: "Filters" },
  { code: 2, id: "sys-frame-assy", name: "Frame assy" },
  { code: 3, id: "sys-drive-system", name: "Drive system" },
  { code: 4, id: "sys-hydraulic", name: "Hydraulic" },
  { code: 5, id: "sys-tire-wheel", name: "Tire & wheel" },
  { code: 6, id: "sys-cabin", name: "Cabin" },
  { code: 7, id: "sys-cowling-fender", name: "Cowling & fender" },
  { code: 8, id: "sys-engine", name: "Engine" },
  { code: 9, id: "sys-fuel-system", name: "Fuel system" },
  { code: 10, id: "sys-tire-inflation", name: "Tire inflation system" },
  { code: 11, id: "sys-electric", name: "Electric" },
  { code: 12, id: "sys-accessories", name: "Accessories" },
];

/** Forty-seven figures. The delivery holds plates for forty-four of them. */
export const SOURCE_FIGURES: SourceFigure[] = [
  { systemCode: 1, groupNo: "1.1", name: "Filters", sourcePage: 1 },

  { systemCode: 2, groupNo: "2.1", name: "Bumper and hitch receiver", sourcePage: 2 },
  {
    systemCode: 2,
    groupNo: "2.2",
    name: "Bumper and winch",
    sourcePage: 3,
    optionPartNumbers: ["88-00262", "88-00263"],
  },

  { systemCode: 3, groupNo: "3.1", name: "Hydraulic motor assembly", sourcePage: 4 },

  { systemCode: 4, groupNo: "4.1", name: "Hydraulic system", sourcePage: 5 },
  { systemCode: 4, groupNo: "4.2", name: "Hydraulic fan", sourcePage: 7 },
  { systemCode: 4, groupNo: "4.3", name: "Oil cooler", sourcePage: 9 },
  { systemCode: 4, groupNo: "4.4", name: "Charge pump", sourcePage: 10 },

  { systemCode: 5, groupNo: "5.1", name: "Wheel assembly", sourcePage: 11 },
  { systemCode: 5, groupNo: "5.2", name: "Wheel pod and tire", sourcePage: 12 },
  { systemCode: 5, groupNo: "5.3", name: "Wheel pods assembly - optional", sourcePage: 13 },

  { systemCode: 6, groupNo: "6.1", name: "Windows", sourcePage: 14 },
  { systemCode: 6, groupNo: "6.2", name: "Windshield assembly", sourcePage: 15 },
  { systemCode: 6, groupNo: "6.3", name: "Wiper motor assembly", sourcePage: 16 },
  { systemCode: 6, groupNo: "6.4", name: "Windshield center hinge", sourcePage: 17 },
  { systemCode: 6, groupNo: "6.5", name: "Windshield side hinge", sourcePage: 18 },
  { systemCode: 6, groupNo: "6.6", name: "Front gate", sourcePage: 19 },
  { systemCode: 6, groupNo: "6.7", name: "Rear gate - upper section", sourcePage: 20 },
  { systemCode: 6, groupNo: "6.8", name: "Rear gate - lower section", sourcePage: 21 },
  { systemCode: 6, groupNo: "6.9", name: "Brushguards and rack", sourcePage: 22 },
  { systemCode: 6, groupNo: "6.10", name: "Console", sourcePage: 23 },
  { systemCode: 6, groupNo: "6.11", name: "Front seat", sourcePage: 24 },
  { systemCode: 6, groupNo: "6.12", name: "Floors and panels", sourcePage: 25 },
  { systemCode: 6, groupNo: "6.13", name: "Rear seat 4 seater configuration", sourcePage: 26 },
  { systemCode: 6, groupNo: "6.14", name: "Rear seat 6 seater configuration", sourcePage: 27 },
  { systemCode: 6, groupNo: "6.15", name: "Safety and tools", sourcePage: 28 },
  { systemCode: 6, groupNo: "6.16", name: "Heating system", sourcePage: 29 },
  {
    systemCode: 6,
    groupNo: "6.17",
    name: "Air conditioning option",
    sourcePage: 30,
    optionPartNumbers: ["88-00256"],
  },
  {
    systemCode: 6,
    groupNo: "6.18",
    name: "Hot sticks storage tubes option",
    sourcePage: 31,
    optionPartNumbers: ["88-00168"],
  },

  { systemCode: 7, groupNo: "7.1", name: "Cowling and fender", sourcePage: 32 },
  { systemCode: 7, groupNo: "7.2", name: "Lower frame panels", sourcePage: 34 },

  { systemCode: 8, groupNo: "8.1", name: "Engine accessory belt assembly", sourcePage: 35 },
  { systemCode: 8, groupNo: "8.2", name: "Engine accessories", sourcePage: 36 },
  { systemCode: 8, groupNo: "8.3", name: "Engine mounts", sourcePage: 37 },
  { systemCode: 8, groupNo: "8.4", name: "Exhaust", sourcePage: 38 },
  { systemCode: 8, groupNo: "8.5", name: "Cooling pack", sourcePage: 39 },
  { systemCode: 8, groupNo: "8.6", name: "Air to air cooler", sourcePage: 40 },

  { systemCode: 9, groupNo: "9.1", name: "Fuel system", sourcePage: 41 },

  { systemCode: 10, groupNo: "10.1", name: "Tire inflation system", sourcePage: 43 },
  { systemCode: 10, groupNo: "10.2", name: "Blower", sourcePage: 44 },

  // The contents page prints 11.1, 11.2, 11.3, 11.3, 11.5, 11.5.
  { systemCode: 11, groupNo: "11.1", name: "Battery", sourcePage: 45 },
  { systemCode: 11, groupNo: "11.2", name: "Console electrical systems", sourcePage: 46 },
  { systemCode: 11, groupNo: "11.3", name: "Overhead controls", sourcePage: 47 },
  {
    systemCode: 11,
    groupNo: "11.4",
    printedGroupNo: "11.3",
    name: "Fuse box & firewall",
    sourcePage: 49,
  },
  { systemCode: 11, groupNo: "11.5", name: "Lights", sourcePage: 50 },
  {
    systemCode: 11,
    groupNo: "11.6",
    printedGroupNo: "11.5",
    name: "4-way backup camera option",
    sourcePage: 51,
    optionPartNumbers: ["88-00255"],
  },

  { systemCode: 12, groupNo: "12.1", name: "Accessories", sourcePage: null },
];

/* ------------------------------------------------------------------ *
 * Machine hierarchy
 * ------------------------------------------------------------------ */

export const SOURCE_PRODUCT_LINES = [
  {
    id: "pl-fat-truck",
    name: "Fat Truck",
    manufacturer: "Zeal Motor Inc.",
    country: "CA",
    isDistributed: true,
  },
  {
    id: "pl-agilis",
    name: "Agilis",
    manufacturer: "RUFDiamond",
    country: "SE",
    isDistributed: false,
  },
  {
    id: "pl-ironhorse",
    name: "IronHorse",
    manufacturer: "IronHorse AB",
    country: "SE",
    isDistributed: true,
  },
] as const;

export const SOURCE_MODEL = {
  id: "mdl-ft3-wagon",
  productLineId: "pl-fat-truck",
  name: "FT3 Wagon",
  status: "active",
  /** Draft until the callouts are placed and confirmed. */
  catalogState: "draft",
} as const;

/**
 * The serial range as printed on the Rev 2 cover. The supporting documents
 * carry the placeholder `99FT3WXXXXXX`; this is the real value.
 */
export const SOURCE_VARIANT = {
  id: "var-ft3w-251001",
  modelId: "mdl-ft3-wagon",
  label: "Serial number 99FT3W251001 and up",
  serialFrom: "99FT3W251001",
  serialTo: null,
  catalogRevision: "REV.2",
  docNumber: "96-00073",
  edition: "1st Edition",
  publishedYear: 2026,
} as const;
