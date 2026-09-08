/**
 * URL slug per product line.
 *
 * Shared because two routes need it: `/parts/[brand]` resolves the slug to a
 * product line, and `/search` validates the `brand` it was handed before
 * offering it as a way back. Passing a product line ID where a slug belongs is
 * what made the Back button 404.
 */
export const BRANDS: Record<string, string> = {
  "fat-truck": "Fat Truck",
  ironhorse: "IronHorse",
  agilis: "Agilis",
};

export function isBrandSlug(value: string): boolean {
  return Object.hasOwn(BRANDS, value);
}
