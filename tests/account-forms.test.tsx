// @vitest-environment jsdom
import React from "react";
import { afterEach,expect,it,vi } from "vitest";
import {cleanup,fireEvent,render,screen,waitFor} from "@testing-library/react";
import { ActivationForm } from "@/app/(auth)/activate/ActivationForm";
import { UserAccounts } from "@/app/(portal)/admin/users/UserAccounts";
import UsersPage from "@/app/(portal)/admin/users/page";
import { requireCustomerSession } from "@/lib/customer-session.server";
vi.mock("@/lib/customer-session.server",()=>({requireCustomerSession:vi.fn()}));
afterEach(()=>{cleanup();vi.unstubAllGlobals();vi.clearAllMocks();history.replaceState(null,'','/');});
const id='10000000-0000-4000-8000-000000000001';
const directory={users:[],nextCursor:null,companies:[{id,name:'Customer',type:'customer'}],roles:[{key:'catalog_admin',name:'RUF admin'},{key:'purchaser',name:'Purchaser'},{key:'technician',name:'Technician'}]};
it('server-gates account management without a verified administrator',async()=>{
  vi.mocked(requireCustomerSession).mockResolvedValue(null);
  render(await UsersPage());expect(screen.queryByRole('button',{name:'Create account'})).toBeNull();
  expect(screen.getByText(/verified RUF administrator/i)).toBeTruthy();
});
it('removes the setup token from the address bar and does not put it in browser storage',async()=>{
  const token='synthetic-invitation-token-with-32-chars';history.replaceState(null,'',`/activate#token=${token}`);
  render(<ActivationForm apiMode/>);await screen.findByRole('button',{name:'Set password'});
  expect(location.hash).toBe('');expect(JSON.stringify(localStorage)).not.toContain(token);expect(JSON.stringify(sessionStorage)).not.toContain(token);
});
it('completes setup only after the server validates the token and password',async()=>{
  history.replaceState(null,'','/activate#token=synthetic-invitation-token-with-32-chars');
  const fetcher=vi.fn<typeof fetch>(async()=>Response.json({completed:true}));vi.stubGlobal('fetch',fetcher);
  render(<ActivationForm apiMode/>);await screen.findByRole('button',{name:'Set password'});
  fireEvent.change(screen.getByLabelText('New password'),{target:{value:'Disposable-password-23!'}});
  fireEvent.change(screen.getByLabelText('Confirm password'),{target:{value:'Disposable-password-23!'}});
  fireEvent.click(screen.getByRole('button',{name:'Set password'}));await screen.findByRole('link',{name:'Sign in'});
  expect(JSON.parse(fetcher.mock.calls[0][1]!.body as string)).toMatchObject({token:'synthetic-invitation-token-with-32-chars'});
  expect(screen.queryByLabelText('New password')).toBeNull();
});
it('does not show success for an invalid setup response',async()=>{
  history.replaceState(null,'','/activate#token=synthetic-invitation-token-with-32-chars');vi.stubGlobal('fetch',async()=>Response.json({}));
  render(<ActivationForm apiMode/>);await screen.findByRole('button',{name:'Set password'});
  for(const label of ['New password','Confirm password'])fireEvent.change(screen.getByLabelText(label),{target:{value:'Disposable-password-23!'}});
  fireEvent.click(screen.getByRole('button',{name:'Set password'}));await screen.findByRole('alert');expect(screen.queryByRole('link',{name:'Sign in'})).toBeNull();
});
it('shows setup requirements rather than simulating account activation in the public preview',()=>{
  render(<ActivationForm apiMode={false}/>);expect(screen.queryByRole('button',{name:'Set password'})).toBeNull();expect(screen.getByText(/not connected on this preview/i)).toBeTruthy();
});
it('creates an account without setting a password or sending email and reveals a dismissible private link',async()=>{
  const created={user:{id,companyId:id,companyName:'Customer',name:'New User',email:'new@example.test',loginId:'new',roleKey:'technician',status:'invited',version:1},invitation:{token:'synthetic-invitation-token-with-32-chars',expiresAt:'2026-10-27T12:00:00.000Z'}};
  const fetcher=vi.fn(async(_url:unknown,init?:RequestInit)=>Response.json(init?.method==='POST'?created:directory,{status:init?.method==='POST'?201:200}));vi.stubGlobal('fetch',fetcher);
  render(<UserAccounts viewerId="viewer" csrfToken="csrf" canManage/>);await screen.findByRole('button',{name:'Create account'});
  fireEvent.change(screen.getByLabelText('Full name'),{target:{value:'New User'}});fireEvent.change(screen.getByLabelText('Username'),{target:{value:'new'}});fireEvent.change(screen.getByLabelText('Email'),{target:{value:'new@example.test'}});fireEvent.change(screen.getByLabelText('Company',{exact:true}),{target:{value:id}});
  fireEvent.click(screen.getByRole('button',{name:'Create account'}));await screen.findByText(/no email has been sent/i);
  expect((screen.getByLabelText('Private setup link') as HTMLTextAreaElement).value).toContain('/activate#token=');
  const write=fetcher.mock.calls.find(call=>call[1]?.method==='POST')!;
  expect(write[1]?.headers).toMatchObject({'x-csrf-token':'csrf'});expect(write[1]?.body).not.toMatch(/password/);
  fireEvent.click(screen.getByRole('button',{name:'Dismiss setup link'}));await waitFor(()=>expect(screen.queryByLabelText('Private setup link')).toBeNull());
});
