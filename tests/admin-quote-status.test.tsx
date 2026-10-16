// @vitest-environment jsdom
import React from "react";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { DEMO_COMPANY } from "@/data/accounts";
import { fixtureQuoteRecords } from "@/data/quote-status.server";
import { factoryAddedLine, missingBeforeNotify, responseDays, toCustomerQuoteLines } from "@/lib/quote-status";
import { mergeQuoteRecords, notifyCustomers } from "@/state/quote-store";
import { RequestProvider } from "@/state/RequestContext";
import { AdminQuoteStatus } from "@/app/(portal)/quotes/admin/AdminQuoteStatus";
import { PortalShell } from "@/components/PortalShell";
import type { QuoteStatusRecord } from "@/types/quotes";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }), usePathname: () => "/" }));
vi.mock("@/state/MachineContext", () => ({ useMachine: () => ({ selectedModel: null }) }));
vi.mock("@/state/SessionBoundary", () => ({ useCustomerSession: () => null, SignOutButton: () => null }));
afterEach(() => { cleanup(); localStorage.clear(); sessionStorage.clear(); });

const TODAY = "2026-10-13";
const stored = (): Record<string, QuoteStatusRecord> => JSON.parse(localStorage.getItem("rdpp:quote-records:v1") ?? "{}");
const renderAdmin = () => render(<AdminQuoteStatus seed={fixtureQuoteRecords} today={TODAY} />);

it("puts Factory Price tenth, straight after Qty (14 Oct, answer 1)", () => {
  renderAdmin();
  const headings = screen.getAllByRole("columnheader").map((cell) => cell.textContent);
  expect(headings[8]).toBe("Qty");
  expect(headings[9]).toBe("Factory Price (CAD)");
  expect(headings[10]).toBe("Response Date");
  // The deck's p58 columns are all there, plus the one the supervisor asked for.
  expect(headings).toHaveLength(26);
});

it("lists every account's lines, not only the demonstration account's", () => {
  renderAdmin();
  expect(screen.getByText("RD-00005")).toBeTruthy();
  expect(screen.getByText("Total Rentals")).toBeTruthy();
});

it("will not release a line that has not been filled in", () => {
  renderAdmin();
  fireEvent.click(screen.getByRole("checkbox", { name: "Select 19-00511 from RD-00007" }));
  fireEvent.click(screen.getByRole("button", { name: /Notify Customer · 1/ }));
  expect(screen.getByRole("alert").textContent).toMatch(/RD-00007 19-00511: Available, Unit Price/);
  expect(stored()["qs-0007-1"]).toBeUndefined();
});

it("fill in, notify, and the customer sees the answer (14 Oct, answer 3)", () => {
  renderAdmin();
  fireEvent.change(screen.getByRole("combobox", { name: "Availability of 19-00511" }), { target: { value: "yes" } });
  const price = screen.getByRole("textbox", { name: "Unit price for 19-00511" });
  fireEvent.change(price, { target: { value: "$12.5" } });
  fireEvent.blur(price);
  const factory = screen.getByRole("textbox", { name: "Factory price for 19-00511" });
  fireEvent.change(factory, { target: { value: "9.80" } });
  fireEvent.blur(factory);

  // Typed, but not yet released: the customer still sees nothing.
  const before = toCustomerQuoteLines(mergeQuoteRecords(fixtureQuoteRecords, stored()), DEMO_COMPANY.id, TODAY);
  expect(before.find((line) => line.id === "qs-0007-1")?.response).toBeNull();

  fireEvent.click(screen.getByRole("checkbox", { name: "Select 19-00511 from RD-00007" }));
  fireEvent.click(screen.getByRole("button", { name: /Notify Customer · 1/ }));
  expect(screen.getByRole("status").textContent).toMatch(/Notified Savage Equipment about RD-00007 \(1 line\)\. One notice per quote/);

  const after = toCustomerQuoteLines(mergeQuoteRecords(fixtureQuoteRecords, stored()), DEMO_COMPANY.id, TODAY);
  const line = after.find((item) => item.id === "qs-0007-1")!;
  expect(line.response).toMatchObject({ available: "yes", unitPrice: "12.50", totalPrice: "125.00" });
  // The factory's price stays on the administrator's side.
  expect(JSON.stringify(after)).not.toContain("9.80");
  expect(stored()["qs-0007-1"]).toMatchObject({ notifyCustomer: true, responseDate: TODAY, factoryPrice: "9.80" });
});

it("adds a line the factory quoted that the customer never asked for", () => {
  renderAdmin();
  fireEvent.click(screen.getByRole("checkbox", { name: "Select 19-00368 from RD-00006" }));
  const before = screen.getAllByText("Added by factory").length;
  fireEvent.click(screen.getByRole("button", { name: "Add factory line" }));
  expect(screen.getAllByText("Added by factory")).toHaveLength(before + 1);
  expect(stored()["RD-00006-F1"]).toMatchObject({ quoteNo: "RD-00006", requested: null, companyId: DEMO_COMPANY.id });
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
