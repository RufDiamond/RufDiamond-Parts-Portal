// @vitest-environment jsdom
import React from "react";
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MachineProvider } from "@/state/MachineContext";
import { RequestProvider, useRequest } from "@/state/RequestContext";
import { QuoteRequest } from "@/app/(portal)/request/QuoteRequest";
import { Checkout } from "@/app/(portal)/checkout/Checkout";
vi.mock("next/navigation",()=>({useRouter:()=>({push:vi.fn()})}));
vi.mock("@/state/SessionBoundary",()=>({useCustomerSession:()=>({capabilities:['orders.list.build','orders.own.view'],csrfToken:'test'})}));
afterEach(()=>{cleanup();sessionStorage.clear();});
function Seed(){const {addParts}=useRequest();return <button onClick={()=>void addParts([{part:{id:'p1',partNumber:'P1',description:'Test part',currency:'CAD',manufacturer:null,listPrice:10,status:'active',supersededByPartId:null,requires:[]}}])}>Add part</button>;}
it('technicians can build a request without receiving a submission control',async()=>{
  render(<MachineProvider persist={false}><RequestProvider><Seed/><QuoteRequest usage={{}}/></RequestProvider></MachineProvider>);
  fireEvent.click(screen.getByRole('button',{name:'Add part'}));await screen.findByText('Test part');
  expect(screen.queryByRole('button',{name:/submit/i})).toBeNull();
});
it('technicians cannot open an order submission form',()=>{
  render(<RequestProvider><Checkout today="2026-10-26"/></RequestProvider>);
  expect(screen.getByText(/your role can build requests/i)).toBeTruthy();
});
