import { eq, inArray } from "drizzle-orm";
import { DiagramMappingDocumentSchema, validateMappingGeometry, type MappingRevision, type ProblemIssue } from "@rufdiamond/contracts";
import { Value } from "@sinclair/typebox/value";
import type { Transaction } from "../../db/client.js";
import * as s from "../../db/schema/index.js";
import { AppError } from "../../plugins/error-handler.js";
import { loadAuthorization, requireCapability } from "../authorization/policy.js";
import type { AuthorizationContext } from "../authorization/types.js";
import { currentRevision, loadGraph, type MappingGraph } from "../diagram-mapping/repository.js";
import { requireCurrentSource, validateDocument } from "../diagram-mapping/binding.js";
import { canonicalJsonHash } from "../outbox/idempotency.js";
import { isPinnedVersion } from "../drawings/storage.js";
import { validateSnapshotReviews } from "../catalog-review/snapshot.js";

export const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function unavailable(): never { throw new AppError("CATALOG_NOT_FOUND", 404, "The requested catalogue resource was not found."); }
export function assertScope(ctx: AuthorizationContext, brandId: string, variantIds: string[]) {
  if ((ctx.brandIds !== "all" && !ctx.brandIds.includes(brandId)) || (ctx.variantIds !== "all" && variantIds.some(id => !ctx.variantIds.includes(id)))) unavailable();
}
export async function publisher(tx: Transaction, userId: string, capability: string) {
  const ctx = await loadAuthorization(tx, userId);
  requireCapability(ctx, capability); requireCapability(ctx, "publish.draft.view"); requireCapability(ctx, "catalog.figure.view");
  if (!ctx.canViewDraft) throw new AppError("FORBIDDEN", 403, "Draft catalogue access is required.");
  const [user] = await tx.select({ name: s.appUser.name }).from(s.appUser).where(eq(s.appUser.id, userId));
  if (!user?.name.trim()) throw new AppError("NAMED_PUBLISHER_REQUIRED", 403, "A named publisher is required.");
  return ctx;
}
export async function modelScope(tx: Transaction, ctx: AuthorizationContext, modelId: string, lock = true) {
  if (!uuid.test(modelId)) unavailable();
  const query = tx.select().from(s.model).where(eq(s.model.id, modelId));
  const [model] = await (lock ? query.for("update") : query);
  if (!model) unavailable();
  const variants = await tx.select().from(s.variant).where(eq(s.variant.modelId, model.id)).orderBy(s.variant.id);
  assertScope(ctx, model.productLineId, variants.map(v => v.id));
  return { model, variants };
}
export async function validateModel(tx: Transaction, ctx: AuthorizationContext, modelId: string, lock = true) {
  const scope = await modelScope(tx, ctx, modelId, lock);
  const [line] = await tx.select().from(s.productLine).where(eq(s.productLine.id, scope.model.productLineId));
  const systems = await tx.select({ system: s.system, enabled: s.modelSystem.enabled }).from(s.modelSystem).innerJoin(s.system, eq(s.system.id, s.modelSystem.systemId)).where(eq(s.modelSystem.modelId, modelId)).orderBy(s.system.id);
  const figures = await tx.select().from(s.figure).where(inArray(s.figure.variantId, scope.variants.map(v => v.id))).orderBy(s.figure.id);
  const issues: ProblemIssue[] = [];
  const issue = (code: string, message: string, variantId?: string, figureId?: string) => issues.push({ code, message, path: `models[${modelId}]${variantId ? `.variants[${variantId}]` : ""}${figureId ? `.figures[${figureId}]` : ""}` });
  if (!line || !scope.variants.length || !figures.length) issue("INVALID_HIERARCHY", "A complete model, variant and figure hierarchy is required.");
  for (const variant of scope.variants) if (!figures.some(f => f.variantId === variant.id)) issue("VARIANT_FIGURES_REQUIRED", "Every released variant requires source-backed figures.", variant.id);
  const graphs: Array<{ graph: MappingGraph; revision: MappingRevision | null }> = [];
  for (const figure of figures) {
    const add = (code: string, message: string) => issue(code, message, figure.variantId, figure.id);
    if (!systems.some(x => x.system.id === figure.systemId && x.enabled)) add("DISABLED_HIERARCHY", "The figure system must be enabled for this model.");
    let graph: MappingGraph;
    try { graph = await loadGraph(tx, ctx, figure.id, lock); }
    catch (error) { if (error instanceof AppError && error.code === "MAPPING_UNAVAILABLE") { add(error.code, error.message); continue; } throw error; }
    for(const {row} of graph.rows)if(row.quantitySemantics==="unspecified-installed"&&!graph.sourceReview.current.some(r=>r.mode==="assembly-reference-unspecified"&&r.rowIds.includes(row.id)))add("ASSEMBLY_REVIEW_REQUIRED","An unspecified installed quantity requires its exact attributable source review.");
    if(graph.sourceReview.tableOnly){graphs.push({graph,revision:null});continue;}
    if (!graph.drawing || graph.drawing.validationStatus !== "valid") add("DRAWING_INVALID", "A validated drawing is required.");
    if (!isPinnedVersion(graph.drawing?.objectVersionId ?? undefined)) add("DRAWING_VERSION_REQUIRED", "An immutable object version is required.");
    if (!graph.rows.length) add("ROWS_REQUIRED", "Source-backed figure rows are required.");
    for (const { row } of graph.rows) {
      if (!graph.sourceReview.excludedRowIds.has(row.id) && !graph.occurrences.some(c => c.figurePartId === row.id)) add("ROW_NOT_DEPICTED_UNRESOLVED", "Every row requires reviewed depiction or an explicit source-verified exemption.");
    }
    for (const c of graph.occurrences) if (!c.figurePartId || !graph.rows.some(r => r.row.id === c.figurePartId)) add("CALLOUT_ROW_UNRESOLVED", "Every occurrence must reference a part row in its own figure.");
    const revision = await currentRevision(tx, graph);
    if (!revision?.approval) { add("MAPPING_APPROVAL_REQUIRED", "The current complete mapping requires attributable approval."); continue; }
    try {
      requireCurrentSource(graph, revision.document); validateDocument(graph, revision.document, true);
      if (canonicalJsonHash(revision.document) !== revision.checksum) add("MAPPING_CHECKSUM_INVALID", "Approved document checksum does not match.");
      graphs.push({ graph, revision });
    } catch (error) { if (error instanceof AppError) add(error.code, error.message); else throw error; }
  }
  // Follow the complete approved relationship/supersession closure, including parts
  // without a figure row; no same-release FK can point back into working tables.
  const parts = new Map<string, typeof s.part.$inferSelect>();
  const relationships: Array<typeof s.partRequires.$inferSelect> = [];
  const allRows = await tx.select().from(s.figurePart).where(inArray(s.figurePart.figureId, figures.map(f => f.id))).orderBy(s.figurePart.id);
  const pending = allRows.map(r => r.partId);
  while (pending.length) {
    const id = pending.shift()!; if (parts.has(id)) continue;
    const [part] = await tx.select().from(s.part).where(eq(s.part.id, id));
    if (!part) { issue("PART_UNRESOLVED", "A referenced part cannot be resolved."); continue; }
    parts.set(id, part);
    if (!part.listPrice || !/^\d+\.\d{2}$/.test(part.listPrice) || !["CAD", "USD"].includes(part.currency)) issue("PRICE_INVALID", "Display parts require a valid price and supported currency.");
    if (part.supersededByPartId) pending.push(part.supersededByPartId);
    const requires = await tx.select().from(s.partRequires).where(eq(s.partRequires.partId, id)).orderBy(s.partRequires.requiredPartId);
    for (const relationship of requires) {
      if (relationship.reviewState === "pending" || (relationship.reviewState === "approved" && (!relationship.reviewedByUserId || !relationship.reviewedAt))) issue("RELATIONSHIP_UNREVIEWED", "Extracted relationships require attributable review.");
      if (relationship.reviewState === "approved") { relationships.push(relationship); pending.push(relationship.requiredPartId); }
    }
  }
  if (new Set([...parts.values()].map(p => p.currency)).size > 1) issue("CURRENCY_INCONSISTENT", "A model release must use one consistent currency.");
  const drawings = await tx.select().from(s.drawingFile).where(inArray(s.drawingFile.id, [...new Set([...figures.map(f => f.drawingFileId), scope.model.photoFileId].filter((id): id is string => id !== null))])).orderBy(s.drawingFile.id);
  for (const drawing of drawings) if (drawing.validationStatus !== "valid" || !isPinnedVersion(drawing.objectVersionId ?? undefined)) issue("DRAWING_INVALID", "All included drawings must be validated and version pinned.");
  return { ...scope, line, systems, figures, graphs, parts: [...parts.values()].sort((a, b) => a.id.localeCompare(b.id)), relationships, drawings, allRows, issues };
}
export type PublicationGraph = Awaited<ReturnType<typeof validateModel>>;

