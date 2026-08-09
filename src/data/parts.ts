export type Part = {
  /** Line reference within the list. */
  ref: string;
  partNo: string;
  description: string;
  qty: number;
  /** Cost in CAD, as listed against the line. */
  costCad: number;
};

export const parts: Part[] = [
  {
    ref: "01",
    partNo: "36-00304",
    description: "Air filter element powersports",
    qty: 1,
    costCad: 279.7,
  },
  {
    ref: "02",
    partNo: "31-00469",
    description: "Hatz fuel filter element with seals",
    qty: 1,
    costCad: 215.33,
  },
  {
    ref: "03",
    partNo: "56-00007",
    description: "Hydraulic oil cartridge",
    qty: 2,
    costCad: 304.26,
  },
  {
    ref: "04",
    partNo: "35-00068",
    description: "Air filter Donaldson",
    qty: 1,
    costCad: 196.98,
  },
  {
    ref: "05",
    partNo: "30-00040",
    description: "Hatz oil filter",
    qty: 1,
    costCad: 80.65,
  },
];
