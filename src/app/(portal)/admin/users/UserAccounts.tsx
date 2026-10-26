"use client";
import { useEffect, useState } from "react";
import { Value } from "@sinclair/typebox/value";
import { AccountDirectorySchema, InvitedUserSchema, ManagedUserSchema, type AccountDirectory, type ManagedUser, type InvitedUser } from "@rufdiamond/contracts";
import styles from "./users.module.css";

export function UserAccounts({viewerId,csrfToken,canManage}:{viewerId:string;csrfToken:string;canManage:boolean}) {
  const [directory,setDirectory]=useState<AccountDirectory|null>(null);
  const [error,setError]=useState("");const [busy,setBusy]=useState(false);
  const [link,setLink]=useState<{url:string;expiresAt:string;name:string}|null>(null);
  const [message,setMessage]=useState("");
  const [roles,setRoles]=useState<Record<string,string>>({});
  async function load(cursor?:string,append=false) {
    const response=await fetch(`/api/v1/admin/users${cursor?`?cursor=${encodeURIComponent(cursor)}`:''}`,{cache:'no-store',credentials:'same-origin'});
    const data:unknown=await response.json();if(!response.ok||!Value.Check(AccountDirectorySchema,data))throw new Error('Could not load user accounts. Reload or sign in again.');
    setDirectory(previous=>append&&previous?{...data,users:[...previous.users,...data.users]}:data);
  }
  useEffect(()=>{let active=true;
    // Use an abortable request so a departed or changed identity cannot commit stale data.
    const controller=new AbortController();
    void fetch('/api/v1/admin/users',{cache:'no-store',credentials:'same-origin',signal:controller.signal}).then(async response=>{
      const data:unknown=await response.json();if(!response.ok||!Value.Check(AccountDirectorySchema,data))throw new Error('Could not load user accounts. Sign in again or retry.');
      if(active)setDirectory(data);
    }).catch(()=>{if(active)setError('Could not load user accounts. Sign in again or retry.');});
    return()=>{active=false;controller.abort();};
  },[]);
  const reveal=(result:InvitedUser)=>{
    setLink({url:`${window.location.origin}/activate#token=${encodeURIComponent(result.invitation.token)}`,expiresAt:result.invitation.expiresAt,name:result.user.name});
  };
  async function write(path:string,method:'POST'|'PATCH',body:unknown) {
    const response=await fetch(`/api/v1/${path}`,{method,cache:'no-store',credentials:'same-origin',headers:{'content-type':'application/json','x-csrf-token':csrfToken},body:JSON.stringify(body)});
    const data:unknown=await response.json();
    if(!response.ok)throw new Error(typeof data==='object'&&data&&'detail'in data&&typeof data.detail==='string'?data.detail:'The change could not be saved. Reload before retrying.');
    return data;
  }
  async function run(action:()=>Promise<void>){if(busy)return;setBusy(true);setError('');setMessage('');setLink(null);
    try{await action();}catch(e){setError(e instanceof Error?e.message:'The change could not be saved.');}finally{setBusy(false);}}
  async function change(user:ManagedUser,update:{roleKey?:string;status?:string}) {
    await run(async()=>{const data=await write(`admin/users/${user.id}`,'PATCH',{version:user.version,...update});
      if(!Value.Check(ManagedUserSchema,data))throw new Error('Unexpected account response. Reload before retrying.');
      setDirectory(current=>current?{...current,users:current.users.map(row=>row.id===data.id?data:row)}:current);
      setRoles(current=>({...current,[data.id]:data.roleKey}));setMessage(`Updated ${data.name}. Previous sessions have been signed out.${data.status==='invited'?' Generate a new setup link before sharing the invitation.':''}`);
    });
  }
  return <main className={styles.page}><h1>User accounts</h1>
    <p>RUF admin manages accounts and quotes. Purchasers submit requests. Technicians build requests for a purchaser to submit.</p>
    <p>Each customer account is limited to its company and assigned machines.</p>
    {error&&<p role="alert">{error}</p>}{message&&<p role="status">{message}</p>}
    <button type="button" disabled={busy} onClick={()=>void run(()=>load())}>Reload accounts</button>
    {!directory&&!error&&<p role="status">Loading accounts…</p>}
    {link&&<section className={styles.setup} aria-label="Account setup link"><h2>Setup link for {link.name}</h2>
      <p>Share this link privately with the account owner. It works once and expires {new Date(link.expiresAt).toLocaleString()}. No email has been sent.</p>
      <label>Private setup link<textarea readOnly value={link.url}/></label>
      <button type="button" onClick={()=>void navigator.clipboard.writeText(link.url).then(()=>setMessage('Setup link copied.')).catch(()=>setError('Could not copy. Select the link and copy it manually.'))}>Copy setup link</button>
      <button type="button" onClick={()=>setLink(null)}>Dismiss setup link</button></section>}
    {directory&&canManage&&<section><h2>Create account</h2><form className={styles.form} onSubmit={event=>{
      event.preventDefault();const form=event.currentTarget;const data=new FormData(form);
      void run(async()=>{const result=await write('admin/users','POST',Object.fromEntries(data));
        if(!Value.Check(InvitedUserSchema,result))throw new Error('Unexpected account response. Reload before generating a new setup link.');
        reveal(result);form.reset();await load();});
    }}>
      <label>Full name<input name="name" required maxLength={160}/></label>
      <label>Username<input name="loginId" required maxLength={320} autoComplete="off" pattern="\S+"/></label>
      <label>Email<input name="email" type="email" required maxLength={320}/></label>
      <div className={styles.field}><label htmlFor="new-user-company">Company</label><select id="new-user-company" name="companyId" required defaultValue=""><option value="" disabled>Choose company</option>{directory.companies.map(c=><option value={c.id} key={c.id}>{c.name}</option>)}</select></div>
      <div className={styles.field}><label htmlFor="new-user-role">Role</label><select id="new-user-role" name="roleKey" defaultValue="technician">{directory.roles.map(r=><option value={r.key} key={r.key}>{r.name}</option>)}</select></div>
      <button disabled={busy} type="submit">Create account</button>
    </form></section>}
    {directory&&<section><h2>Accounts</h2><div className={styles.table}><table><thead><tr><th>Name</th><th>Username / email</th><th>Company</th><th>Role</th><th>Status</th><th>Actions</th></tr></thead>
      <tbody>{directory.users.map(user=><tr key={user.id}><td>{user.name}</td><td>{user.loginId}<br/>{user.email}</td><td>{user.companyName}</td>
        <td>{canManage&&user.id!==viewerId?<><select aria-label={`Role for ${user.name}`} value={roles[user.id]??user.roleKey} onChange={e=>setRoles({...roles,[user.id]:e.target.value})}>
          {directory.roles.map(r=><option key={r.key} value={r.key}>{r.name}</option>)}</select>
          <button type="button" disabled={busy||!roles[user.id]||roles[user.id]===user.roleKey} onClick={()=>void change(user,{roleKey:roles[user.id]})}>Save role</button></>:directory.roles.find(r=>r.key===user.roleKey)?.name??user.roleKey}</td>
        <td>{user.status}</td><td>{user.id===viewerId?'Your account':canManage&&<>
          <button type="button" disabled={busy} onClick={()=>void change(user,{status:user.status==='disabled'?'active':'disabled'})}>{user.status==='disabled'?'Enable access':'Disable access'}</button>
          {(user.status==='invited'||user.status==='disabled')&&<button type="button" disabled={busy} onClick={()=>void run(async()=>{
            const result=await write(`admin/users/${user.id}/invitation`,'POST',{version:user.version});
            if(!Value.Check(InvitedUserSchema,result))throw new Error('Unexpected invitation response. Reload before retrying.');reveal(result);await load();
          })}>New setup link</button>}</>}</td></tr>)}</tbody></table></div>
      {directory.nextCursor&&<button type="button" disabled={busy} onClick={()=>void run(()=>load(directory.nextCursor!,true))}>Load more accounts</button>}
    </section>}
  </main>;
}
