import "server-only";
import { composeCustomerRead } from "./repository";
import type { CustomerRepository } from "./customer-composition.server";

export async function selectedMachine(repo: CustomerRepository, variantId: string) {
  for (const model of await repo.getModels()) {
    const variant = (await repo.getVariants(model.id)).find(v => v.id === variantId);
    if (variant) return { model, variant };
  }
  return null;
}

function sectionNumber(groups: string[]) {
  const numbers = groups.map(g => Number.parseInt(g.split(".")[0], 10)).filter(Number.isFinite);
  return numbers.length ? Math.min(...numbers) : null;
}

export async function loadSystems(variantId: string) {
  return composeCustomerRead(async repo => {
    const machine = await selectedMachine(repo, variantId);
    if (!machine) return null;
    const systems = await repo.getSystems(variantId);
    const entries = [];
    for (const system of systems) {
      const figures = await repo.getFigures(variantId, system.id);
      entries.push({ system, figureCount: figures.length, number: sectionNumber(figures.map(f => f.groupNo)) });
    }
    return { ...machine, entries: entries.sort((a, b) => (a.number ?? 99) - (b.number ?? 99)) };
  });
}

export async function loadFigures(variantId: string, systemId: string) {
  return composeCustomerRead(async repo => {
    const machine = await selectedMachine(repo, variantId);
    if (!machine) return null;
    const system = (await repo.getSystems(variantId)).find(s => s.id === systemId);
    if (!system) return null;
    const source = await repo.getFigures(variantId, systemId);
    const figures = [];
    for (const figure of source) {
      const detail = await repo.getFigureDetail(figure.id);
      figures.push({ figure, plate: detail?.drawing?.storagePath ?? null });
    }
    return { ...machine, system, number: sectionNumber(source.map(f => f.groupNo)), figures };
  });
}
export type SystemsData = Awaited<ReturnType<typeof loadSystems>>;
export type FiguresData = Awaited<ReturnType<typeof loadFigures>>;
