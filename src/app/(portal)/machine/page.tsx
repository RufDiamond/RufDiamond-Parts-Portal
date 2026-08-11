import { getModels, getVariants } from "@/data/repository";
import { PageHeader } from "@/components";
import screen from "@/styles/screen.module.css";
import { MachinePicker } from "./MachinePicker";

export default async function MachinePage() {
  const models = await getModels();
  const catalogued = await Promise.all(
    models.map(async (model) => ({
      model,
      variants: await getVariants(model.id),
    })),
  );

  const revision = catalogued[0]?.variants[0]?.catalogRevision;

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
      <MachinePicker catalogued={catalogued} />
    </main>
  );
}
