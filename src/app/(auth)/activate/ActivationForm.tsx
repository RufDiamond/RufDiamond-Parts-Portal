"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Value } from "@sinclair/typebox/value";
import { InvitationCompletedSchema } from "@rufdiamond/contracts";

export function ActivationForm({apiMode}:{apiMode:boolean}) {
  const [token,setToken]=useState('');const [ready,setReady]=useState(false);const [busy,setBusy]=useState(false);
  const [password,setPassword]=useState('');const [confirm,setConfirm]=useState('');
  const [error,setError]=useState('');const [complete,setComplete]=useState(false);
  useEffect(()=>{
    // Opening another setup link in this tab must discard the previous
    // activation state and read the newly supplied fragment from a fresh page.
    const changed=()=>window.location.reload();
    window.addEventListener('hashchange',changed);
    const timer=window.setTimeout(()=>{
      const candidate=new URLSearchParams(window.location.hash.slice(1)).get('token')??'';
      window.history.replaceState(null,'',window.location.pathname+window.location.search);
      if(candidate.length>=32&&candidate.length<=256)setToken(candidate);setReady(true);
    },0);
    return()=>{window.clearTimeout(timer);window.removeEventListener('hashchange',changed);};
  },[]);
  return <main style={{maxWidth:480,margin:'48px auto',padding:24}}><h1>Set up your RUF Diamond account</h1>
    {!apiMode?<p>Account setup is not connected on this preview. Ask your RUF administrator for the connected portal address.</p>
    :complete?<><p role="status">Your account is ready. Sign in with your username and new password.</p><Link href="/signin">Sign in</Link></>
    :!ready?<p role="status">Reading setup link…</p>
    :!token?<p role="alert">This setup link is missing or invalid. Ask your RUF administrator for a new link.</p>
    :<form onSubmit={async event=>{
      event.preventDefault();if(busy)return;setError('');if(password!==confirm){setError('Passwords must match.');return;}setBusy(true);
      try{const response=await fetch('/api/v1/auth/invitations/complete',{method:'POST',cache:'no-store',credentials:'same-origin',headers:{'content-type':'application/json'},body:JSON.stringify({token,newPassword:password})});
        if(!response.ok)throw new Error(response.status===401?'This setup link is invalid or expired. Ask your RUF administrator for a new link.':'Account setup could not be completed. Please try again.');
        if(!Value.Check(InvitationCompletedSchema,await response.json()))throw new Error('Account setup returned an unexpected response. Please sign in or ask your administrator to check the account.');
        setToken('');setPassword('');setConfirm('');setComplete(true);
      }catch(e){setError(e instanceof Error?e.message:'Account setup could not be completed.');}finally{setBusy(false);}
    }}><p>Choose a password of at least 12 characters. This setup link works once.</p>
      <label style={{display:'block',marginTop:16}}>New password<input style={{display:'block',width:'100%',padding:8}} type="password" autoComplete="new-password" required minLength={12} maxLength={512} value={password} onChange={e=>setPassword(e.target.value)}/></label>
      <label style={{display:'block',marginTop:16}}>Confirm password<input style={{display:'block',width:'100%',padding:8}} type="password" autoComplete="new-password" required minLength={12} maxLength={512} value={confirm} onChange={e=>setConfirm(e.target.value)}/></label>
      {error&&<p role="alert">{error}</p>}<button style={{padding:12,marginTop:16}} type="submit" disabled={busy}>{busy?'Setting up…':'Set password'}</button>
    </form>}
  </main>;
}
