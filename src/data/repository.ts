/**
 * Catalogue data access.
 *
 * This module is the seam. Today it reads a frozen in-memory seed; tomorrow it
 * calls the API. Every function is async and returns a Promise so the swap is
 * an implementation change, never a call-site change.
 *
 * Rules for callers:
 *   - Import from here, never from `@/data/seed`.
 *   - Await everything, even though it currently resolves immediately.
 *   - Treat returned objects as owned copies; mutating them affects nothing.
 */

import { seed } from "@/data/seed";
import type {
  Figure,
  FigureDetail,
  FigurePartRow,
  Model,
  Part,
  ProductLine,
  System,
  Variant,
} from "@/types/catalog";
import type {
  AdminOrder,
  AdminPartRow,
  CatalogLineGroup,
  CatalogModelRow,
  CatalogSummary,
  ModelDetail,
  ModelFigure,
  PartFilters,
  PublishQueue,
} from "@/types/admin";

/** Hand back a detached copy so no caller can reach into the seed. */
function detach<T>(value: T): T {
  return structuredClone(value);
}

export async function getProductLines(): Promise<ProductLine[]> {
  return detach(seed.productLines);
}

export async function getModels(): Promise<Model[]> {
  return detach(seed.models);
}

export async function getVariants(modelId: string): Promise<Variant[]> {
  return detach(seed.variants.filter((variant) => variant.modelId === modelId));
}

/**
 * Systems carried by a variant, in catalogue order. Systems are shared across
 * variants, so this returns the full list — including systems whose figures
 * have not been drawn yet, which is what the contents page shows.
 */
export async function getSystems(variantId: string): Promise<System[]> {
  const variantExists = seed.variants.some(
    (variant) => variant.id === variantId,
  );
  if (!variantExists) return [];

  return detach(
    [...seed.systems].sort((a, b) => a.sortOrder - b.sortOrder),
  );
}

export async function getFigures(
  variantId: string,
  systemId: string,
): Promise<Figure[]> {
  const figures = seed.figures
    .filter(
      (figure) => figure.variantId === variantId && figure.systemId === systemId,
    )
    .sort((a, b) => compareGroupNo(a.groupNo, b.groupNo));

  return detach(figures);
}

export async function getFigureDetail(
  figureId: string,
): Promise<FigureDetail | null> {
  const figure = seed.figures.find((candidate) => candidate.id === figureId);
  if (!figure) return null;

  const system = seed.systems.find(
    (candidate) => candidate.id === figure.systemId,
  );
  const variant = seed.variants.find(
    (candidate) => candidate.id === figure.variantId,
  );
  if (!system || !variant) return null;

  const callouts = seed.callouts
    .filter((callout) => callout.figureId === figure.id)
    .sort((a, b) => a.number - b.number);

  const rows: FigurePartRow[] = [];
  for (const figurePart of seed.figureParts) {
    if (figurePart.figureId !== figure.id) continue;

    const part = seed.parts.find(
      (candidate) => candidate.id === figurePart.partId,
    );
    if (!part) continue;

    const calloutNumbers = [
      ...new Set(
        callouts
          .filter((callout) => callout.figurePartId === figurePart.id)
          .map((callout) => callout.number),
      ),
    ].sort((a, b) => a - b);

    rows.push({ figurePart, part, calloutNumbers });
  }

  // Parts list order follows the callout numbers on the plate; unnumbered
  // reference items fall to the bottom.
  rows.sort((a, b) => {
    const left = a.calloutNumbers[0] ?? Number.MAX_SAFE_INTEGER;
    const right = b.calloutNumbers[0] ?? Number.MAX_SAFE_INTEGER;
    if (left !== right) return left - right;
    return a.part.partNumber.localeCompare(b.part.partNumber);
  });

  return detach({ figure, system, variant, rows, callouts });
}

/**
 * Free-text part search over part number and description. Separators are
 * ignored on the number side, so "3600304" finds "36-00304".
 */
