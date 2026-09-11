import { describe, expect, it, vi } from "vitest";
import { createApiRepository } from "@/data/api-repository.server";
import type { FigureDetail } from "@rufdiamond/contracts";
import { adaptFigureDetail } from "@/data/customer-adapter";

const ids = { figure: "00000000-0000-4000-8000-000000000001", variant: "00000000-0000-4000-8000-000000000002", model: "00000000-0000-4000-8000-000000000003", release: "00000000-0000-4000-8000-000000000004", system: "00000000-0000-4000-8000-000000000005" };
const release = { modelId: ids.model, releaseId: ids.release, revision: 1 };
function detail(): FigureDetail {
  return { release, figure: { id: ids.figure, variantId: ids.variant, systemId: ids.system, name: "Synthetic figure", groupNo: "A.1", drawingFileId: "drawing", status: "published" },
    drawing: { id: "drawing", filename: "synthetic.png", format: "png", width: 100, height: 100, version: 1, contentUrl: `/api/v1/catalog/figures/${ids.figure}/drawing?releaseId=${ids.release}` },
    system: { id: ids.system, name: "Synthetic system", sortOrder: 1 },
    variant: { id: ids.variant, modelId: ids.model, label: "Test", serialFrom: null, serialTo: null, catalogRevision: null },
    rows: [{ figurePart: { id: "row", figureId: ids.figure, partId: "part", qty: 1, remarks: "* source note", serviceable: true }, part: { id: "part", releasePartId: "released-part", partNumber: "P", description: "Synthetic part", manufacturer: null, currency: "CAD", supersededByPartId: null, requires: [], status: "active" }, calloutNumbers: ["A*"] }],
    callouts: [{ id: "callout", figureId: ids.figure, figurePartId: "row", number: "A*", x: 10, y: 10, maskPath: null }], mapping: null };
}
const page = (items: unknown[], nextCursor: string | null = null, refs = [release]) => Response.json({ items, nextCursor, releases: refs });

