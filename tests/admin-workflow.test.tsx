// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { FirstDrawingUpload } from "@/features/diagram-mapping/FirstDrawingUpload";
import { PublisherQueue, blockerFigureLink } from "@/features/diagram-mapping/PublisherQueue";
import { MappingApiError } from "@/features/diagram-mapping/api-client";
import type { PublishInput } from "@rufdiamond/contracts";
import { PortalShell } from "@/components/PortalShell";
const authority = vi.hoisted(()=>({capabilities:["publish.draft.view","catalog.figure.view"],scopes:{environment:"draft"}}));
vi.mock("next/navigation",()=>({usePathname:()=>"/"}));
vi.mock("@/state/MachineContext",()=>({useMachine:()=>({selectedModel:null})}));
vi.mock("@/state/SessionBoundary",()=>({useCustomerSession:()=>authority,SignOutButton:()=>null}));
const id = "11111111-1111-4111-8111-111111111111";
afterEach(cleanup);
it("links authenticated draft administration only with both capabilities and draft scope",()=>{
  const view=render(<PortalShell date="Synthetic date"><p>Catalogue</p></PortalShell>);
  expect(screen.getByRole("link",{name:"Draft administration"}).getAttribute("href")).toBe("/admin");
  authority.scopes.environment="published";
  view.rerender(<PortalShell date="Synthetic date"><p>Catalogue</p></PortalShell>);
  expect(screen.queryByRole("link",{name:"Draft administration"})).toBeNull();
  authority.scopes.environment="draft"; authority.capabilities=["catalog.figure.view"];
  view.rerender(<PortalShell date="Synthetic date"><p>Catalogue</p></PortalShell>);
  expect(screen.queryByRole("link",{name:"Draft administration"})).toBeNull();
  authority.capabilities=["publish.draft.view","catalog.figure.view"];
});
it("keeps a truly drawingless figure upload-only and retries the identical uncertain intent", async () => {
  let attempts = 0;
  const complete = vi.fn();
  const api = {
    createIntent: async (_figure: string, version: number) => { expect(version).toBe(7); return { uploadId: id, figureId: id, figureVersion: 7, url: "https://storage.test/upload", headers: { "Content-Type": "image/png" as const }, expiresAt: "2026-09-09T23:00:00Z" }; },
    uploadFile: async () => {},
    finalize: async (figure: string, upload: string, version: number) => { expect([figure, upload, version]).toEqual([id, id, 7]); if (++attempts === 1) throw new MappingApiError(503, "Unavailable"); return { figureId: id, figureVersion: 8, drawingFileId: id, fileVersion: 1, filename: "first.png", sha256: "a".repeat(64), bytes: 8, width: 640, height: 480 }; },
    loadDrawing: async () => { throw new Error("Not called"); },
  };
  render(<FirstDrawingUpload figure={{ id, name: "Drawingless", version: 7, hasDrawing: false }} canUpload api={api} onAttached={complete} />);
  expect(screen.queryByRole("img")).toBeNull(); expect(screen.queryByTestId("mapping-canvas")).toBeNull();
  fireEvent.change(screen.getByLabelText("First PNG"), { target: { files: [new File(["PNG"], "first.png", { type: "image/png" })] } });
  await act(async () => fireEvent.click(screen.getByRole("button", { name: "Upload first PNG" })));
  expect(complete).not.toHaveBeenCalled();
  await act(async () => fireEvent.click(screen.getByRole("button", { name: "Retry PNG verification" })));
  expect(complete).toHaveBeenCalledOnce();
});
it("requires explicit publisher confirmation and submits both authoritative versions", async () => {
  const publish = vi.fn(async (input: PublishInput, key: string) => { expect(key).toBeTruthy(); return { modelId: input.modelId, releaseId: id, revision: 1, checksum: "a".repeat(64) }; });
  const queue = { items: [{ modelId: id, name: "Synthetic", workingVersion: 4, publicationVersion: 9, activeReleaseId: null, blockers: [] }], nextCursor: null };
  const api = { queue: async () => queue, publish };
  render(<PublisherQueue initial={queue} api={api} />);
  fireEvent.change(screen.getByLabelText("Release summary"), { target: { value: "Reviewed synthetic" } });
  fireEvent.click(screen.getByRole("button", { name: "Review publication" }));
  expect(publish).not.toHaveBeenCalled();
  await act(async () => fireEvent.click(screen.getByRole("button", { name: "Confirm publish and activate" })));
  expect(publish.mock.calls[0]?.[0]).toEqual({ modelId: id, expectedWorkingVersion: 4, expectedPublicationVersion: 9, summary: "Reviewed synthetic" });
  expect(screen.getByRole("status").textContent).toContain("Published release 1");
});
it("links only an exact structured blocker path for the current model", () => {
  expect(blockerFigureLink(`models[${id}].variants[${id}].figures[${id}]`, id)).toBe(`/admin/figures/${id}/mapping`);
  for (const path of [`models[${id}].variants[${id}].figures[${id}].evil`, "https://evil.test", "models[bad].variants[bad].figures[bad]"]) expect(blockerFigureLink(path, id)).toBeNull();
});
it("retries an uncertain publication with its original versions and idempotency key", async () => {
  const queue = { items: [{ modelId: id, name: "Synthetic", workingVersion: 4, publicationVersion: 9, activeReleaseId: null, blockers: [] }], nextCursor: null };
  const calls: { input: PublishInput; key: string }[] = [];
  const api = { queue: async () => queue, publish: async (input: PublishInput, key: string) => { calls.push({ input, key }); if (calls.length === 1) throw new MappingApiError(503,"Outcome unknown"); return { modelId:id,releaseId:id,revision:2,checksum:"a".repeat(64) }; } };
  render(<PublisherQueue initial={queue} api={api} />);
  fireEvent.change(screen.getByLabelText("Release summary"),{target:{value:"Reviewed"}});
  fireEvent.click(screen.getByRole("button",{name:"Review publication"}));
  await act(async()=>fireEvent.click(screen.getByRole("button",{name:"Confirm publish and activate"})));
  expect((screen.getByRole("button",{name:"Reload queue"}) as HTMLButtonElement).disabled).toBe(true);
  await act(async()=>fireEvent.click(screen.getByRole("button",{name:"Retry exact publication"})));
  expect(calls).toHaveLength(2); expect(calls[1]).toEqual(calls[0]);
  expect(screen.getByRole("status").textContent).toContain("Published release 2");
});
it("clears rejected stale queue versions and requires a fresh review after reload", async () => {
  const queue = { items: [{ modelId: id, name: "Synthetic", workingVersion: 4, publicationVersion: 9, activeReleaseId: null, blockers: [] }], nextCursor: null };
  const api = { queue: async () => ({...queue,items:[{...queue.items[0],publicationVersion:10}]}), publish: async () => { throw new MappingApiError(409,"Stale"); } };
  render(<PublisherQueue initial={queue} api={api} />);
  fireEvent.change(screen.getByLabelText("Release summary"),{target:{value:"Reviewed"}});
  fireEvent.click(screen.getByRole("button",{name:"Review publication"}));
  await act(async()=>fireEvent.click(screen.getByRole("button",{name:"Confirm publish and activate"})));
  expect(screen.queryByRole("button",{name:"Review publication"})).toBeNull();
  await act(async()=>fireEvent.click(screen.getByRole("button",{name:"Reload queue"})));
  expect(screen.getByText(/Publication version 10/)).toBeTruthy();
  expect(screen.queryByRole("button",{name:"Confirm publish and activate"})).toBeNull();
});
