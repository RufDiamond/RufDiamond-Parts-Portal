import { searchPartUsages, type PartSearchMode } from "@/data/repository";
import { isBrandSlug } from "@/lib/brands";
import { SearchResults } from "./SearchResults";

/** A query string value arrives as a string, a list, or not at all. */
function first(value: string | string[] | undefined): string {
  if (Array.isArray(value)) return value[0] ?? "";
  return value ?? "";
}

function toMode(value: string): PartSearchMode {
  return value === "part" || value === "description" ? value : "any";
}

/**
 * Part search results — slides 19 and 20.
 *
 * The brand screen's two boxes route here with the mode they belong to, so the
 * heading and the empty state can name the right one.
 */
export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const params = await searchParams;
  const query = first(params.q);
  const mode = toMode(first(params.mode));
  // Only a slug that /parts/[brand] will actually serve; anything else (an
  // old link carrying a product line id) falls back to browser history rather
  // than sending the reader to a 404.
  const raw = first(params.brand);
  const brand = isBrandSlug(raw) ? raw : "";

  const rows = query ? await searchPartUsages(query, mode) : [];

  return (
    <SearchResults query={query} mode={mode} brand={brand} rows={rows} />
  );
}