describe("contract-only API repository", () => {
  it("adapts an explicitly table-only snapshot with retained references and unspecified installed quantity",async()=>{
    const source=detail();
    const table={...source,figure:{...source.figure,drawingFileId:null,depictionMode:"table-only" as const},drawing:null,callouts:[],mapping:null,sourceReferences:[{figurePartId:"row",number:"A*"}],rows:[{...source.rows[0],figurePart:{...source.rows[0].figurePart,qty:null,quantitySemantics:"unspecified-installed" as const}}]};
    const result=await createApiRepository(async()=>Response.json(table)).getFigureDetail(ids.figure);
    const adapted=adaptFigureDetail(result);
    expect(adapted.drawing).toBeNull();
    expect(adapted.rows[0].figurePart.qty).toBeNull();
    expect(adapted.rows[0].calloutNumbers).toEqual(["A*"]);
  });
  it.each([
    ["search", false], ["search", true], ["part", false], ["part", true],
  ] as const)("preserves legitimate %s usage multiplicity with pagination=%s", async (method, paginated) => {
    // Distinct source figure-part rows project to identical DTOs: no row ID is supplied.
    const usage = { part: detail().rows[0].part, figureId: ids.figure, groupNo: "A.1", assemblyName: "Synthetic figure", systemName: "Synthetic system", modelName: "Synthetic model", serial: "Test" };
    let reads = 0;
    const repository = createApiRepository(async () => {
      reads++;
      return paginated ? page([usage], reads === 1 ? "next-usage" : null) : page([usage, usage]);
    });
    const result = await (method === "search" ? repository.searchPartUsages("P") : repository.getPartUsages(ids.figure));
    expect(result.items).toEqual([usage, usage]);
    expect(result.items).toHaveLength(2);
    expect(result.releases).toEqual([release]);
    expect(result.nextCursor).toBeNull();
    expect(reads).toBe(paginated ? 2 : 1);
  });
  it.each(["search", "part"] as const)("retains cursor, release and page-size guards for %s usages", async method => {
    const usage = { part: detail().rows[0].part, figureId: ids.figure, groupNo: "A.1", assemblyName: "Synthetic figure", systemName: "Synthetic system", modelName: "Synthetic model", serial: "Test" };
    const get = (read: (path: string) => Promise<Response>) => {
      const repository = createApiRepository(read);
      return method === "search" ? repository.searchPartUsages("P") : repository.getPartUsages(ids.figure);
    };
    await expect(get(async () => page([usage], "repeated"))).rejects.toMatchObject({ code: "INVALID_CATALOG_PAGINATION" });
    let reads = 0;
    await expect(get(async () => page([usage], ++reads === 1 ? "next" : null, [{ ...release, revision: reads }]))).rejects.toMatchObject({ code: "INVALID_CATALOG_PAGINATION" });
    await expect(get(async () => page(Array.from({ length: 101 }, () => usage)))).rejects.toMatchObject({ code: "INVALID_CATALOG_PAGINATION" });
  });
  it("keeps separate mapping checksums and rejects mismatched mapping occurrences", async () => {
    const source = detail();
    source.mapping = { document: { schemaVersion: 1, figureId: ids.figure, drawingFileId: "drawing", drawingSha256: "a".repeat(64), imageWidth: 100, imageHeight: 100, catalogueBindingSha256: "b".repeat(64), occurrences: [{ calloutId: "callout", figurePartId: "row", refNo: "A*", labelRegion: { x: 8, y: 8, width: 4, height: 4 }, regions: [{ id: "region", outer: [[30, 30], [40, 30], [40, 40]], holes: [] }], evidence: "Synthetic evidence" }] }, sourceRevisionId: "review", sourceDocumentChecksum: "c".repeat(64), storedDocumentChecksum: "d".repeat(64), documentChecksum: "e".repeat(64), reviewerId: "synthetic-reviewer", reviewedAt: "2026-09-09T00:00:00Z" };
    const repository = createApiRepository(async () => Response.json(source));
    expect((await repository.getFigureDetail(ids.figure)).mapping).toEqual(source.mapping);
    source.mapping.document.occurrences[0].figurePartId = "foreign";
    await expect(repository.getFigureDetail(ids.figure)).rejects.toMatchObject({ code: "INVALID_CATALOG_IDENTITY" });
  });
  it("rejects duplicate catalogue items across pages instead of showing an inconsistent aggregate", async () => {
    let count = 0;
    const read = async () => page([{ id: "same", name: "Same", manufacturer: null, country: null, isDistributed: false }], ++count === 1 ? "next" : null);
    await expect(createApiRepository(read).getProductLines()).rejects.toMatchObject({ code: "INVALID_CATALOG_PAGINATION" });
  });
  it("rejects mismatched navigation parents and missing contributing releases", async () => {
    const repository = createApiRepository(async () => page([{ ...detail().variant, modelId: "foreign" }]));
    await expect(repository.getVariants(ids.model)).rejects.toMatchObject({ code: "INVALID_CATALOG_IDENTITY" });
    await expect(createApiRepository(async () => page([{ ...detail().figure, systemId: "foreign" }])).getFigures(ids.variant, ids.system)).rejects.toMatchObject({ code: "INVALID_CATALOG_IDENTITY" });
    await expect(createApiRepository(async () => page([{ id: "line", name: "Line", manufacturer: null, country: null, isDistributed: false }], null, [])).getProductLines()).rejects.toMatchObject({ code: "INVALID_CATALOG_PAGINATION" });
  });
  it("rejects duplicated row labels that conceal a different occurrence reference", async () => {
    const source = detail();
    source.callouts.push({ ...source.callouts[0], id: "callout-2", number: "B" });
    source.rows[0].calloutNumbers = ["A*", "A*"];
    await expect(createApiRepository(async () => Response.json(source)).getFigureDetail(ids.figure)).rejects.toMatchObject({ code: "INVALID_CATALOG_IDENTITY" });
  });
  it("uses the exact endpoints for every navigation/search/usage seam", async () => {
    const paths: string[] = [];
    const read = async (path: string) => { paths.push(path); return page([], null, []); };
    const repository = createApiRepository(read);
    await repository.getModels(); await repository.getVariants(ids.model); await repository.getSystems(ids.variant);
    await repository.getFigures(ids.variant, ids.system); await repository.searchParts("P 1");
    await repository.searchPartUsages("needle & seal", "description"); await repository.getPartUsages(ids.figure);
    expect(paths).toEqual(["catalog/models?limit=100", `catalog/models/${ids.model}/variants?limit=100`, `catalog/variants/${ids.variant}/systems?limit=100`, `catalog/variants/${ids.variant}/systems/${ids.system}/figures?limit=100`, "catalog/parts/search?q=P%201&mode=any&limit=100", "catalog/parts/usages?q=needle%20%26%20seal&mode=description&limit=100", `catalog/parts/${ids.figure}/usages?limit=100`]);
  });
  it("rejects failed live reads without looking up any seed figure", async () => {
    const repository = createApiRepository(async () => Response.json({ code: "AUTHENTICATION_REQUIRED" }, { status: 401 }));
    await expect(repository.getFigureDetail(ids.figure)).rejects.toMatchObject({ status: 401 });
    await expect(repository.getFigureDetail("fig-cabin-6-1")).rejects.toMatchObject({ status: 404 });
  });
  it("preserves omitted money, release identity and arbitrary reference strings", async () => {
    const value = await createApiRepository(async () => Response.json(detail())).getFigureDetail(ids.figure);
    expect(value.rows[0].part).not.toHaveProperty("listPrice");
    expect(value.rows[0].part.releasePartId).toBe("released-part");
    expect(value.callouts[0].number).toBe("A*");
    expect(value.rows[0].figurePart.remarks).toBe("* source note");
    expect(value.release).toEqual(release);
  });
  it("retains fixed decimal money without numeric reconstruction", async () => {
    const source = detail(); source.rows[0].part = { ...source.rows[0].part, listPrice: "0.00" };
    const result = await createApiRepository(async () => Response.json(source)).getFigureDetail(ids.figure);
    expect(result.rows[0].part).toHaveProperty("listPrice", "0.00");
  });
  it.each(["row", "drawing", "release", "callout", "content-url"])("rejects cross-identity %s responses", async field => {
    const source = detail();
    if (field === "row") source.rows[0].figurePart.figureId = "foreign";
    if (field === "drawing") source.drawing!.id = "foreign";
    if (field === "release") source.release = { ...release, modelId: "foreign" };
    if (field === "callout") source.callouts[0].figurePartId = "foreign";
    if (field === "content-url") source.drawing!.contentUrl = "https://public.example/drawing.png";
    await expect(createApiRepository(async () => Response.json(source)).getFigureDetail(ids.figure)).rejects.toMatchObject({ code: "INVALID_CATALOG_IDENTITY" });
  });
  it("restarts the entire aggregate on stale cursor and retains only new release metadata", async () => {
    const paths: string[] = [];
    const replacement = { ...release, releaseId: "00000000-0000-4000-8000-000000000006", revision: 2 };
    const read = async (path: string) => {
      paths.push(path);
      if (paths.length === 1) return page([{ id: "old", name: "Old", manufacturer: null, country: null, isDistributed: false }], "old-cursor");
      if (paths.length === 2) return Response.json({ code: "CATALOG_CURSOR_STALE" }, { status: 409 });
      return page([{ id: "new", name: "New", manufacturer: null, country: null, isDistributed: false }], null, [replacement]);
    };
    const result = await createApiRepository(read).getProductLines();
    expect(result.items.map(item => item.id)).toEqual(["new"]);
    expect(result.releases).toEqual([replacement]);
    expect(paths).toEqual(["catalog/product-lines?limit=100", "catalog/product-lines?limit=100&cursor=old-cursor", "catalog/product-lines?limit=100"]);
  });
  it("bounds stale retries, repeated cursors, conflicting release pages, and rejects malformed contracts", async () => {
    const stale = vi.fn(async () => Response.json({ code: "CATALOG_CURSOR_STALE" }, { status: 409 }));
    await expect(createApiRepository(stale).getModels()).rejects.toMatchObject({ status: 409 });
    expect(stale).toHaveBeenCalledTimes(2);
    await expect(createApiRepository(async () => page([], "again")).getModels()).rejects.toMatchObject({ code: "INVALID_CATALOG_PAGINATION" });
    let count = 0;
    await expect(createApiRepository(async () => page([], ++count === 1 ? "next" : null, [{ ...release, revision: count }])).getModels()).rejects.toMatchObject({ code: "INVALID_CATALOG_PAGINATION" });
    await expect(createApiRepository(async () => page([{ id: "invalid" }])).getModels()).rejects.toMatchObject({ code: "INVALID_API_CONTRACT" });
  });
  it("aggregates usages and exposes drawing lookup as an explicit unavailable seam", async () => {
    const read = async () => page([{ partId: "p", summary: { productLineName: null, modelName: null, serial: null, systemName: null, groupNo: null, assemblyName: null, figureId: null } }]);
    const repository = createApiRepository(read);
    expect((await repository.getPartUsageIndex()).items).toHaveProperty("p.figureId", null);
    await expect(repository.getDrawingFile("drawing")).rejects.toMatchObject({ code: "DRAWING_LOOKUP_UNAVAILABLE", status: 503 });
  });
});
