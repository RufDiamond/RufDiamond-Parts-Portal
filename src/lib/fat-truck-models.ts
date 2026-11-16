const lineup = [
  { name: "FT2 Pickup", subtitle: "Fat Truck 2.4 Pick Up", aliases: ["2.4p", "2.4 pickup"] },
  { name: "FT3 Pickup", subtitle: "Fat Truck 2.8 Pick Up", aliases: ["2.8 pickup"] },
  { name: "FT3 Wagon", subtitle: "Fat Truck 2.8 Wagon", aliases: ["2.8 wagon"] },
  { name: "FT5 Hauler", subtitle: "Fat Truck 8x8 Hauler", aliases: ["8x8 hauler"] },
  { name: "FT5 Wagon", subtitle: "Fat Truck 8x8 Wagon", aliases: ["8x8 wagon"] },
];
const key = (value: string) => value.toLowerCase().replace(/^fat truck\s+/, "").replace(/\s+/g, "");

export function fatTruckModelLabel(name: string) {
  return lineup.find(model => [model.name, model.subtitle, ...model.aliases].some(alias => key(alias) === key(name)));
}

export const naturalCatalogueOrder = new Intl.Collator("en-CA", { numeric: true, sensitivity: "base" });

export function compareCatalogueModels(a: string, b: string) {
  const left = fatTruckModelLabel(a);
  const right = fatTruckModelLabel(b);
  const rank = (model?: (typeof lineup)[number]) => model ? lineup.indexOf(model) : lineup.length;
  return rank(left) - rank(right) || naturalCatalogueOrder.compare(left?.name ?? a, right?.name ?? b);
}
