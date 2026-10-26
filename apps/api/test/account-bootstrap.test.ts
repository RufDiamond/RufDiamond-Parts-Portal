import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect,it } from "vitest";
import type { InvitedUser } from "@rufdiamond/contracts";
import { saveBootstrapInvitation } from "../src/modules/accounts/bootstrap.js";
it('writes a new private setup file and refuses to overwrite an existing file',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'ruf-bootstrap-')),file=join(dir,'invitation.json');
  const result={user:{loginId:'test-user'},invitation:{token:'synthetic-test-invitation-only',expiresAt:'2026-10-27T12:00:00.000Z'}} as InvitedUser;
  try{await saveBootstrapInvitation(file,'https://portal.example.test',async deliver=>{await deliver(result);return result;});
    expect((await stat(file)).mode&0o777).toBe(0o600);expect(JSON.parse(await readFile(file,'utf8')).setupUrl).toContain('/activate#token=');
    await expect(saveBootstrapInvitation(file,'https://portal.example.test',async()=>result)).rejects.toThrow();
  }finally{await rm(dir,{recursive:true,force:true});}
});
it('removes the reserved private file when the database transaction fails',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'ruf-bootstrap-')),file=join(dir,'invitation.json');
  try{await expect(saveBootstrapInvitation(file,'https://portal.example.test',async()=>{throw new Error('transaction failed');})).rejects.toThrow('transaction failed');
    await expect(stat(file)).rejects.toMatchObject({code:'ENOENT'});
  }finally{await rm(dir,{recursive:true,force:true});}
});
