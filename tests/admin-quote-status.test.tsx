// @vitest-environment jsdom
import React from "react";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { DEMO_COMPANY } from "@/data/accounts";
import { fixtureQuoteRecords } from "@/data/quote-status.server";
import { factoryAddedLine, missingBeforeNotify, responseDays } from "@/lib/quote-status";
import { notifyCustomers } from "@/state/quote-store";
import { RequestProvider } from "@/state/RequestContext";
import { AdminQuoteStatus } from "@/app/(portal)/quotes/admin/AdminQuoteStatus";
import { PortalShell } from "@/components/PortalShell";
import type { QuoteStatusRecord } from "@/types/quotes";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }), usePathname: () => "/" }));
vi.mock("@/state/MachineContext", () => ({ useMachine: () => ({ selectedModel: null }) }));

/*
 * Signed out (the local demonstration) unless a test signs a staff member in.
 * With a session the screen talks to the quote API; the API is faked here so
 * these tests check what the screen sends, not the database behind it.
 */
const auth = vi.hoisted(() => ({ session: null as null | { csrfToken: string } }));
vi.mock("@/state/SessionBoundary", () => ({ useCustomerSession: () => auth.session, SignOutButton: () => null }));

const api = vi.hoisted(() => ({
  listAdmin: vi.fn(),
  patchLine: vi.fn(),
  notify: vi.fn(),
  addFactoryLine: vi.fn(),
}));
vi.mock("@/state/quote-api", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  createQuoteApi: () => api,
}));

afterEach(() => {
  cleanup(); localStorage.clear(); sessionStorage.clear();
  auth.session = null;
  for (const fn of Object.values(api)) fn.mockReset();
});

const TODAY = "2026-10-13";
const stored = (): Record<string, QuoteStatusRecord> => JSON.parse(localStorage.getItem("rdpp:quote-records:v1") ?? "{}");
const renderAdmin = () => render(<AdminQuoteStatus seed={fixtureQuoteRecords} today={TODAY} />);

/** The API's lines are the fixture records with a version for optimistic locking. */
const apiLines = () => fixtureQuoteRecords.map((record) => ({ ...record, version: 1 }));

function signInStaff() {
  auth.session = { csrfToken: "test" };
  api.listAdmin.mockResolvedValue({ items: apiLines() });
  // Remembers every save, as the real service does, so later edits build on earlier ones.
  const lines = new Map(apiLines().map((line) => [line.id, line]));
  api.patchLine.mockImplementation(async (id: string, input: Record<string, unknown>) => {
    const changes = Object.fromEntries(Object.entries(input).filter(([key, value]) => key !== "version" && value !== undefined));
    const next = { ...lines.get(id)!, ...changes, version: lines.get(id)!.version + 1 };
    lines.set(id, next);
    return next;
  });
}

it("puts Factory Price tenth, straight after Qty (14 Oct, answer 1)", () => {
  renderAdmin();
  const headings = screen.getAllByRole("columnheader").map((cell) => cell.textContent);
  expect(headings[8]).toBe("Qty");
  expect(headings[9]).toBe("Factory Price (CAD)");
  expect(headings[10]).toBe("Response Date");
  // The deck's p58 columns are all there, plus the one the supervisor asked for.
  expect(headings).toHaveLength(26);
  expect(headings[1]).toBe("No.");
  expect(headings[20]).toBe("Notify Customer");
  expect(headings.slice(21)).toEqual(["Model", "Serial Number", "System", "Page", "Assembly Name"]);
});

it("shows the machine's serial number on every line — parts differ by VIN (14 Oct, answer 9)", () => {
  renderAdmin();
  expect(screen.getAllByText("99FT3W251004").length).toBe(fixtureQuoteRecords.length);
});

it("names every row's fields by their part, so rows can be told apart", () => {
  renderAdmin();
  const names = screen.getAllByRole("textbox", { name: /^Factory price for / }).map((input) => input.getAttribute("aria-label"));
  expect(names).toContain("Factory price for 19-00511");
  expect(names).toContain("Factory price for 98-00041");
  // Lines of the same quote are distinguishable too.
  expect(screen.getByRole("checkbox", { name: "Select 19-00368 from RD-00006" })).toBeTruthy();
  expect(screen.getByRole("checkbox", { name: "Select 62-00184 from RD-00006" })).toBeTruthy();
});

it("colours each row by availability, as the deck does", () => {
  renderAdmin();
  const row = (part: string) => screen.getByRole("checkbox", { name: new RegExp(`^Select ${part} from RD-00006$`) }).closest("tr")!;
  expect(row("19-00368").dataset.available).toBe("yes");
  expect(row("62-00184").dataset.available).toBe("partial");
  expect(row("51-00045").dataset.available).toBe("no");
});

it("lists every account's lines, not only the demonstration account's", () => {
  renderAdmin();
  expect(screen.getByText("RD-00005")).toBeTruthy();
  expect(screen.getByText("Total Rentals")).toBeTruthy();
});

