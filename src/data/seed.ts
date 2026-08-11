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

const productLines: ProductLine[] = [
  {
    id: "pl-fat-truck",
    name: "Fat Truck",
    manufacturer: "Zeal Motor Inc.",
    country: "CA",
    isDistributed: true,
  },
];

const models: Model[] = [
  {
    id: "mdl-ft3-wagon",
    productLineId: "pl-fat-truck",
    name: "FT3 Wagon",
    status: "active",
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
    figurePartId: "fp-1-1-04",
    number: 5,
    x: 21,
    y: 69,
  },
  {
    id: "co-1-1-06",
    figureId: "fig-filters-1-1",
    figurePartId: "fp-1-1-05",
    number: 6,
    x: 57,
    y: 83,
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
};
