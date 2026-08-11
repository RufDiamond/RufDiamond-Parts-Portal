import { getModels, getProductLines, getVariants } from "@/data/repository";
import { PageHeader } from "@/components";
import screen from "@/styles/screen.module.css";
import { MachinePicker } from "./MachinePicker";

export default async function MachinePage() {
  const [models, productLines] = await Promise.all([
    getModels(),
    getProductLines(),
  ]);

  // The customer portal covers the Fat Truck line; the other lines the
  // distributor carries are admin-side only until they have a catalogue.
  const fatTruck = productLines.find((line) => line.name === "Fat Truck");
  const catalogued = await Promise.all(
    models
      .filter((model) => model.productLineId === fatTruck?.id)
      .map(async (model) => ({
        model,
        variants: await getVariants(model.id),
      })),
  );

  const revision = catalogued.flatMap((entry) => entry.variants)[0]
    ?.catalogRevision;

  return (
    <main className={screen.screen}>
      <PageHeader
        eyebrow="Step 1 of 2 · Machine"
        title="Select a machine"
        description="Match the model plate on the machine. Parts differ between models and serial ranges."
        actions={
          revision ? (
            <span className="identifier">CATALOG {revision}</span>
          ) : null
        }
      />
      <MachinePicker catalogued={catalogued} lineName={fatTruck?.name ?? ""} />
    </main>
  );
}
