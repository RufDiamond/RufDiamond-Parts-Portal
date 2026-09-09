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

import "server-only";
import { seed } from "@/data/seed";
import type {
  DrawingFile,
  Figure,
  FigureDetail,
  FigurePartRow,
  Model,
  Part,
  PartUsageRow,
  PartUsageSummary,
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
  ModelSystemRow,
  PartFilters,
  PartRef,
  PublishChange,
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
    .sort((a, b) => String(a.number).localeCompare(String(b.number), undefined, { numeric: true }));

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
    ].sort((a, b) => String(a).localeCompare(String(b), undefined, { numeric: true }));

    rows.push({ figurePart, part, calloutNumbers });
  }

  // Parts list order follows the callout numbers on the plate; unnumbered
  // reference items fall to the bottom.
  rows.sort((a, b) => {
    const left = a.calloutNumbers[0] ?? Number.MAX_SAFE_INTEGER;
    const right = b.calloutNumbers[0] ?? Number.MAX_SAFE_INTEGER;
    if (left !== right) return String(left).localeCompare(String(right), undefined, { numeric: true });
    return a.part.partNumber.localeCompare(b.part.partNumber);
  });

  const drawing =
    seed.drawingFiles.find(
      (candidate) => candidate.id === figure.drawingFileId,
    ) ?? null;

  return detach({ figure, drawing, system, variant, rows, callouts });
}