export async function searchParts(query: string): Promise<Part[]> {
  const trimmed = query.trim().toLowerCase();
  if (!trimmed) return [];

  const loose = stripSeparators(trimmed);

  const matches = seed.parts.filter((part) => {
    const number = stripSeparators(part.partNumber.toLowerCase());
    return (
      number.includes(loose) ||
      part.description.toLowerCase().includes(trimmed) ||
      (part.manufacturer?.toLowerCase().includes(trimmed) ?? false)
    );
  });

  matches.sort((a, b) => a.partNumber.localeCompare(b.partNumber));
  return detach(matches);
}

function stripSeparators(value: string): string {
  return value.replace(/[^a-z0-9]/g, "");
}

/** "1.10" sorts after "1.2", which a plain string compare gets wrong. */
function compareGroupNo(a: string, b: string): number {
  const left = a.split(".").map(Number);
  const right = b.split(".").map(Number);

  for (let i = 0; i < Math.max(left.length, right.length); i += 1) {
    const diff = (left[i] ?? 0) - (right[i] ?? 0);
    if (diff) return diff;
  }
  return a.localeCompare(b);
}

/* ------------------------------------------------------------------ *
 * Catalog admin
 *
 * Read-only views over the same seed. Same seam rule as the customer side:
 * async, detached copies, and the only module that touches `seed`.
 * ------------------------------------------------------------------ */

/** Figures across every variant of a model. */
function figuresForModel(modelId: string): Figure[] {
  const variantIds = new Set(
    seed.variants
      .filter((variant) => variant.modelId === modelId)
      .map((variant) => variant.id),
  );
  return seed.figures.filter((figure) => variantIds.has(figure.variantId));
}

/** Distinct part records reachable from a model's figures. */
function partIdsForModel(modelId: string): Set<string> {
  const figureIds = new Set(figuresForModel(modelId).map((figure) => figure.id));
  return new Set(
    seed.figureParts
      .filter((figurePart) => figureIds.has(figurePart.figureId))
      .map((figurePart) => figurePart.partId),
  );
}

function toCatalogRow(model: Model): CatalogModelRow {
  const variants = seed.variants.filter(
    (variant) => variant.modelId === model.id,
  );

  return {
    modelId: model.id,
    name: model.name,
    serialRange: variants[0]?.label ?? null,
    figures: figuresForModel(model.id).length,
    parts: partIdsForModel(model.id).size,
    state: model.catalogState,
    updatedAt: model.updatedAt,
  };
}

/**
 * Everything the catalogue screen shows: the stat strip, and the registered
 * models grouped under their product line.
 */
export async function getCatalogSummary(): Promise<CatalogSummary> {
  const groups: CatalogLineGroup[] = seed.productLines.map((productLine) => ({
    productLine,
    models: seed.models
      .filter((model) => model.productLineId === productLine.id)
      .map(toCatalogRow),
  }));

  // A callout is unmapped when it points at a figure part that no longer
  // exists — the import left a number on the plate with nothing behind it.
  const figurePartIds = new Set(
    seed.figureParts.map((figurePart) => figurePart.id),
  );
  const unmappedCallouts = seed.callouts.filter(
    (callout) => !figurePartIds.has(callout.figurePartId),
  ).length;

  const withData = seed.models.filter(
    (model) =>
      model.catalogState === "live" || model.catalogState === "draft",
  ).length;

  const published = seed.figures.some(
    (figure) => figure.status === "published",
  );

  return detach({
    stats: {
      modelsWithData: withData,
      modelsRegistered: seed.models.length,
      figures: seed.figures.length,
      partRecords: seed.parts.length,
      unmappedCallouts,
    },
    groups,
    lastPublish: published
      ? {
          revision: `REV ${seed.variants[0]?.catalogRevision ?? "—"}`,
          date: seed.models.find((model) => model.updatedAt)?.updatedAt ?? "—",
        }
      : null,
  });
}

