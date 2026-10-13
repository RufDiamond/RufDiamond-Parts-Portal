// @vitest-environment jsdom
import React from "react";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { Checkout } from "@/app/(portal)/checkout/Checkout";
import { emptyAddress, emptyDraft, sectionProblem } from "@/lib/checkout";
import { RequestProvider, useRequest } from "@/state/RequestContext";
import type { AccountProfile } from "@/types/checkout";
import type { Company, Part } from "@/types/catalog";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
afterEach(() => { cleanup(); sessionStorage.clear(); localStorage.clear(); });

const TODAY = "2026-10-13";
const address = { ...emptyAddress(), firstName: "J.", lastName: "Tremblay", company: "Red Lake Mine", address: "62 Smelter Road",
  city: "Coniston", province: "Ontario", postalCode: "P0M 1M0", email: "parts@example.com", phone: "705-555-0142" };
const profile: AccountProfile = { serials: ["99FT3W251001"], shipping: address, billing: { ...address, address: "100 Elm Street", postalCode: "P3C 1T3" } };

it("asks for a future date on a scheduled order and then needs no carrier", () => {
  const draft = { ...emptyDraft(), orderType: "schedule" as const };
  expect(sectionProblem("type", draft, TODAY)).toMatch(/date/);
  expect(sectionProblem("type", { ...draft, scheduleDate: TODAY }, TODAY)).toMatch(/after today/);
  expect(sectionProblem("type", { ...draft, scheduleDate: "2026-10-20" }, TODAY)).toBeNull();
  expect(sectionProblem("shipping", draft, TODAY)).toBeNull();
  expect(sectionProblem("shipping", { ...draft, orderType: "regular" }, TODAY)).toMatch(/shipping method/);
});

it("requires the PO and a serial, typed when Other is chosen", () => {
  const draft = { ...emptyDraft(), poNumber: "4500689756" };
  expect(sectionProblem("detail", draft, TODAY)).toMatch(/serial/);
  expect(sectionProblem("detail", { ...draft, vinChoice: "other" }, TODAY)).toMatch(/Enter the serial/);
  expect(sectionProblem("detail", { ...draft, vinChoice: "other", vinOther: "9924P250416" }, TODAY)).toBeNull();
});

it("checks Canadian postal codes and skips billing when it is the shipping address", () => {
  const draft = { ...emptyDraft(), shipping: { ...address, postalCode: "12345" } };
  expect(sectionProblem("addresses", draft, TODAY)).toMatch(/postal code/);
  expect(sectionProblem("addresses", { ...draft, shipping: address }, TODAY)).toMatch(/Billing address/);
  expect(sectionProblem("addresses", { ...draft, shipping: address, billingSameAsShipping: true }, TODAY)).toBeNull();
});

const part: Part = { id: "p1", partNumber: "68-00032", description: "Heater panel control assy", manufacturer: null, listPrice: 559.93,
  currency: "CAD", status: "active", supersededByPartId: null, requires: [] };
const company = { id: "c", name: "Red Lake Mine", type: "dealer", discountRate: 0.1, defaultShippingAddress: null } as Company;

function Seed() {
  const { addParts, linesHydrated, lines } = useRequest();
  return <button type="button" disabled={!linesHydrated} onClick={() => { void addParts([{ part, qty: 2 }]); }}>seed {lines.length}</button>;
}

async function renderWithCart() {
  render(<RequestProvider company={company}><Seed /><Checkout profile={profile} today={TODAY} /></RequestProvider>);
  const seed = await screen.findByRole("button", { name: "seed 0" });
  await vi.waitFor(() => expect((seed as HTMLButtonElement).disabled).toBe(false));
  fireEvent.click(seed);
  await screen.findByRole("button", { name: "seed 1" });
}

it("walks the order through every section, review and submission", async () => {
  await renderWithCart();
  const next = (name: RegExp) => fireEvent.click(screen.getByRole("button", { name }));

  // Nothing chosen yet: the arrow explains instead of moving on.
  next(/Continue to order type detail/);
  expect(screen.getByRole("alert").textContent).toMatch(/Choose an order type/);
  fireEvent.click(screen.getByRole("radio", { name: "Regular Order" }));
  next(/Continue to order type detail/);

  fireEvent.change(screen.getByLabelText("PO No.:"), { target: { value: "4500689756" } });
  fireEvent.change(screen.getByLabelText("VIN No.:"), { target: { value: "99FT3W251001" } });
  next(/Continue to shipping method/);
  fireEvent.click(screen.getByRole("radio", { name: "Purolator Ground" }));
  next(/Continue to shipping and billing address/);

  // Both addresses come from the account profile.
  expect(screen.getByText("62 Smelter Road")).toBeTruthy();
  expect(screen.getByText("100 Elm Street")).toBeTruthy();
  next(/Continue to special instructions/);
  fireEvent.change(screen.getByRole("textbox", { name: "Special instructions" }), { target: { value: "Please send the invoice as soon as possible" } });
  next(/Review order/);

  expect(screen.getByRole("heading", { name: "Order Confirmation" })).toBeTruthy();
  expect(screen.getByRole("heading", { name: "Pricing Disclaimer & Order Terms" })).toBeTruthy();
  // 2 × 559.93 = 1,119.86; 10% off = 111.99; total 1,007.87.
  const foot = document.querySelector("tfoot") as HTMLElement;
  expect(within(foot).getByText("$ 1,119.86")).toBeTruthy();
  expect(within(foot).getByText("$ 111.99")).toBeTruthy();
  expect(within(foot).getByText("$ 1,007.87")).toBeTruthy();
  expect(screen.getByText("Via: Purolator Ground")).toBeTruthy();
  expect(screen.getByText("PO: 4500689756")).toBeTruthy();

  fireEvent.click(screen.getByRole("button", { name: "Submit" }));
  const done = screen.getByRole("dialog", { name: "Order Confirmation" });
  expect(within(done).getByText("Your order has been submitted successfully.")).toBeTruthy();
  fireEvent.click(within(done).getByRole("button", { name: "OK" }));
  expect(screen.getByRole("heading", { name: "Order No: 00001" })).toBeTruthy();
  expect(screen.getByRole("note").textContent).toMatch(/not been sent/);
  expect(screen.getByRole("button", { name: "seed 0" })).toBeTruthy();
});

it("keeps later answers and flags the section a change makes incomplete", async () => {
  await renderWithCart();
  fireEvent.click(screen.getByRole("radio", { name: "Regular Order" }));
  fireEvent.click(screen.getByRole("button", { name: /Continue to order type detail/ }));
  fireEvent.change(screen.getByLabelText("PO No.:"), { target: { value: "4500689756" } });

  // Switching back to Schedule leaves the PO typed, and asks for the date.
  fireEvent.click(screen.getByRole("radio", { name: "Schedule" }));
  expect(screen.getByRole("alert").textContent).toMatch(/Choose the date/);
  expect((screen.getByLabelText("PO No.:") as HTMLInputElement).value).toBe("4500689756");
});
