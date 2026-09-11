// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, renderHook, waitFor } from "@testing-library/react";
import { fetchReleasedDrawing, useReleasedDrawing } from "@/state/useReleasedDrawing";
import type { FigureDetail } from "@/types/catalog";
const { refresh, router } = vi.hoisted(() => { const refresh = vi.fn(); return { refresh, router: { refresh } }; });
vi.mock("next/navigation", () => ({ useRouter: () => router }));
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.clearAllMocks(); });
const path = (revision: number) => `/api/v1/catalog/figures/10000000-0000-4000-8000-000000000001/drawing?releaseId=10000000-0000-4000-8000-00000000000${revision}`;
it("fetches only the release-pinned authenticated image and rejects mutable or public paths", async () => {
  const fetcher = vi.fn(async () => new Response("bytes", { headers: { "content-type": "image/png" } }));
  vi.stubGlobal("fetch", fetcher);
  await expect(fetchReleasedDrawing("/drawings/fixture.png")).rejects.toThrow();
  await expect(fetchReleasedDrawing("https://storage.example/latest.png")).rejects.toThrow();
  expect(fetcher).not.toHaveBeenCalled();
  await fetchReleasedDrawing(path(2));
  expect(fetcher).toHaveBeenCalledWith(path(2), { credentials: "same-origin", cache: "no-store", redirect: "follow" });
});
it("refreshes the whole figure once on 409 and never substitutes a latest image", async () => {
  vi.stubGlobal("fetch", vi.fn(async () => new Response(null, { status: 409 })));
  const detail = (revision: number) => ({ release: { revision }, drawing: { storagePath: path(revision) } }) as FigureDetail;
  const hook = renderHook(({ revision }) => useReleasedDrawing(detail(revision)), { initialProps: { revision: 2 } });
  await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));
  hook.rerender({ revision: 3 });
  await waitFor(() => expect(hook.result.current.error).toBeTruthy());
  expect(refresh).toHaveBeenCalledTimes(1);
  expect(hook.result.current.src).toBeUndefined();
});
