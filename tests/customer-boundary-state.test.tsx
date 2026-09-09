// @vitest-environment jsdom
import React, { useState } from "react";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { SessionBoundary } from "@/state/SessionBoundary";
import { MachineProvider, useMachine } from "@/state/MachineContext";
import type { MeResponse } from "@rufdiamond/contracts";
const navigation = vi.hoisted(() => ({ path: "/figures/test", reset: vi.fn() }));
vi.mock("next/navigation", () => ({ usePathname: () => navigation.path, useSearchParams: () => new URLSearchParams() }));
vi.mock("@/state/customer-session", async original => ({ ...await original<typeof import("@/state/customer-session")>(), resetCustomerNavigation: navigation.reset }));
const session: MeResponse = { id: "user", companyId: "company", displayName: "Synthetic", csrfToken: "test", capabilities: ["catalog.figure.view"], company: { id: "company", name: "Synthetic", type: "customer", defaultShippingAddress: null }, scopes: { brandIds: "all", accountIds: "all", fleet: "all", environment: "published", priceTier: "none", scopeVersion: "1", canViewPrices: false } };
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks(); navigation.path = "/figures/test"; navigation.reset.mockClear(); });
function Work() {
  const [comment, setComment] = useState("");
  const { selectedModel, setMachine } = useMachine();
  return <><input aria-label="Comment" value={comment} onChange={e => setComment(e.target.value)} /><button onClick={() => setMachine({ id: "model", productLineId: "line", name: "Chosen machine", status: "active", catalogState: "live", updatedAt: null }, { id: "variant", modelId: "model", label: "Range", serialFrom: null, serialTo: null, catalogRevision: null })}>Choose machine</button><span>{selectedModel?.name}</span></>;
}
const tree = () => <SessionBoundary session={session}><MachineProvider persist={false}><Work /></MachineProvider></SessionBoundary>;
it("keeps machine and work mounted but inaccessible during unchanged-authority focus and navigation checks", async () => {
  let complete: ((value: Response) => void) | undefined;
  vi.stubGlobal("fetch", async () => Response.json(session));
  const view = render(tree());
  await waitFor(() => expect(screen.getByRole("textbox", { name: "Comment" })).toBeTruthy());
  const input = screen.getByRole("textbox", { name: "Comment" }) as HTMLInputElement;
  fireEvent.change(input, { target: { value: "Keep this request note" } });
  fireEvent.click(screen.getByRole("button", { name: "Choose machine" }));
  vi.stubGlobal("fetch", () => new Promise<Response>(resolve => { complete = resolve; }));
  act(() => window.dispatchEvent(new Event("focus")));
  expect(input.isConnected).toBe(true);
  expect(screen.queryByRole("textbox", { name: "Comment" })).toBeNull();
  expect(input.closest("[inert]")).not.toBeNull();
  await act(async () => complete!(Response.json(session)));
  expect(screen.getByRole("textbox", { name: "Comment" })).toBe(input);
  expect(input.value).toBe("Keep this request note");
  expect(screen.getByText("Chosen machine")).toBeTruthy();
  navigation.path = "/systems";
  view.rerender(tree());
  expect(input.isConnected).toBe(true);
  expect(screen.queryByRole("textbox", { name: "Comment" })).toBeNull();
  await act(async () => complete!(Response.json(session)));
  expect(input.value).toBe("Keep this request note");
  expect(screen.getByText("Chosen machine")).toBeTruthy();
});
it("discards the mounted work and hard-invalidates when authority changes", async () => {
  vi.stubGlobal("fetch", async () => Response.json(session));
  render(tree());
  await waitFor(() => expect(screen.getByRole("textbox", { name: "Comment" })).toBeTruthy());
  const input = screen.getByRole("textbox", { name: "Comment" });
  vi.stubGlobal("fetch", async () => Response.json({ ...session, scopes: { ...session.scopes, scopeVersion: "2" } }));
  act(() => window.dispatchEvent(new Event("focus")));
  await waitFor(() => expect(navigation.reset).toHaveBeenCalledOnce());
  expect(input.isConnected).toBe(false);
});
