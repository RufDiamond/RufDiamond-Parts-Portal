// @vitest-environment jsdom
import React from "react";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { AddToCartDialog, CheckCart } from "@/components";
import { RequestProvider, useRequest } from "@/state/RequestContext";
import type { Company, Part } from "@/types/catalog";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));

const part = (id: string, partNumber: string, listPrice?: number): Part => ({
  id, partNumber, description: `Part ${partNumber}`, manufacturer: null, currency: "CAD",
  status: "active", supersededByPartId: null, requires: [],
  ...(listPrice === undefined ? {} : { listPrice }),
});
const heater = part("p1", "68-00032", 559.93);
const fan = part("p2", "89-00026", 179.81);
const company: Company = { id: "c", name: "Synthetic", discountRate: 0.1, defaultShippingAddress: null } as Company;

afterEach(() => { cleanup(); sessionStorage.clear(); });

it("confirms edited quantities with subtotal, discount and total before tax", async () => {
  const onConfirm = vi.fn(async () => true);
  render(<AddToCartDialog parts={[{ part: heater, qty: 1 }, { part: fan, qty: 4 }]} currency="CAD" discountRate={0.1} onConfirm={onConfirm} onClose={() => {}} />);
  const dialog = screen.getByRole("dialog", { name: "Confirm parts to add to the cart" });
  fireEvent.click(within(dialog).getByRole("button", { name: "Increase Quantity for 68-00032" }));
  const foot = dialog.querySelector("tfoot") as HTMLElement;
  // 2 × 559.93 + 4 × 179.81 = 1,839.10; 10% off = 183.91; net 1,655.19.
  expect(within(foot).getByText("1,839.10")).toBeTruthy();
  expect(within(foot).getByText("183.91")).toBeTruthy();
  expect(within(foot).getByText("1,655.19")).toBeTruthy();
  expect(within(dialog).getByText(/exclude taxes/)).toBeTruthy();
  fireEvent.click(within(dialog).getByRole("button", { name: "Add to cart" }));
  expect(onConfirm).toHaveBeenCalledWith([{ part: heater, qty: 2 }, { part: fan, qty: 4 }]);
  await screen.findByText(/successfully added to order list/i);
});

it("keeps the dialog open for another try when the addition fails", async () => {
  render(<AddToCartDialog parts={[{ part: heater }]} currency="CAD" discountRate={0} onConfirm={async () => false} onClose={() => {}} />);
  fireEvent.click(screen.getByRole("button", { name: "Add to cart" }));
  expect(await screen.findByRole("button", { name: "Add to cart" })).toBeTruthy();
  expect(screen.queryByText(/successfully added/i)).toBeNull();
});

it("shows no money columns when prices are withheld from the account", () => {
  render(<AddToCartDialog parts={[{ part: part("p3", "40-00006") }]} currency="CAD" discountRate={0} onConfirm={async () => true} onClose={() => {}} />);
  expect(screen.queryByText(/Unit price/)).toBeNull();
  expect(screen.queryByText("Total")).toBeNull();
});

function Seed() {
  const { addParts, linesHydrated } = useRequest();
  return <button type="button" disabled={!linesHydrated} onClick={() => { void addParts([{ part: heater, qty: 1 }, { part: fan, qty: 4 }]); }}>seed</button>;
}

it("lets the reader step, remove and clear cart lines from the drop-down", async () => {
  render(<RequestProvider company={company}><Seed /><CheckCart buttonClassName="" iconClassName="" /></RequestProvider>);
  const seed = screen.getByRole("button", { name: "seed" });
  await vi.waitFor(() => expect((seed as HTMLButtonElement).disabled).toBe(false));
  fireEvent.click(seed);
  fireEvent.click(await screen.findByRole("button", { name: "Check cart · 2" }));
  const menu = screen.getByRole("dialog", { name: "Cart" });
  expect(within(menu).getByText("2 items / 5 qty. in your cart")).toBeTruthy();
  expect(within(menu).getByText("CAD 1,279.17")).toBeTruthy();

  fireEvent.click(within(menu).getByRole("button", { name: "Decrease Quantity for 89-00026" }));
  expect(within(menu).getByText("2 items / 4 qty. in your cart")).toBeTruthy();

  fireEvent.click(within(menu).getByRole("button", { name: "Remove 68-00032 from the cart" }));
  expect(within(menu).getByText("1 item / 3 qty. in your cart")).toBeTruthy();

  fireEvent.click(within(menu).getByRole("button", { name: "Clear cart" }));
  expect(within(menu).getByText("Your cart is empty.")).toBeTruthy();
  expect(within(menu).getByRole("link", { name: "Checkout" }).getAttribute("aria-disabled")).toBe("true");
});

it("closes the drop-down on Escape", async () => {
  render(<RequestProvider><CheckCart buttonClassName="" iconClassName="" /></RequestProvider>);
  fireEvent.click(screen.getByRole("button", { name: "Check cart · 0" }));
  expect(screen.getByRole("dialog", { name: "Cart" })).toBeTruthy();
  fireEvent.keyDown(window, { key: "Escape" });
  expect(screen.queryByRole("dialog", { name: "Cart" })).toBeNull();
});

it("shows no discount line to an account without a discount", () => {
  render(<AddToCartDialog parts={[{ part: heater, qty: 1 }]} currency="CAD" discountRate={0} onConfirm={async () => true} onClose={() => {}} />);
  const foot = screen.getByRole("dialog").querySelector("tfoot") as HTMLElement;
  expect(within(foot).queryByText(/Discount/)).toBeNull();
  expect(within(foot).queryByText(/Subtotal/)).toBeNull();
  expect(within(foot).getByText("559.93")).toBeTruthy();
});
