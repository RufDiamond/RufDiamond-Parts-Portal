// @vitest-environment jsdom
import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { BrandParts } from "@/app/(portal)/parts/[brand]/BrandParts";
import { MachineProvider } from "@/state/MachineContext";
import type { ProductLine } from "@/types/catalog";

const navigation = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => navigation }));
afterEach(() => { cleanup(); navigation.push.mockClear(); });

const line = { id: "pl-fat-truck", name: "Fat Truck" } as ProductLine;

it("searches by part number and by description from the model page (slides 16 and 22)", () => {
  render(<MachineProvider><BrandParts productLine={line} models={[]} slug="fat-truck" /></MachineProvider>);
  fireEvent.change(screen.getByLabelText("Search by Description"), { target: { value: "hex nut" } });
  fireEvent.click(screen.getByRole("button", { name: "Search by description" }));
  expect(navigation.push).toHaveBeenCalledWith("/search?mode=description&q=hex%20nut&brand=fat-truck");
  fireEvent.change(screen.getByLabelText("Search by Part Number"), { target: { value: "19-00368" } });
  fireEvent.click(screen.getByRole("button", { name: "Search by part number" }));
  expect(navigation.push).toHaveBeenLastCalledWith("/search?mode=part&q=19-00368&brand=fat-truck");
});
