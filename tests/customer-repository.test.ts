import { afterEach, describe, expect, it, vi } from "vitest";
import { getFigureDetail, getModels, searchParts, getPartUsageIndex } from "@/data/repository";
import { composeApiRead } from "@/data/customer-composition.server";
import { createApiRepository } from "@/data/api-repository.server";
import { readFigureWorkspace } from "@/data/customer-figure.server";

// Only the request cookie source is mocked; actual transport and contract reads run.
vi.mock("next/headers", () => ({ cookies: async () => ({ getAll: () => [] }) }));

afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

describe("server-selected customer repository", () => {
  it("restarts figure detail, sibling names and usage together after activation", async () => {
    const ids = { figure: "10000000-0000-4000-8000-000000000001", variant: "10000000-0000-4000-8000-000000000002", system: "10000000-0000-4000-8000-000000000003" };
    const paths: string[] = [];
    const api = createApiRepository(async path => {
      paths.push(path);
      const revision = paths.length === 1 ? 1 : 2;
      const release = { modelId: "model", releaseId: `10000000-0000-4000-8000-00000000000${revision + 3}`, revision };
      const figure = { id: ids.figure, variantId: ids.variant, systemId: ids.system, name: `Plate ${revision}`, groupNo: "A.1", drawingFileId: "drawing", status: "published" };
      if (path === `catalog/figures/${ids.figure}`) return Response.json({ release, figure, drawing: { id: "drawing", filename: "synthetic.png", format: "png", width: 100, height: 100, version: revision, contentUrl: `/api/v1/catalog/figures/${ids.figure}/drawing?releaseId=${release.releaseId}` }, system: { id: ids.system, name: "System", sortOrder: 1 }, variant: { id: ids.variant, modelId: "model", label: "Variant", serialFrom: null, serialTo: null, catalogRevision: null }, rows: [], callouts: [], mapping: null });
      return Response.json({ items: path.includes("usage-index") ? [{ partId: "part", summary: { productLineName: null, modelName: null, serial: null, systemName: null, groupNo: "A.1", assemblyName: `Plate ${revision}`, figureId: ids.figure } }] : [figure], nextCursor: null, releases: [release] });
    });
    const result = await composeApiRead(api, repo => readFigureWorkspace(repo, ids.figure));
    expect(result?.detail.figure.name).toBe("Plate 2");
    expect(result?.siblings[0].name).toBe("Plate 2");
    expect(result?.usage.part.assemblyName).toBe("Plate 2");
    expect(paths).toHaveLength(5);
    expect(paths.filter(path => path === `catalog/figures/${ids.figure}`)).toHaveLength(2);
  });
  it("restarts a whole composition after activation between dependent reads", async () => {
    let reads = 0;
    const repository = createApiRepository(async () => {
      reads++;
      const revision = reads === 1 ? 1 : 2;
      return Response.json({ items: [{ id: "line", name: revision === 1 ? "Old" : "New", manufacturer: null, country: null, isDistributed: false }], nextCursor: null, releases: [{ modelId: "model", releaseId: `release-${revision}`, revision }] });
    });
    const result = await composeApiRead(repository, async repo => ({ first: await repo.getProductLines(), second: await repo.getProductLines() }));
    expect(result.first[0].name).toBe("New");
    expect(result.second[0].name).toBe("New");
    expect(reads).toBe(4);
  });
  it("bounds repeated composition drift while accepting unrelated contributor sets", async () => {
    let reads = 0;
    const repo = createApiRepository(async () => Response.json({ items: [], nextCursor: null, releases: [{ modelId: "model", releaseId: `r${++reads}`, revision: reads }] }));
    await expect(composeApiRead(repo, async r => [await r.getProductLines(), await r.getModels()])).rejects.toMatchObject({ code: "RELEASE_CHANGED" });
    expect(reads).toBe(4);
    let independent = 0;
    const other = createApiRepository(async () => Response.json({ items: [], nextCursor: null, releases: [{ modelId: `model${++independent}`, releaseId: `r${independent}`, revision: 1 }] }));
    await expect(composeApiRead(other, async r => [await r.getProductLines(), await r.getModels()])).resolves.toEqual([[], []]);
  });
  it("propagates failed authenticated reads through every customer seam without fixture fallback", async () => {
    vi.stubEnv("RUF_REPOSITORY_MODE", "api");
    vi.stubEnv("RUF_API_UPSTREAM_URL", "http://127.0.0.1:3999");
    vi.stubEnv("RUF_WEB_ORIGIN", "http://127.0.0.1:3199");
    vi.stubGlobal("fetch", async () => Response.json({ code: "AUTHENTICATION_REQUIRED" }, { status: 401 }));
    await expect(getModels()).rejects.toMatchObject({ status: 401 });
    await expect(getFigureDetail("00000000-0000-4000-8000-000000000001")).rejects.toMatchObject({ status: 401 });
    await expect(searchParts("bolt")).rejects.toMatchObject({ status: 401 });
    await expect(getPartUsageIndex()).rejects.toMatchObject({ status: 401 });
  });
});
