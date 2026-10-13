// @vitest-environment jsdom
import React from "react";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { fixtureQuoteRecords } from "@/data/quote-status.server";
import { toCustomerQuoteLines } from "@/lib/quote-status";
import { computeTotals, RequestProvider, useRequest } from "@/state/RequestContext";
import { QuoteStatus } from "@/app/(portal)/quotes/QuoteStatus";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
afterEach(() => { cleanup(); sessionStorage.clear(); });

const TODAY = "2026-10-13";
const lines = () => toCustomerQuoteLines(fixtureQuoteRecords, "co-placeholder", TODAY);
const line = (id: string) => lines().find((item) => item.id === id)!;

it("shows only the account's own lines, newest request first", () => {
  const result = lines();
  expect(result.map((item) => item.quoteNo)).toEqual(["RD-00007", "RD-00006", "RD-00006", "RD-00006", "RD-00006", "RD-00003"]);
  expect(result.some((item) => item.quoteNo === "RD-00005")).toBe(false);
});

it("never carries the factory price to the customer", () => {
  const serialized = JSON.stringify(lines());
  expect(serialized).not.toContain("factoryPrice");
  for (const factoryOnly of ["6900.00", "182.00", "120.00", "175.00"]) expect(serialized).not.toContain(factoryOnly);
});

it("hides the response until the administrator notifies the customer", () => {
  expect(line("qs-0007-1").response).toBeNull();
  expect(line("qs-0007-1").orderable).toBeNull();
});

it("orders available and partial lines at the quoted price, and nothing else", () => {
  expect(line("qs-0006-1").orderable).toMatchObject({ partNumber: "19-00368", qty: 4, unitPrice: "19.18" });
  expect(line("qs-0006-1").response?.totalPrice).toBe("76.72");
  expect(line("qs-0006-2").orderable).not.toBeNull();
  expect(line("qs-0006-3").orderable).toBeNull(); // not available
  // A line the factory added carries its own part number and no catalogue part.
  expect(line("qs-0006-4").orderable).toMatchObject({ partNumber: "98-00041", catalogPartId: null });
});

it("expires prices 30 days after the request date", () => {
  expect(line("qs-0003-1").priceValidUntil).toBe("2026-10-02");
  expect(line("qs-0003-1").expired).toBe(true);
  expect(line("qs-0003-1").orderable).toBeNull();
  expect(toCustomerQuoteLines(fixtureQuoteRecords, "co-placeholder", "2026-10-02").find((item) => item.id === "qs-0003-1")!.expired).toBe(false);
});

it("does not discount a quoted price a second time", () => {
  const totals = computeTotals([
    { partId: "a", partNumberSnapshot: "A", descriptionSnapshot: "A", qty: 1, unitPriceSnapshot: 100, lineTotal: 100 },
    { partId: "b", partNumberSnapshot: "B", descriptionSnapshot: "B", qty: 1, unitPriceSnapshot: 50, lineTotal: 50, quoteNo: "RD-00006" },
  ], 0.1);
  expect(totals).toEqual({ listTotal: 150, discountApplied: 10, netTotal: 140 });
});

function Cart() {
  const { lines: cart } = useRequest();
  return <output aria-label="cart">{cart.map((item) => `${item.partNumberSnapshot}@${item.unitPriceSnapshot}x${item.qty}:${item.quoteNo ?? ""}`).join(",")}</output>;
}

it("adds ticked quoted lines to the cart at the quoted price", async () => {
  render(<RequestProvider><QuoteStatus lines={lines()} /><Cart /></RequestProvider>);
  expect((screen.getByRole("checkbox", { name: "Select 19-00511 from RD-00007" }) as HTMLInputElement).disabled).toBe(true);
  expect((screen.getByRole("checkbox", { name: "Select 51-00045 from RD-00006" }) as HTMLInputElement).disabled).toBe(true);
  expect(screen.getByText("Awaiting RUF Diamond’s response")).toBeTruthy();

  fireEvent.click(screen.getByRole("checkbox", { name: "Select 19-00368 from RD-00006" }));
  fireEvent.click(screen.getByRole("checkbox", { name: "Select 98-00041 from RD-00006" }));
  fireEvent.click(screen.getByRole("button", { name: /Add to cart · 2/ }));
  const dialog = screen.getByRole("dialog", { name: "Confirm parts to add to the cart" });
  fireEvent.click(within(dialog).getByRole("button", { name: "Add to cart" }));
  await screen.findByText(/successfully added to order list/i);

  expect(screen.getByLabelText("cart").textContent).toBe("19-00368@19.18x4:RD-00006,98-00041@145.00x1:RD-00006");
  expect((screen.getByRole("checkbox", { name: "Select 19-00368 from RD-00006" }) as HTMLInputElement).disabled).toBe(true);
});
