/**
 * Catalog schema.
 *
 * Specified in `docs/superpowers/specs/2026-09-05-catalog-backend-design.md`,
 * which supersedes `docs/catalog-data-structure.md` §3 where the two disagree.
 *
 * Four decisions in here are load-bearing and are easy to undo by accident:
 *
 *   1. `figurePart.itemNo` is the printed `#`. Callouts are zero-or-more per
 *      row, because a "NOT SHOWN" row has a number and no marker.
 *   2. `callout.x`/`y` are percentages, never pixels, and null rather than
 *      zero — `0, 0` is a legitimate position.
 *   3. `callout.confirmedAt` gates publication. A coordinate proposed by the
 *      vision pre-pass is stored but not servable until a person confirms it.
 *   4. `part.listPrice` is nullable. The source catalog carries no prices.
 *
 * Commerce and access tables (company, user, order, audit_log, capability)
 * are deliberately absent — see spec §3.7.
 */

import {
  boolean,
  index,
  integer,
  numeric,
  pgEnum,
  pgTable,
  primaryKey,
  real,
  text,
  timestamp,
  unique,
  type AnyPgColumn,
} from "drizzle-orm/pg-core";

/* ------------------------------------------------------------------ *
 * Enums
 * ------------------------------------------------------------------ */

/** The machine's lifecycle, owned by the manufacturer. */
export const modelStatus = pgEnum("model_status", [
  "active",
  "legacy",
  "discontinued",
]);

/**
 * The catalogue's lifecycle for that machine, owned by RUFDiamond. Distinct
 * from `modelStatus`: a machine can be active with no catalogue at all, which
 * is the majority case today.
 */
export const catalogState = pgEnum("catalog_state", [
  "live",
  "draft",
  "awaiting-import",
  "not-registered",
]);

export const figureStatus = pgEnum("figure_status", [
  "published",
  "draft",
  "superseded",
]);

export const partStatus = pgEnum("part_status", [
  "active",
  "superseded",
  "obsolete",
  "special-order",
]);

export const currency = pgEnum("currency", ["CAD", "USD"]);

/** How a callout's coordinates came to exist. Gates publication with `confirmedAt`. */
export const calloutSource = pgEnum("callout_source", [
  "imported",
  "vision",
  "manual",
]);

export const importRunKind = pgEnum("import_run_kind", [
  "reference",
  "figures",
  "plates",
  "parts-tables",
  "callouts",
  "prices",
]);

export const importRunStatus = pgEnum("import_run_status", [
  "running",
  "succeeded",
  "failed",
]);

export const extractionRowStatus = pgEnum("extraction_row_status", [
  "pending",
  "accepted",
  "corrected",
  "rejected",
]);

/* ------------------------------------------------------------------ *
 * Reference data
 * ------------------------------------------------------------------ */

export const productLine = pgTable("product_line", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  manufacturer: text("manufacturer").notNull(),
  /** ISO 3166-1 alpha-2. */
  country: text("country").notNull(),
  /** Distinguishes lines RUFDiamond distributes from ones it designs. */
  isDistributed: boolean("is_distributed").notNull(),
});

export const system = pgTable("system", {
  id: text("id").primaryKey(),
  /** The printed number, 1–12. Resolves the schematics folder names. */
  code: integer("code").notNull().unique(),
  name: text("name").notNull(),
  sortOrder: integer("sort_order").notNull(),
});

/* ------------------------------------------------------------------ *
 * Machine hierarchy
 * ------------------------------------------------------------------ */

export const model = pgTable("model", {
  id: text("id").primaryKey(),
  productLineId: text("product_line_id")
    .notNull()
    .references(() => productLine.id),
  name: text("name").notNull(),
  displayPhoto: text("display_photo"),
  sortOrder: integer("sort_order").notNull().default(0),
  status: modelStatus("status").notNull(),
  catalogState: catalogState("catalog_state").notNull(),
  /** Null until an export has been imported. Set by import and edit paths only. */
  updatedAt: timestamp("updated_at", { withTimezone: true }),
});

export const variant = pgTable("variant", {
  id: text("id").primaryKey(),
  modelId: text("model_id")
    .notNull()
    .references(() => model.id),
  /** As printed on the catalogue cover. */
  label: text("label").notNull(),
  /** Kept separate from the label so range comparison is possible later. */
  serialFrom: text("serial_from"),
  /** Null means "and up". */
  serialTo: text("serial_to"),
  catalogRevision: text("catalog_revision").notNull(),
  /** The source document's own part number, e.g. "96-00073". */
  docNumber: text("doc_number"),
  edition: text("edition"),
  publishedYear: integer("published_year"),
});

export const modelSystem = pgTable(
  "model_system",
  {
    modelId: text("model_id")
      .notNull()
      .references(() => model.id),
    systemId: text("system_id")
      .notNull()
      .references(() => system.id),
    /** Disabling hides a system's figures without deleting them. */
    enabled: boolean("enabled").notNull().default(true),
  },
  (t) => [primaryKey({ columns: [t.modelId, t.systemId] })],
);