it("will not release a line that has not been filled in", () => {
  renderAdmin();
  fireEvent.click(screen.getByRole("checkbox", { name: "Select 19-00511 from RD-00007" }));
  fireEvent.click(screen.getByRole("button", { name: "Notify Customer" }));
  expect(screen.getByRole("alert").textContent).toMatch(/RD-00007 19-00511: Available, Unit Price/);
  expect(stored()["qs-0007-1"]).toBeUndefined();
});

it("in the demonstration, without a staff sign-in, Notify Customer says so instead of releasing", async () => {
  renderAdmin();
  fireEvent.change(screen.getByRole("combobox", { name: "Availability of 19-00511" }), { target: { value: "yes" } });
  const price = screen.getByRole("textbox", { name: "Unit price for 19-00511" });
  fireEvent.change(price, { target: { value: "12.5" } });
  fireEvent.blur(price);
  fireEvent.click(screen.getByRole("checkbox", { name: "Select 19-00511 from RD-00007" }));
  fireEvent.click(screen.getByRole("button", { name: "Notify Customer" }));
  expect((await screen.findByRole("alert")).textContent).toMatch(/Sign in with a RUF Diamond quote capability/);
});

it("saves each field to the quote service and notifies through it (14 Oct, answers 1 and 3)", async () => {
  signInStaff();
  api.notify.mockResolvedValue({ notices: [{ customer: "Savage Equipment", quoteNo: "RD-00007", lineIds: ["qs-0007-1"] }] });
  renderAdmin();
  await waitFor(() => expect(api.listAdmin).toHaveBeenCalled());

  fireEvent.change(await screen.findByRole("combobox", { name: "Availability of 19-00511" }), { target: { value: "yes" } });
  await waitFor(() => expect(api.patchLine).toHaveBeenCalledWith("qs-0007-1", expect.objectContaining({ available: "yes" })));

  const factory = screen.getByRole("textbox", { name: "Factory price for 19-00511" });
  fireEvent.change(factory, { target: { value: "$9.8" } });
  fireEvent.blur(factory);
  await waitFor(() => expect(api.patchLine).toHaveBeenCalledWith("qs-0007-1", expect.objectContaining({ factoryPrice: "9.80" })));

  const price = screen.getByRole("textbox", { name: "Unit price for 19-00511" });
  fireEvent.change(price, { target: { value: "12.5" } });
  fireEvent.blur(price);
  await waitFor(() => expect(api.patchLine).toHaveBeenCalledWith("qs-0007-1", expect.objectContaining({ customerPrice: "12.50" })));

  fireEvent.click(screen.getByRole("checkbox", { name: "Select 19-00511 from RD-00007" }));
  fireEvent.click(screen.getByRole("button", { name: "Notify Customer" }));
  await waitFor(() => expect(api.notify).toHaveBeenCalledWith({ lineIds: ["qs-0007-1"] }));
  expect((await screen.findByRole("status")).textContent).toMatch(/Notified Savage Equipment about RD-00007 \(1 line\)\. One notice and email per quote/);
});

it("adds a line the factory quoted to the request it belongs to", async () => {
  signInStaff();
  api.addFactoryLine.mockResolvedValue({ ...apiLines()[1], id: "qs-0006-f1", requested: null, newPartNumber: "TBD" });
  renderAdmin();
  await waitFor(() => expect(api.listAdmin).toHaveBeenCalled());
  fireEvent.click(await screen.findByRole("checkbox", { name: "Select 19-00368 from RD-00006" }));
  fireEvent.click(screen.getByRole("button", { name: "Add factory line" }));
  await waitFor(() => expect(api.addFactoryLine).toHaveBeenCalledWith(
    expect.objectContaining({ quoteNo: "RD-00006", companyId: DEMO_COMPANY.id })));
});

it("needs a part number and description before a factory line can be released", () => {
  const added = factoryAddedLine(fixtureQuoteRecords[1], new Set());
  expect(missingBeforeNotify({ ...added, available: "yes", customerPrice: "10.00", newQty: 1 }))
    .toEqual(["New Part No. and New Description"]);
});

it("counts response days from the request", () => {
  expect(responseDays(fixtureQuoteRecords.find((record) => record.id === "qs-0006-3")!)).toBe(3);
  expect(responseDays(fixtureQuoteRecords.find((record) => record.id === "qs-0007-1")!)).toBeNull();
});

it("shows the customer how many quotes have been answered, on the Quote Status button (answer 8)", () => {
  const record = { ...fixtureQuoteRecords.find((item) => item.id === "qs-0007-1")!, available: "yes" as const, customerPrice: "12.00" };
  notifyCustomers([record], TODAY);
  render(<RequestProvider company={DEMO_COMPANY}><PortalShell date="13 October 2026"><p>Page</p></PortalShell></RequestProvider>);
  const quoteStatus = screen.getByRole("link", { name: /Quote Status/ });
  expect(within(quoteStatus).getByText("1 quote answered")).toBeTruthy();
});

it("shows no counter for another account's answers", () => {
  const theirs = fixtureQuoteRecords.find((item) => item.id === "qs-0005-1")!;
  notifyCustomers([theirs], TODAY);
  render(<RequestProvider company={DEMO_COMPANY}><PortalShell date="13 October 2026"><p>Page</p></PortalShell></RequestProvider>);
  expect(screen.queryByText(/quotes? answered/)).toBeNull();
});