export async function getModelDetail(
  modelId: string,
): Promise<ModelDetail | null> {
  const model = seed.models.find((candidate) => candidate.id === modelId);
  if (!model) return null;

  const productLine = seed.productLines.find(
    (candidate) => candidate.id === model.productLineId,
  );
  if (!productLine) return null;

  return detach({
    model,
    productLine,
    variants: seed.variants.filter((variant) => variant.modelId === model.id),
    figureCount: figuresForModel(model.id).length,
    partCount: partIdsForModel(model.id).size,
    state: model.catalogState,
  });
}

/** Figures for a model, with the variant and system each belongs to. */
export async function getFiguresForModel(
  modelId: string,
): Promise<ModelFigure[]> {
  const rows: ModelFigure[] = [];

  for (const figure of figuresForModel(modelId)) {
    const variant = seed.variants.find(
      (candidate) => candidate.id === figure.variantId,
    );
    const system = seed.systems.find(
      (candidate) => candidate.id === figure.systemId,
    );
    if (!variant || !system) continue;

    rows.push({
      figure,
      variant,
      systemName: system.name,
      partCount: seed.figureParts.filter(
        (figurePart) => figurePart.figureId === figure.id,
      ).length,
      calloutCount: seed.callouts.filter(
        (callout) => callout.figureId === figure.id,
      ).length,
    });
  }

  rows.sort((a, b) => compareGroupNo(a.figure.groupNo, b.figure.groupNo));
  return detach(rows);
}

/** Every part record, with where it is used. Filters are all optional. */
export async function getAllParts(
  filters: PartFilters = {},
): Promise<AdminPartRow[]> {
  const { query, systemId, status } = filters;
  const trimmed = query?.trim().toLowerCase() ?? "";
  const loose = stripSeparators(trimmed);

  const rows: AdminPartRow[] = seed.parts.map((part) => {
    const uses = seed.figureParts.filter(
      (figurePart) => figurePart.partId === part.id,
    );

    const usedFigures = uses
      .map((use) => seed.figures.find((figure) => figure.id === use.figureId))
      .filter((figure): figure is Figure => Boolean(figure));

    const systems = [
      ...new Set(
        usedFigures
          .map(
            (figure) =>
              seed.systems.find((system) => system.id === figure.systemId)?.name,
          )
          .filter((name): name is string => Boolean(name)),
      ),
    ];

    return {
      part,
      systems,
      figures: usedFigures.map((figure) => figure.groupNo),
      totalQty: uses.reduce((sum, use) => sum + use.qty, 0),
      // Carried only for filtering; not part of the returned shape.
      _systemIds: usedFigures.map((figure) => figure.systemId),
    } as AdminPartRow & { _systemIds: string[] };
  });

  const filtered = rows.filter((row) => {
    if (status && row.part.status !== status) return false;

    if (systemId) {
      const ids = (row as AdminPartRow & { _systemIds: string[] })._systemIds;
      if (!ids.includes(systemId)) return false;
    }

    if (trimmed) {
      const number = stripSeparators(row.part.partNumber.toLowerCase());
      const matches =
        number.includes(loose) ||
        row.part.description.toLowerCase().includes(trimmed);
      if (!matches) return false;
    }

    return true;
  });

  filtered.sort((a, b) => a.part.partNumber.localeCompare(b.part.partNumber));

  return detach(
    filtered.map(({ part, systems, figures, totalQty }) => ({
      part,
      systems,
      figures,
      totalQty,
    })),
  );
}

export async function getOrders(): Promise<AdminOrder[]> {
  return detach(seed.orders);
}

export async function getPublishQueue(): Promise<PublishQueue> {
  const liveRevision = seed.figures.some(
    (figure) => figure.status === "published",
  )
    ? `REV ${seed.variants[0]?.catalogRevision ?? "—"}`
    : null;

  return detach({
    ready: seed.publishReady,
    blocked: seed.publishBlocked,
    environment: "Production",
    liveRevision,
  });
}
