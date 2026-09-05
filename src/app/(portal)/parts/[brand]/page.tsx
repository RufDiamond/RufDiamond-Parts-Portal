import { notFound } from "next/navigation";
import {
  getFiguresForModel,
  getModels,
  getProductLines,
  getVariants,
} from "@/data/repository";
import { BrandParts, type BrandModel } from "./BrandParts";

/** URL slug per product line, e.g. /parts/fat-truck. */
const BRANDS: Record<string, string> = {
  "fat-truck": "Fat Truck",
  ironhorse: "IronHorse",
  agilis: "Agilis",
};

/**
 * Model photos supplied with the design deck. Keyed by model id; a model with
 * no entry renders without a photo rather than with a broken image.
 */
const PHOTOS: Record<string, string> = {
  "mdl-ft3-wagon": "/models/ft3-wagon.jpg",
  "mdl-ft-2-8-pickup": "/models/ft-2-8-pickup.jpg",
  "mdl-ft-2-8c": "/models/ft-2-8c.jpg",
  "mdl-ft-2-8-wagon": "/models/ft-2-8-wagon.jpg",
  "mdl-ft-8x8-hauler": "/models/ft-8x8-hauler.jpg",
  "mdl-ft-8x8-wagon": "/models/ft-8x8-wagon.jpg",
  "mdl-ft-2-4p": "/models/ft-2-4p.jpg",
};

export default async function BrandPage({
  params,
}: {
  params: Promise<{ brand: string }>;
}) {
  const { brand } = await params;
  const name = BRANDS[brand];
  if (!name) notFound();

  const lines = await getProductLines();
  const productLine = lines.find((line) => line.name === name);
  if (!productLine) notFound();

  const models = await getModels();
  const mine = models.filter((m) => m.productLineId === productLine.id);

  const entries: BrandModel[] = await Promise.all(
    mine.map(async (model) => ({
      model,
      variants: await getVariants(model.id),
      photo: PHOTOS[model.id] ?? null,
      figureCount: (await getFiguresForModel(model.id)).length,
    })),
  );

  return <BrandParts productLine={productLine} models={entries} />;
}