export async function getDrawingFile(
  drawingFileId: string,
): Promise<DrawingFile | null> {
  return (
    detach(
      seed.drawingFiles.find((file) => file.id === drawingFileId),
    ) ?? null
  );
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

/** Which box the reader typed into. The deck gives each its own field. */
export type PartSearchMode = "part" | "description" | "any";

/** "99FT3WXXXXXX and up", as the catalogue cover prints it. */
function formatSerial(variant: Variant): string {
  if (variant.serialFrom && variant.serialTo) {
    return `${variant.serialFrom} \u2013 ${variant.serialTo}`;
  }
  if (variant.serialFrom) return `${variant.serialFrom} and up`;
  return variant.label;
}

/**
 * Part search, expanded to one row per place the part is used — slides 18-20.
 *
 * Searching by number ignores separators, so "12116000122" finds
 * "12-116000-122"; searching by description is a plain contains match, so a
 * phrase like "zinc plated" works. `any` searches both, which is what a bare
 * /search?q= falls back to.
 */
export async function searchPartUsages(
  query: string,
  mode: PartSearchMode = "any",
): Promise<PartUsageRow[]> {
  const trimmed = query.trim().toLowerCase();
  if (!trimmed) return [];

  const loose = stripSeparators(trimmed);

  const matched = seed.parts.filter((part) => {
    const byNumber = stripSeparators(part.partNumber.toLowerCase()).includes(
      loose,
    );
    const byDescription = part.description.toLowerCase().includes(trimmed);
    if (mode === "part") return byNumber;
    if (mode === "description") return byDescription;
    return byNumber || byDescription;
  });

  const rows: PartUsageRow[] = [];
  for (const part of matched) {
    const uses = seed.figureParts.filter(
      (figurePart) => figurePart.partId === part.id,
    );

    // A part with no figure behind it is still a match; it just has nothing
    // to say in the usage columns.
    if (uses.length === 0) {
      rows.push({
        part,
        figureId: null,
        groupNo: null,
        assemblyName: null,
        systemName: null,
        modelName: null,
        serial: null,
      });
      continue;
    }

    for (const use of uses) {
      const figure = seed.figures.find(
        (candidate) => candidate.id === use.figureId,
      );
      if (!figure) continue;

      const system = seed.systems.find(
        (candidate) => candidate.id === figure.systemId,
      );
      const variant = seed.variants.find(
        (candidate) => candidate.id === figure.variantId,
      );
      const model = variant
        ? seed.models.find((candidate) => candidate.id === variant.modelId)
        : undefined;

      rows.push({
        part,
        figureId: figure.id,
        groupNo: figure.groupNo,
        assemblyName: figure.name,
        systemName: system?.name ?? null,
        modelName: model?.name ?? null,
        serial: variant ? formatSerial(variant) : null,
      });
    }
  }

  rows.sort((a, b) => {
    const byPart = a.part.partNumber.localeCompare(b.part.partNumber);
    if (byPart !== 0) return byPart;
    return compareGroupNo(a.groupNo ?? "", b.groupNo ?? "");
  });

  return detach(rows);
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

/**
 * What a figure's callouts are still missing, split by reason.
 *
 * The export supplies the PNC-to-part mapping but no coordinates, so `unplaced`
 * is the ordinary outstanding work. `partless` is the exception, where the
 * export row was incomplete. Either gap keeps the figure unpublishable.
 */
function calloutGaps(figureId: string): {
  unplaced: number;
  partless: number;
  incomplete: number;
} {
  const figurePartIds = new Set(
    seed.figureParts.map((figurePart) => figurePart.id),
  );
  const callouts = seed.callouts.filter(
    (callout) => callout.figureId === figureId,
  );

  const isUnplaced = (x: number | null, y: number | null) =>
    x === null || y === null;
  const isPartless = (figurePartId: string | null) =>
    figurePartId === null || !figurePartIds.has(figurePartId);

  return {
    unplaced: callouts.filter((callout) => isUnplaced(callout.x, callout.y))
      .length,
    partless: callouts.filter((callout) => isPartless(callout.figurePartId))
      .length,
    incomplete: callouts.filter(
      (callout) =>
        isUnplaced(callout.x, callout.y) || isPartless(callout.figurePartId),
    ).length,
  };
}

function toPartRef(partId: string, qty?: number): PartRef | null {
  const part = seed.parts.find((candidate) => candidate.id === partId);
  if (!part) return null;
  return {
    partId: part.id,
    partNumber: part.partNumber,
    description: part.description,
    ...(qty === undefined ? {} : { qty }),
  };
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

  // "Unmapped" means not yet publishable: no position on the plate, or no
  // part behind the number.
  const unmappedCallouts = seed.figures.reduce(
    (sum, figure) => sum + calloutGaps(figure.id).incomplete,
    0,
  );

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

  const figures = figuresForModel(model.id);

  const systems: ModelSystemRow[] = [...seed.systems]
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((system) => {
      const systemFigures = figures.filter(
        (figure) => figure.systemId === system.id,
      );
      const figureIds = new Set(systemFigures.map((figure) => figure.id));

      return {
        system,
        figureCount: systemFigures.length,
        partCount: new Set(
          seed.figureParts
            .filter((figurePart) => figureIds.has(figurePart.figureId))
            .map((figurePart) => figurePart.partId),
        ).size,
        unmappedCallouts: systemFigures.reduce(
          (sum, figure) => sum + calloutGaps(figure.id).incomplete,
          0,
        ),
      };
    });

  const figuresByVariant: Record<string, number> = {};
  for (const figure of figures) {
    figuresByVariant[figure.variantId] =
      (figuresByVariant[figure.variantId] ?? 0) + 1;
  }

  return detach({
    model,
    productLine,
    variants: seed.variants.filter((variant) => variant.modelId === model.id),
    figureCount: figures.length,
    partCount: partIdsForModel(model.id).size,
    state: model.catalogState,
    systems,
    figuresByVariant,
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

    const supersedes = seed.parts.find(
      (candidate) => candidate.supersededByPartId === part.id,
    );

    return {
      part,
      systems,
      figures: usedFigures.map((figure) => figure.groupNo),
      totalQty: uses.reduce((sum, use) => sum + use.qty, 0),
      remarks: [
        ...new Set(
          uses
            .map((use) => use.remarks)
            .filter((remark): remark is string => Boolean(remark)),
        ),
      ],
      supersededBy: part.supersededByPartId
        ? toPartRef(part.supersededByPartId)
        : null,
      supersedes: supersedes
        ? {
            partId: supersedes.id,
            partNumber: supersedes.partNumber,
            description: supersedes.description,
          }
        : null,
      requires: part.requires
        .map((requirement) => toPartRef(requirement.partId, requirement.qty))
        .filter((ref): ref is PartRef => ref !== null),
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
    filtered.map(
      ({
        part,
        systems,
        figures,
        totalQty,
        remarks,
        supersededBy,
        supersedes,
        requires,
      }) => ({
        part,
        systems,
        figures,
        totalQty,
        remarks,
        supersededBy,
        supersedes,
        requires,
      }),
    ),
  );
}

/**
 * Where each part is used, keyed by part id.
 *
 * The request list stores only a part and a quantity, but the quote screen
 * prints the model, serial range, system, page and assembly it came from
 * (slide 44). A part fitted on several figures reports the first in catalogue
 * order — the screen shows one row per part, not one per usage.
 */
export async function getPartUsageIndex(): Promise<
  Record<string, PartUsageSummary>
> {
  const figures = [...seed.figures].sort((a, b) =>
    compareGroupNo(a.groupNo, b.groupNo),
  );

  const index: Record<string, PartUsageSummary> = {};
  for (const figure of figures) {
    const system = seed.systems.find(
      (candidate) => candidate.id === figure.systemId,
    );
    const variant = seed.variants.find(
      (candidate) => candidate.id === figure.variantId,
    );
    const model = variant
      ? seed.models.find((candidate) => candidate.id === variant.modelId)
      : undefined;
    const productLine = model
      ? seed.productLines.find(
          (candidate) => candidate.id === model.productLineId,
        )
      : undefined;

    for (const figurePart of seed.figureParts) {
      if (figurePart.figureId !== figure.id) continue;
      if (index[figurePart.partId]) continue;

      index[figurePart.partId] = {
        productLineName: productLine?.name ?? null,
        modelName: model?.name ?? null,
        serial: variant ? formatSerial(variant) : null,
        systemName: system?.name ?? null,
        groupNo: figure.groupNo,
        assemblyName: figure.name,
        figureId: figure.id,
      };
    }
  }
  return detach(index);
}

export async function getOrders(): Promise<AdminOrder[]> {
  return detach(seed.orders);
}

export async function getPublishQueue(): Promise<PublishQueue> {
  const liveRevision = seed.publishHistory[0]?.revision ?? null;

  /*
   * A model with unmapped callouts cannot go live: a customer would meet a
   * numbered marker with nothing behind it. Derived from the data rather than
   * written down, so clearing the mapping clears the blocker.
   */
  const derivedBlockers: PublishChange[] = [];
  for (const model of seed.models) {
    if (model.catalogState !== "draft") continue;

    const figures = figuresForModel(model.id);
    const totals = figures.reduce(
      (sum, figure) => {
        const gaps = calloutGaps(figure.id);
        return {
          unplaced: sum.unplaced + gaps.unplaced,
          partless: sum.partless + gaps.partless,
        };
      },
      { unplaced: 0, partless: 0 },
    );
    if (totals.unplaced === 0 && totals.partless === 0) continue;

    const affectedFigures = figures.filter(
      (figure) => calloutGaps(figure.id).incomplete > 0,
    );

    // Lead with the coordinates: that is what an import is actually missing.
    const reasons: string[] = [];
    if (totals.unplaced > 0) {
      reasons.push(
        `${totals.unplaced} ${totals.unplaced === 1 ? "callout has" : "callouts have"} no position on the drawing`,
      );
    }
    if (totals.partless > 0) {
      reasons.push(
        `${totals.partless} ${totals.partless === 1 ? "has" : "have"} no part attached`,
      );
    }

    derivedBlockers.push({
      id: `blocked-${model.id}`,
      change: `${model.name} — first release`,
      affects: model.name,
      reason: `${reasons.join(", and ")} across ${affectedFigures.length} ${affectedFigures.length === 1 ? "figure" : "figures"} (${affectedFigures.map((figure) => `FIG ${figure.groupNo}`).join(", ")}). Place the markers in the figure editor.`,
    });
  }

  return detach({
    ready: seed.publishReady,
    blocked: [...derivedBlockers, ...seed.publishBlocked],
    history: seed.publishHistory,
    environment: "Production",
    liveRevision,
  });
}
