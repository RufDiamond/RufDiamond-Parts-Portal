import { open, unlink } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
import type { CreateManagedUser, InvitedUser } from "@rufdiamond/contracts";
import { createDatabase } from "../../db/client.js";
import { createAccountService } from "./service.js";

/** Reserve a new private file before changing the database; never overwrite a link. */
export async function saveBootstrapInvitation(
  output:string,origin:string,create:(deliver:(result:InvitedUser)=>Promise<void>)=>Promise<InvitedUser>,
) {
  const url=new URL(origin);
  if(url.origin!==origin || url.protocol!=='https:'&&!(url.protocol==='http:'&&['127.0.0.1','localhost'].includes(url.hostname)))throw new Error('Use an exact HTTPS portal origin or explicit loopback.');
  const handle=await open(output,'wx',0o600);
  try {
    await create(async result=>{
      await handle.writeFile(JSON.stringify({username:result.user.loginId,setupUrl:`${origin}/activate#token=${encodeURIComponent(result.invitation.token)}`,expiresAt:result.invitation.expiresAt},null,2)+'\n');
      await handle.sync();
    });
  }catch(error){await handle.close();await unlink(output).catch(()=>{});throw error;}
  await handle.close();
}

async function main() {
  const args=process.argv.slice(2),values=new Map<string,string>();
  if(args.length%2)throw new Error('Supply --company-id, --name, --login, --email and --output.');
  for(let i=0;i<args.length;i+=2){if(!['--company-id','--name','--login','--email','--output'].includes(args[i])||values.has(args[i]))throw new Error('Unknown or repeated bootstrap option.');values.set(args[i],args[i+1]);}
  if(values.size!==5||!process.env.DATABASE_URL||!process.env.WEB_ORIGIN)throw new Error('Bootstrap requires all five options, DATABASE_URL and WEB_ORIGIN from the operator secret store.');
  const input:Omit<CreateManagedUser,'roleKey'>={companyId:values.get('--company-id')!,name:values.get('--name')!,loginId:values.get('--login')!,email:values.get('--email')!};
  const database=createDatabase(process.env.DATABASE_URL);
  try{await saveBootstrapInvitation(resolve(values.get('--output')!),process.env.WEB_ORIGIN,deliver=>createAccountService(database.db).bootstrap(input,deliver));
    process.stdout.write('First administrator invitation saved to the requested private file. No email was sent.\n');
  }finally{await database.close();}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
  void main().catch(()=>{process.stderr.write('Bootstrap failed. Check the options, private output path, database configuration and whether an administrator already exists. No setup token was logged.\n');process.exitCode=1;});
}