/** Validate only sealed snapshot contents; legacy geometry absence is permitted,
 * while malformed or disconnected numeric geometry is never activated. */
export async function requireIntactSnapshot(tx: Transaction, releaseId: string) {
  const variants = await tx.select().from(s.releaseVariant).where(eq(s.releaseVariant.releaseId, releaseId));
  const figures = await tx.select().from(s.releaseFigure).where(eq(s.releaseFigure.releaseId, releaseId));
  const rows = await tx.select().from(s.releaseFigurePart).where(eq(s.releaseFigurePart.releaseId, releaseId));
  const calls = await tx.select().from(s.releaseCallout).where(eq(s.releaseCallout.releaseId, releaseId));
  const drawings = await tx.select().from(s.releaseDrawing).where(eq(s.releaseDrawing.releaseId, releaseId));
  const parts = await tx.select().from(s.releasePart).where(eq(s.releasePart.releaseId, releaseId));
  const mappings = await tx.select().from(s.releaseDiagramMapping).where(eq(s.releaseDiagramMapping.releaseId, releaseId));
  const reviews=await tx.select().from(s.releaseDepictionReview).where(eq(s.releaseDepictionReview.releaseId,releaseId));
  const references=await tx.select().from(s.releaseSourceReference).where(eq(s.releaseSourceReference.releaseId,releaseId));
  const qualified=validateSnapshotReviews(figures,rows,reviews,references);
  const invalid = () => { throw new AppError("RELEASE_INCOMPLETE", 422, "The sealed snapshot is incomplete or inconsistent and cannot be activated."); };
  if (!variants.length || variants.some(v => !figures.some(f => f.variantId === v.id))) invalid();
  if (!figures.length || figures.some(f => !rows.some(r => r.figureId === f.id) || (qualified.tableOnly.has(f.id)?calls.some(c=>c.figureId===f.id)||mappings.some(m=>m.figureId===f.id):!calls.some(c => c.figureId === f.id) || !drawings.some(d => d.id === f.drawingId)))) invalid();
  if (rows.some(r => !qualified.excluded.has(r.id)&&!calls.some(c => c.figureId === r.figureId && c.figurePartId === r.id))) invalid();
  if(calls.some(c=>qualified.excluded.has(c.figurePartId)))invalid();
  if (parts.some(p => !p.listPrice || !["CAD", "USD"].includes(p.currency)) || new Set(parts.map(p => p.currency)).size > 1) invalid();
  for (const mapping of mappings) {
    const document = mapping.document;
    const drawing = drawings.find(d => d.id === mapping.drawingId);
    const figure = figures.find(f => f.id === mapping.figureId);
    if (!Value.Check(DiagramMappingDocumentSchema, document) || validateMappingGeometry(document).length || !drawing || !figure || figure.drawingId !== drawing.id || document.figureId !== figure.id || document.drawingFileId !== drawing.id || document.drawingSha256 !== drawing.sha256 || document.imageWidth !== drawing.width || document.imageHeight !== drawing.height) invalid();
    const occurrences = calls.filter(c => c.figureId === mapping.figureId);
    if (document.occurrences.length !== occurrences.length || !document.occurrences.length) invalid();
    for (const occurrence of document.occurrences) {
      const callout = occurrences.find(c => c.id === occurrence.calloutId);
      if (!callout || callout.figurePartId !== occurrence.figurePartId || callout.number !== occurrence.refNo || !occurrence.labelRegion || !occurrence.regions.length || !occurrence.evidence.trim()) invalid();
    }
  }
}
