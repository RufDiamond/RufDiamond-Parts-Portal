/**
 * Catalog domain types.
 *
 * These describe the shape the eventual API is expected to return. Nothing in
 * here is storage-specific: the in-memory repository and the real backend must
 * both satisfy these contracts.
 */

export type Currency = "CAD" | "USD";

export type ModelStatus = "active" | "legacy" | "discontinued";

export type FigureStatus = "published" | "draft" | "superseded";

export type PartStatus = "active" | "superseded" | "obsolete" | "special-order";

export type CompanyType = "customer" | "dealer";

/** A machine family, e.g. Fat Truck. */
export interface ProductLine {
  id: string;
  name: string;
  manufacturer: string;
  /** ISO 3166-1 alpha-2, e.g. "CA". */
  country: string;
  /** True when RufDiamond distributes the line rather than manufacturing it. */
  isDistributed: boolean;
}

/**
 * Where a model sits in the import → publish pipeline. Distinct from
 * `ModelStatus`, which is the machine's lifecycle, not the catalogue's.
 */
export type CatalogState =
  | "live"
  | "draft"
  | "awaiting-import"
  | "not-registered";

/** A machine within a product line, e.g. FT3 Wagon. */
export interface Model {
  id: string;
  productLineId: string;
  name: string;
  status: ModelStatus;
  /** Read by the catalog admin; the customer side never branches on it. */
  catalogState: CatalogState;
  /** ISO date of the last catalogue import or edit. Null when never imported. */
  updatedAt: string | null;
}

/**
 * A serial-number range of a model. Parts catalogues are cut by serial range,
 * so the variant — not the model — is what a figure hangs off.
 */
export interface Variant {
  id: string;
  modelId: string;
  /** Human-readable range as printed on the catalogue cover. */
  label: string;
  serialFrom: string | null;
  /** Null means "and up" — the range is open-ended. */
  serialTo: string | null;
  catalogRevision: string;
}

/** A top-level grouping of figures, e.g. Hydraulic. Shared across variants. */
export interface System {
  id: string;
  name: string;
  sortOrder: number;
}

/** One drawing sheet: a plate with numbered callouts and a parts list. */
export interface Figure {
  id: string;
  variantId: string;
  systemId: string;
  name: string;
  /** Group number as printed, e.g. "1.1". Rendered as "FIG 1.1". */
  groupNo: string;
  /** Handle for the drawing asset; null while the plate is unattached. */
  drawingFileId: string | null;
  status: FigureStatus;
}

/**
 * An uploaded drawing plate. Callout `x`/`y` are percentages of this file's
 * dimensions, so replacing it at another resolution does not detach the
 * markers — the dimensions are recorded for reference, not for positioning.
 */
export interface DrawingFile {
  id: string;
  /** Original filename as supplied, kept so an upload can be traced back. */
  filename: string;
  format: "png" | "jpg" | "svg" | "pdf";
  /** Where the asset is served from. Object storage once that lands. */
  storagePath: string;
  width: number;
  height: number;
  /** ISO date. */
  uploadedAt: string;
  version: number;
}

/** A stock item. Prices are list prices before any company discount. */
export interface Part {
  id: string;
  partNumber: string;
  description: string;
  manufacturer: string | null;
  listPrice: number;
  currency: Currency;
  /** Points at the replacement when this part has been superseded. */
  supersededByPartId: string | null;
  /**
   * Parts that must be ordered alongside this one — seal kits, washers. A
   * part-level relationship, so it holds wherever the part appears.
   */
  requires: PartRequirement[];
  status: PartStatus;
}

/** "Also requires 31-00470 (2x)". */
export interface PartRequirement {
  partId: string;
  qty: number;
}

/** A part's appearance on a figure, with the quantity used there. */
export interface FigurePart {
  id: string;
  figureId: string;
  partId: string;
  qty: number;
  remarks: string | null;
  /** False for reference-only items that cannot be ordered separately. */
  serviceable: boolean;
}

/**
 * A numbered marker on a drawing. One figure part may have several callouts
 * when the item appears more than once on the plate; those callouts share a
 * number and highlight together.
 */
export interface Callout {
  id: string;
  figureId: string;
  /**
   * The figure part this marker points at. Normally supplied by the import,
   * which carries the PNC-to-part mapping; null only where the export was
   * incomplete. Attaching a part is the editor's secondary path.
   */
  figurePartId: string | null;
  number: number;
  /**
   * Position on the plate, as percentages of drawing width and height, 0-100.
   * Never pixels — the drawing can be replaced at another resolution.
   *
   * Null until someone places the marker. The export carries no coordinates,
   * so this is what an imported callout is missing and what the hotspot editor
   * exists to fill in.
   */
  x: number | null;
  y: number | null;
  /**
   * The part's own artwork on the plate, as an SVG path in the same 0-100
   * percentage space as `x`/`y`. Selecting the callout fills this shape, so
   * the part itself lights rather than only its marker.
   *
   * Null wherever the shape could not be recovered, which is often: the plates
   * are flat renders, so a part is only separable when its outline is closed.
   * The renderer falls back to marker-only highlighting and must never require
   * this. Vector plates would make it exact everywhere — see
   * `docs/drawing-source-review.md`.
   */
  maskPath: string | null;
}

/** A customer or dealer account. Discount applies to list price. */
export interface Company {
  id: string;
  name: string;
  type: CompanyType;
  /** Fraction, e.g. 0.15 for 15% off list. */
  discountRate: number;
}

/**
 * A line on an order. Part details are snapshotted at the time of ordering so
 * later catalogue edits cannot rewrite order history.
 */
export interface OrderLine {
  partId: string;
  partNumberSnapshot: string;
  descriptionSnapshot: string;
  qty: number;
  unitPriceSnapshot: number;
  lineTotal: number;
}

/* ------------------------------------------------------------------ *
 * Composite read models
 *
 * Shapes the UI reads but no single table owns. The backend is expected to
 * assemble these server-side rather than making the client join.
 * ------------------------------------------------------------------ */

/** A parts-list row: the figure part, its part record, and its callout numbers. */
export interface FigurePartRow {
  figurePart: FigurePart;
  part: Part;
  /** Ascending, de-duplicated. Empty when the item has no marker on the plate. */
  calloutNumbers: number[];
}

/** Everything needed to render one figure screen. */
export interface FigureDetail {
  figure: Figure;
  /** The resolved plate, or null while the figure has no drawing attached. */
  drawing: DrawingFile | null;
  system: System;
  variant: Variant;
  rows: FigurePartRow[];
  callouts: Callout[];
}
