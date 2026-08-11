/**
 * Catalog-admin read models.
 *
 * The customer domain lives in `catalog.ts`. These are the shapes the admin
 * console reads; as with the customer side, the backend is expected to
 * assemble them rather than making the client join.
 */

import type {
  CatalogState,
  Figure,
  Model,
  Part,
  ProductLine,
  Variant,
} from "./catalog";

export type { CatalogState };

export interface CatalogStats {
  modelsWithData: number;
  modelsRegistered: number;
  figures: number;
  partRecords: number;
  /** Callouts on a plate that resolve to no part record. */
  unmappedCallouts: number;
}

/** One row of the catalogue table. */
export interface CatalogModelRow {
  modelId: string;
  name: string;
  /** Printed serial range, or null when nothing has been imported. */
  serialRange: string | null;
  figures: number;
  parts: number;
  state: CatalogState;
  /** ISO date, or null when never imported. */
  updatedAt: string | null;
}

/** Models grouped under their product line, in catalogue order. */
export interface CatalogLineGroup {
  productLine: ProductLine;
  models: CatalogModelRow[];
}

export interface CatalogSummary {
  stats: CatalogStats;
  groups: CatalogLineGroup[];
  /** Revision and date of the last publish, or null if never published. */
  lastPublish: { revision: string; date: string } | null;
}

export interface ModelDetail {
  model: Model;
  productLine: ProductLine;
  variants: Variant[];
  figureCount: number;
  partCount: number;
  state: CatalogState;
}

export interface PartFilters {
  /** Matches part number (separators ignored) or description. */
  query?: string;
  systemId?: string;
  /** Restrict to one part status. */
  status?: Part["status"];
}

/** A part as the admin list shows it, with where it is used. */
export interface AdminPartRow {
  part: Part;
  /** Systems the part appears in, by name. */
  systems: string[];
  /** Figure group numbers the part appears on. */
  figures: string[];
  /** Total quantity across all figures it appears on. */
  totalQty: number;
}

export type OrderState =
  | "new"
  | "quoted"
  | "shipped"
  | "requires-dealer-approval";

export interface AdminOrder {
  id: string;
  reference: string;
  customer: string;
  productLine: string;
  model: string;
  serialRange: string;
  lines: number;
  valueCad: number;
  discountTier: string;
  state: OrderState;
}

export interface PublishChange {
  id: string;
  change: string;
  /** What the change touches, e.g. "FT3 Wagon · Filters". */
  affects: string;
  by?: string;
  /** ISO timestamp. */
  when?: string;
  /** Why it cannot ship yet. Present only on blocked changes. */
  reason?: string;
}

export interface PublishQueue {
  ready: PublishChange[];
  blocked: PublishChange[];
  environment: string;
  liveRevision: string | null;
}

/** Figures for a model, with the variant each belongs to. */
export interface ModelFigure {
  figure: Figure;
  variant: Variant;
  systemName: string;
  partCount: number;
  calloutCount: number;
}
