import { getAllParts, getSystems } from "@/data/repository";
import { PartsBrowser } from "./PartsBrowser";

export default async function AdminPartsPage() {
  const [parts, systems] = await Promise.all([
    getAllParts(),
    // Systems are shared across variants; the pilot variant is enough to list
    // them for the filter.
    getSystems("var-ft3-wagon-99ft3w"),
  ]);

  return <PartsBrowser initialParts={parts} systems={systems} />;
}
