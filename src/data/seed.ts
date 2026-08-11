/**
 * In-memory catalogue seed.
 *
 * PRIVATE TO THE DATA LAYER. Import `@/data/repository` instead — this module
 * is what the backend developer deletes when the real API lands.
 */

import type {
  Callout,
  Figure,
  FigurePart,
  Model,
  Part,
  ProductLine,
  System,
  Variant,
} from "@/types/catalog";
import type {
  AdminOrder,
  PublishChange,
  PublishRevision,
} from "@/types/admin";

const productLines: ProductLine[] = [
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
    manufacturer: "Agilis AB",
    country: "SE",
    isDistributed: true,
  },
  {
    id: "pl-ironhorse",
    name: "IronHorse",
    manufacturer: "IronHorse AB",
    country: "SE",
    isDistributed: true,
  },
];

/**
 * The registered roster. Only FT3 Wagon has had an export imported; the rest
 * are registered so the admin can see what is outstanding, and are what the
 * customer machine picker shows as not yet available.
 *
 * IronHorse has no models registered at all — its database is in preparation.
 */
const models: Model[] = [
  {
    id: "mdl-ft3-wagon",
    productLineId: "pl-fat-truck",
    name: "FT3 Wagon",
    status: "active",
    // Only one of twelve systems has been populated, so the catalogue is not
    // publishable yet.
    catalogState: "draft",
    updatedAt: "2026-07-24",
  },
  ...[
    "2.8 Pickup",
    "2.8C",
    "2.8 Wagon",
    "8X8 Hauler",
    "8X8 Wagon",
    "2.4P",
  ].map<Model>((name) => ({
    id: `mdl-ft-${name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
    productLineId: "pl-fat-truck",
    name,
    status: "active",
    catalogState: "awaiting-import",
    updatedAt: null,
  })),
  {
    id: "mdl-agilis-4",
    productLineId: "pl-agilis",
    name: "Agilis 4",
    status: "active",
    catalogState: "awaiting-import",
    updatedAt: null,
  },
  {
    id: "mdl-agilis-8",
    productLineId: "pl-agilis",
    name: "Agilis 8",
    status: "active",
    catalogState: "awaiting-import",
    updatedAt: null,
  },
];

const variants: Variant[] = [
  {
    id: "var-ft3-wagon-99ft3w",
    modelId: "mdl-ft3-wagon",
    label: "SERIAL NUMBER 99FT3WXXXXXX and up",
    serialFrom: "99FT3WXXXXXX",
    serialTo: null,
    catalogRevision: "A",
  },
];

/** Alphabetical, as printed in the catalogue contents. */
const systems: System[] = [
  { id: "sys-accessories", name: "Accessories", sortOrder: 10 },
  { id: "sys-cabin", name: "Cabin", sortOrder: 20 },
  { id: "sys-cowling-fender", name: "Cowling & fender", sortOrder: 30 },
  { id: "sys-drive-system", name: "Drive system", sortOrder: 40 },
  { id: "sys-electric", name: "Electric", sortOrder: 50 },
  { id: "sys-engine", name: "Engine", sortOrder: 60 },
  { id: "sys-filters", name: "Filters", sortOrder: 70 },
  { id: "sys-frame-assy", name: "Frame assy", sortOrder: 80 },
  { id: "sys-fuel-system", name: "Fuel system", sortOrder: 90 },
  { id: "sys-hydraulic", name: "Hydraulic", sortOrder: 100 },
  { id: "sys-tire-wheel", name: "Tire & wheel", sortOrder: 110 },
  { id: "sys-tire-inflation", name: "Tire inflation system", sortOrder: 120 },
];

const figures: Figure[] = [
  {
    id: "fig-filters-1-1",
    variantId: "var-ft3-wagon-99ft3w",
    systemId: "sys-filters",
    name: "Filters",
    groupNo: "1.1",
    drawingFileId: null,
    status: "published",
  },
];

const parts: Part[] = [
  {
    id: "prt-36-00304",
    partNumber: "36-00304",
    description: "Air filter element powersports",
    manufacturer: null,
    listPrice: 279.7,
    currency: "CAD",
    supersededByPartId: null,
    requires: [],
    status: "active",
  },
  {
    id: "prt-31-00469",
    partNumber: "31-00469",
    description: "Hatz fuel filter element with seals",
    manufacturer: "Hatz",
    listPrice: 215.33,
    currency: "CAD",
    supersededByPartId: null,
    requires: [{ partId: "prt-31-00470", qty: 2 }],
    status: "active",
  },
  {
    id: "prt-56-00007",
    partNumber: "56-00007",
    description: "Hydraulic oil cartridge",
    manufacturer: null,
    listPrice: 304.26,
    currency: "CAD",
    supersededByPartId: null,
    requires: [],
    status: "active",
  },
  {
    id: "prt-35-00068",
    partNumber: "35-00068",
    description: "Air filter Donaldson",
    manufacturer: "Donaldson",
    listPrice: 196.98,
    currency: "CAD",
    supersededByPartId: null,
    requires: [],
    status: "active",
  },
  {
    id: "prt-35-00061",
    partNumber: "35-00061",
    description: "Air filter Donaldson, early",
    manufacturer: "Donaldson",
    listPrice: 188.4,
    currency: "CAD",
    supersededByPartId: "prt-35-00068",
    requires: [],
    status: "superseded",
  },
  {
    id: "prt-31-00470",
    partNumber: "31-00470",
    description: "Fuel filter seal kit",
    manufacturer: "Hatz",
    listPrice: 22.1,
    currency: "CAD",
    supersededByPartId: null,
    requires: [],
    status: "active",
  },
  {
    id: "prt-30-00040",
    partNumber: "30-00040",
    description: "Hatz oil filter",
    manufacturer: "Hatz",
    listPrice: 80.65,
    currency: "CAD",
    supersededByPartId: null,
    requires: [],
    status: "active",
  },
];

const figureParts: FigurePart[] = [
  {
    id: "fp-1-1-01",
    figureId: "fig-filters-1-1",
    partId: "prt-36-00304",
    qty: 1,
    remarks: null,
    serviceable: true,
  },
  {
    id: "fp-1-1-02",
    figureId: "fig-filters-1-1",
    partId: "prt-31-00469",
    qty: 1,
    remarks: null,
    serviceable: true,
  },
  {
    id: "fp-1-1-03",
    figureId: "fig-filters-1-1",
    partId: "prt-56-00007",
    qty: 2,
    remarks: "One per hydraulic return manifold",
    serviceable: true,
  },
  {
    id: "fp-1-1-04",
    figureId: "fig-filters-1-1",
    partId: "prt-35-00068",
    qty: 1,
    remarks: null,
    serviceable: true,
  },
  {
    id: "fp-1-1-05",
    figureId: "fig-filters-1-1",
    partId: "prt-30-00040",
    qty: 1,
    remarks: null,
    serviceable: true,
  },
];

/**
 * One callout per position, numbered sequentially down the plate.
 *
 * The hydraulic oil cartridge is fitted in two places, so it owns callouts 3
 * AND 4 — in the FT3 Wagon export a part appearing at two positions carries a
 * distinct PNC for each. Both still resolve to the same part, so selecting
 * that row must light both markers.
 *
 * Callouts 5 and 6 came in from the export with no part attached: the plate
 * numbers them, but nothing has been mapped yet. They are the outstanding
 * work the hotspot editor exists to clear.
 */
const callouts: Callout[] = [
  {
    id: "co-1-1-01",
    figureId: "fig-filters-1-1",
    figurePartId: "fp-1-1-01",
    number: 1,
    x: 27,
    y: 22,
  },
  {
    id: "co-1-1-02",
    figureId: "fig-filters-1-1",
    figurePartId: "fp-1-1-02",
    number: 2,
    x: 63,
    y: 18,
  },
  {
    id: "co-1-1-03",
    figureId: "fig-filters-1-1",
    figurePartId: "fp-1-1-03",
    number: 3,
    x: 44,
    y: 52,
  },
  {
    id: "co-1-1-04",
    figureId: "fig-filters-1-1",
    figurePartId: "fp-1-1-03",
    number: 4,
    x: 75,
    y: 61,
  },
  {
    id: "co-1-1-05",
    figureId: "fig-filters-1-1",
    figurePartId: null,
    number: 5,
    x: 21,
    y: 69,
  },
  {
    id: "co-1-1-06",
    figureId: "fig-filters-1-1",
    figurePartId: null,
    number: 6,
    x: 57,
    y: 83,
  },
];

/** Orders raised against the pilot catalogue. Admin-side read only. */
const orders: AdminOrder[] = [
  {
    id: "ord-0418",
    reference: "RD-2026-0418",
    customer: "Agnico Eagle · Macassa",
    productLine: "Fat Truck",
    model: "FT3 Wagon",
    serialRange: "99FT3WXXXXXX and up",
    lines: 4,
    valueCad: 613.84,
    discountTier: "Tier 2 · mine site 12%",
    state: "new",
  },
  {
    id: "ord-0417",
    reference: "RD-2026-0417",
    customer: "Vale · Creighton",
    productLine: "Fat Truck",
    model: "FT3 Wagon",
    serialRange: "99FT3WXXXXXX and up",
    lines: 11,
    valueCad: 8204.1,
    discountTier: "Tier 1 · fleet 18%",
    state: "new",
  },
  {
    id: "ord-0416",
    reference: "RD-2026-0416",
    customer: "Hydro One · Sudbury",
    productLine: "Fat Truck",
    model: "FT3 Wagon",
    serialRange: "99FT3WXXXXXX and up",
    lines: 2,
    valueCad: 4566.94,
    discountTier: "Tier 3 · list",
    state: "quoted",
  },
  {
    id: "ord-0415",
    reference: "RD-2026-0415",
    customer: "Glencore · Sudbury INO",
    productLine: "Fat Truck",
    model: "FT3 Wagon",
    serialRange: "99FT3WXXXXXX and up",
    lines: 6,
    valueCad: 1092.3,
    discountTier: "Tier 2 · mine site 12%",
    state: "shipped",
  },
  {
    id: "ord-0414",
    reference: "RD-2026-0414",
    customer: "Detour Lake · emergency response",
    productLine: "Fat Truck",
    model: "FT3 Wagon",
    serialRange: "99FT3WXXXXXX and up",
    lines: 3,
    valueCad: 9128.55,
    discountTier: "Tier 1 · fleet 18%",
    state: "requires-dealer-approval",
  },
];

const publishReady: PublishChange[] = [
  {
    id: "pub-r1",
    change: "Price update — 41 Filters and Engine records",
    affects: "FT3 Wagon",
    by: "C. Kane",
    when: "2026-07-26 11:20",
  },
  {
    id: "pub-r2",
    change: "35-00061 superseded by 35-00068",
    affects: "FT3 Wagon · Filters",
    by: "C. Kane",
    when: "2026-07-26 10:04",
  },
  {
    id: "pub-r3",
    change: "Frame assy FIG 7.2 callout corrections",
    affects: "FT3 Wagon · Frame assy",
    by: "M. Tremblay",
    when: "2026-07-25 15:38",
  },
];

const publishBlocked: PublishChange[] = [
  {
    id: "pub-b2",
    change: "IronHorse — first release",
    affects: "IronHorse",
    reason:
      "No parts export received. The manufacturer holds the drawing rights; request the export before importing.",
  },
];

/** Published revisions, newest first. The first row is what customers see. */
const publishHistory: PublishRevision[] = [
  {
    id: "rev-a",
    revision: "REV A",
    summary: "FT3 Wagon first import — Filters FIG 1.1",
    by: "C. Kane",
    when: "2026-07-24",
  },
  {
    id: "rev-11-4",
    revision: "REV 11.4",
    summary: "Portal migration off the third-party platform",
    by: "M. Tremblay",
    when: "2026-06-30",
  },
  {
    id: "rev-11-3",
    revision: "REV 11.3",
    summary: "Price list refresh — all lines",
    by: "M. Tremblay",
    when: "2026-04-02",
  },
];

export const seed = {
  productLines,
  models,
  variants,
  systems,
  figures,
  parts,
  figureParts,
  callouts,
  orders,
  publishReady,
  publishBlocked,
  publishHistory,
};