/* ------------------------------------------------------------------ *
 * Drawings
 *
 * Standalone, with `figure.drawingFileId` pointing at the current one, so a
 * re-scanned plate supersedes rather than destroys. `checksum` is what makes
 * the plate import idempotent.
 * ------------------------------------------------------------------ */

export const drawingFile = pgTable("drawing_file", {
  id: text("id").primaryKey(),
  filename: text("filename").notNull(),
  format: text("format").notNull(),
  storagePath: text("storage_path").notNull(),
  /** Pixels. Callout percentages are resolved against these at render time. */
  width: integer("width").notNull(),
  height: integer("height").notNull(),
  checksum: text("checksum").notNull(),
  uploadedAt: timestamp("uploaded_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  version: integer("version").notNull().default(1),
});

/* ------------------------------------------------------------------ *
 * Parts
 * ------------------------------------------------------------------ */

export const part = pgTable("part", {
  id: text("id").primaryKey(),
  partNumber: text("part_number").notNull().unique(),
  description: text("description").notNull(),
  manufacturer: text("manufacturer"),
  /**
   * Nullable: the Rev 2 catalog carries no prices. A null price is a part that
   * cannot be ordered yet and must render as such, never as $0.00.
   */
  listPrice: numeric("list_price", { precision: 12, scale: 2 }),
  currency: currency("currency").notNull().default("CAD"),
  /** Points forward at the replacement; the old record survives. */
  supersededByPartId: text("superseded_by_part_id").references(
    (): AnyPgColumn => part.id,
  ),
  status: partStatus("status").notNull().default("active"),
});

/**
 * "Also requires 31-00470 (2x)". Directional and not symmetric — the seal kit
 * does not require its element back, so never infer a reverse edge.
 *
 * Held at part level, not figure level: a seal kit travels with its element
 * wherever that element appears.
 */
export const partRequires = pgTable(
  "part_requires",
  {
    partId: text("part_id")
      .notNull()
      .references(() => part.id),
    requiredPartId: text("required_part_id")
      .notNull()
      .references(() => part.id),
    qty: integer("qty").notNull().default(1),
  },
  (t) => [primaryKey({ columns: [t.partId, t.requiredPartId] })],
);

/**
 * Option and kit membership. An `88-` part is a kit that groups other parts;
 * both whole figures and single rows can belong to one.
 */
export const partKit = pgTable(
  "part_kit",
  {
    kitPartId: text("kit_part_id")
      .notNull()
      .references(() => part.id),
    memberPartId: text("member_part_id")
      .notNull()
      .references(() => part.id),
    qty: integer("qty").notNull().default(1),
  },
  (t) => [primaryKey({ columns: [t.kitPartId, t.memberPartId] })],
);

/* ------------------------------------------------------------------ *
 * Figures
 * ------------------------------------------------------------------ */

export const figure = pgTable(
  "figure",
  {
    id: text("id").primaryKey(),
    /** Hangs off the variant, not the model — this is what makes serial ranges work. */
    variantId: text("variant_id")
      .notNull()
      .references(() => variant.id),
    systemId: text("system_id")
      .notNull()
      .references(() => system.id),
    /** Corrected and unique within the variant, e.g. "1.1". Rendered as "FIG 1.1". */
    groupNo: text("group_no").notNull(),
    /**
     * What the source document prints, where that differs. The Rev 2 contents
     * page numbers two different figures 11.3 and two more 11.5, and skips
     * 11.4. The defect is preserved here rather than silently renumbered, so
     * a reviewer can see why `groupNo` disagrees with the paper catalog.
     */
    printedGroupNo: text("printed_group_no"),
    name: text("name").notNull(),
    sortOrder: integer("sort_order").notNull().default(0),
    status: figureStatus("status").notNull().default("draft"),
    /** Null while the plate is unattached. Three FT3W figures have no plate. */
    drawingFileId: text("drawing_file_id").references(() => drawingFile.id),
    /** Set when the whole figure is an option, e.g. FIG 2.2 → 88-00262. */
    optionPartId: text("option_part_id").references(() => part.id),
    /** Free text printed under the parts list. */
    footnote: text("footnote"),
    /** Page in the source catalog, for audit back to the document. */
    sourcePage: integer("source_page"),
  },
  (t) => [unique("figure_variant_group_no").on(t.variantId, t.groupNo)],
);

/** "*See 9.1 FUEL SYSTEM for hydraulic oil tank and oil level sender". */
export const figureReference = pgTable(
  "figure_reference",
  {
    fromFigureId: text("from_figure_id")
      .notNull()
      .references(() => figure.id),
    toFigureId: text("to_figure_id")
      .notNull()
      .references(() => figure.id),
    note: text("note"),
  },
  (t) => [primaryKey({ columns: [t.fromFigureId, t.toFigureId] })],
);

/* ------------------------------------------------------------------ *
 * Figure membership and markers
 * ------------------------------------------------------------------ */

/**
 * A part's appearance on one figure — one row per printed parts-list line.
 *
 * `itemNo` is the printed `#` and is always present. `shown` is false for
 * "NOT SHOWN" rows, which legitimately have no marker on the plate and must
 * never block publication.
 */
export const figurePart = pgTable(
  "figure_part",
  {
    id: text("id").primaryKey(),
    figureId: text("figure_id")
      .notNull()
      .references(() => figure.id),
    partId: text("part_id")
      .notNull()
      .references(() => part.id),
    /** The printed `#`. Unique within the figure. */
    itemNo: integer("item_no").notNull(),
    qty: integer("qty").notNull().default(1),
    /** Original note text, preserved verbatim and still displayed. */
    remarks: text("remarks"),
    /** False for rows that appear in the list but not on the plate. */
    shown: boolean("shown").notNull().default(true),
    /** Set when this row belongs to an option kit within an ordinary figure. */
    optionPartId: text("option_part_id").references(() => part.id),
    /**
     * The source note was clipped by its column width in the original Word
     * document and cannot be recovered from the PDF. Needs manual completion.
     */
    notesTruncated: boolean("notes_truncated").notNull().default(false),
    /** False for reference-only items that cannot be ordered separately. */
    serviceable: boolean("serviceable").notNull().default(true),
    effectiveFrom: timestamp("effective_from", { withTimezone: true }),
    effectiveTo: timestamp("effective_to", { withTimezone: true }),
  },
  (t) => [
    unique("figure_part_figure_item_no").on(t.figureId, t.itemNo),
    index("figure_part_figure_idx").on(t.figureId),
    index("figure_part_part_idx").on(t.partId),
  ],
);

/**
 * One row per marker on the drawing.
 *
 * `(figureId, number)` is deliberately NOT unique: a part fitted in two places
 * carries a distinct marker per position, and several markers may resolve to
 * the same row. That is the basis of multi-occurrence highlighting, never an
 * error.
 */
export const callout = pgTable(
  "callout",
  {
    id: text("id").primaryKey(),
    figureId: text("figure_id")
      .notNull()
      .references(() => figure.id),
    /** Null only where the plate carries a numeral with no matching list row. */
    figurePartId: text("figure_part_id").references(() => figurePart.id),
    number: integer("number").notNull(),
    /** Percentages of drawing width/height, 0–100. Null until placed. */
    x: real("x"),
    y: real("y"),
    source: calloutSource("source").notNull().default("manual"),
    /** Vision pre-pass only. */
    confidence: real("confidence"),
    /** Null until a person confirms. Unconfirmed markers do not reach customers. */
    confirmedAt: timestamp("confirmed_at", { withTimezone: true }),
    confirmedBy: text("confirmed_by"),
  },
  (t) => [
    index("callout_figure_idx").on(t.figureId),
    index("callout_figure_part_idx").on(t.figurePartId),
  ],
);

/* ------------------------------------------------------------------ *
 * Extraction and review
 *
 * These exist because the source catalog has no text layer: every value passes
 * through OCR, so every accepted row must trace back to the page image it came
 * from. A misread part number is then a lookup, not an investigation.
 * ------------------------------------------------------------------ */

export const importRun = pgTable("import_run", {
  id: text("id").primaryKey(),
  sourceFile: text("source_file").notNull(),
  /** Together with `kind`, makes a re-run update rather than insert. */
  sourceChecksum: text("source_checksum").notNull(),
  kind: importRunKind("kind").notNull(),
  startedAt: timestamp("started_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  finishedAt: timestamp("finished_at", { withTimezone: true }),
  status: importRunStatus("status").notNull().default("running"),
  /** Rows read, created, updated, rejected — printed at the end of a run. */
  summary: text("summary"),
  actorUserId: text("actor_user_id"),
});

export const extractionRow = pgTable(
  "extraction_row",
  {
    id: text("id").primaryKey(),
    importRunId: text("import_run_id")
      .notNull()
      .references(() => importRun.id),
    figureId: text("figure_id").references(() => figure.id),
    sourcePage: integer("source_page"),
    /** The isolated row image, so a reviewer can check against the original. */
    rowImagePath: text("row_image_path"),
    rawItemNo: text("raw_item_no"),
    rawPartNumber: text("raw_part_number"),
    rawDescription: text("raw_description"),
    rawQty: text("raw_qty"),
    rawNotes: text("raw_notes"),
    confidence: real("confidence"),
    status: extractionRowStatus("status").notNull().default("pending"),
    /** Reviewer's corrections, applied in place of the raw values. */
    correctedJson: text("corrected_json"),
    /** Why a row is still pending — e.g. a part number that failed format check. */
    rejectionReason: text("rejection_reason"),
    reviewedBy: text("reviewed_by"),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    /** Set once the row has been accepted into the catalog. */
    figurePartId: text("figure_part_id").references(() => figurePart.id),
  },
  (t) => [
    index("extraction_row_run_idx").on(t.importRunId),
    index("extraction_row_status_idx").on(t.status),
  ],
);
