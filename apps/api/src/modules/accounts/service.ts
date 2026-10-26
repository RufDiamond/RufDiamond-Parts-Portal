import { randomBytes, randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { Value } from "@sinclair/typebox/value";
import { CreateManagedUserSchema, type CreateManagedUser, type ManagedUser, type PatchManagedUser, type InvitedUser } from "@rufdiamond/contracts";
import type { Database, Transaction } from "../../db/client.js";
import { AppError } from "../../plugins/error-handler.js";
import { loadAuthorization, loadManagedAccountAuthorization, requireCapability } from "../authorization/policy.js";
import type { AuthorizationContext } from "../authorization/types.js";
import { isCapabilityKey } from "../authorization/capabilities.js";
import { writeAuditLog } from "../audit/repository.js";
import { createPasswordService, type PasswordService } from "../identity/passwords.js";
import { revokeAllSessions } from "../identity/repository.js";
import { sha256 } from "../identity/service.js";

type Actor = { userId: string; requestId: string };
const scopeAllows = (auth: AuthorizationContext, companyId: string) => auth.accountIds === "all" || auth.accountIds.includes(companyId);
const denied = () => new AppError("FORBIDDEN",403,"This action is not permitted.");
const stale = () => new AppError("ACCOUNT_CHANGED",409,"This account changed. Reload before saving.");
const fields = sql`u.id, u.company_id AS "companyId", c.name AS "companyName", u.name, u.login_id AS "loginId", u.email, r.key AS "roleKey", u.status, u.version`;

export function createAccountService(database: Database, now = () => new Date(), passwords: PasswordService = createPasswordService()) {
  // A single lock order covers changes, invitation redemption and bootstrap.
  // Reloading authority after acquiring it rejects an admin revoked by a prior writer.
  async function lock(tx: Transaction) { await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext('ruf-account-administration-v1'))`); }
  async function authority(tx: Transaction, actor: Actor, write=false) {
    const auth=await loadAuthorization(tx,actor.userId);
    requireCapability(auth,"users.all.manage");
    if(write) requireCapability(auth,"roles.manage");
    const company=await tx.execute(sql`SELECT type FROM company WHERE id=${auth.companyId} AND status='active' FOR SHARE`);
    if(company.rows[0]?.type!=="internal") throw denied();
    return auth;
  }
  async function readUser(tx:Transaction,id:string,auth?:AuthorizationContext):Promise<ManagedUser> {
    const result=await tx.execute(sql`SELECT ${fields} FROM app_user u JOIN company c ON c.id=u.company_id JOIN role r ON r.id=u.role_id WHERE u.id=${id}`);
    const user=result.rows[0] as unknown as ManagedUser|undefined;
    if(!user || auth&&!scopeAllows(auth,user.companyId)) throw new AppError("ACCOUNT_NOT_FOUND",404,"Account not found.");
    return user;
  }
  async function roleFor(tx:Transaction,key:string,companyId:string,auth?:AuthorizationContext) {
    const roles=await tx.execute(sql`SELECT id,key FROM role WHERE key=${key} AND key IN ('catalog_admin','purchaser','technician')`);
    const role=roles.rows[0] as {id:string;key:string}|undefined;
    if(!role) throw new AppError("INVALID_ROLE",400,"Choose an available role.");
    const company=await tx.execute(sql`SELECT type FROM company WHERE id=${companyId} AND status='active' FOR SHARE`);
    if(!company.rows[0] || auth&&!scopeAllows(auth,companyId)) throw denied();
    const caps=await tx.execute(sql`SELECT capability_key AS key FROM role_capability WHERE role_id=${role.id}`);
    // These are provisioning presets, not permission checks against a role name.
    const internal=key==='catalog_admin';
    if(internal && company.rows[0].type!=='internal') throw denied();
    if(auth && caps.rows.some(row=>row.key!=='publish.block.override' && (!isCapabilityKey(String(row.key)) || !auth.capabilities.has(String(row.key))))) throw denied();
    return {id:role.id,internal};
  }
  async function boundedDelegation(tx:Transaction,auth:AuthorizationContext,userId:string) {
    const target=await loadManagedAccountAuthorization(tx,userId);
    const subset=(granted:AuthorizationContext['accountIds'],held:AuthorizationContext['accountIds'])=>held==='all'||granted!=='all'&&granted.every(id=>held.includes(id));
    if([...target.capabilities].some(key=>!auth.capabilities.has(key)) ||
      !subset(target.accountIds,auth.accountIds)||!subset(target.brandIds,auth.brandIds)||!subset(target.variantIds,auth.variantIds)||
      target.canViewDraft&&!auth.canViewDraft || target.canViewPrices&&!auth.canViewPrices)throw denied();
  }
  async function presetScope(tx:Transaction,userId:string,internal:boolean) {
    for(const table of ['user_product_line_scope','user_account_scope','user_fleet_scope','user_capability']) {
      await tx.execute(sql`DELETE FROM ${sql.identifier(table)} WHERE user_id=${userId}`);
    }
    await tx.execute(sql`INSERT INTO user_scope(user_id,brand_mode,account_mode,fleet_mode,environment)
      VALUES(${userId},${internal?'all':'company'},${internal?'all':'own'},${internal?'all':'company'},${internal?'published_and_draft':'published'})
      ON CONFLICT(user_id) DO UPDATE SET brand_mode=EXCLUDED.brand_mode,account_mode=EXCLUDED.account_mode,
      fleet_mode=EXCLUDED.fleet_mode,environment=EXCLUDED.environment,price_tier_id=NULL,version=user_scope.version+1,updated_at=now()`);
  }
  async function invalidate(tx:Transaction,userId:string) {
    await revokeAllSessions(tx,userId,now());
    await tx.execute(sql`UPDATE account_invitation SET consumed_at=${now()} WHERE user_id=${userId} AND consumed_at IS NULL`);
    await tx.execute(sql`UPDATE password_reset_token SET consumed_at=${now()},version=version+1,updated_at=${now()} WHERE user_id=${userId} AND consumed_at IS NULL`);
  }
  async function invite(tx:Transaction,userId:string) {
    const token=randomBytes(32).toString('base64url');const expiresAt=new Date(now().getTime()+24*60*60*1000);
    await tx.execute(sql`UPDATE account_invitation SET consumed_at=${now()} WHERE user_id=${userId} AND consumed_at IS NULL`);
    await tx.execute(sql`INSERT INTO account_invitation(user_id,token_hash,expires_at,created_at) VALUES(${userId},${sha256(token)},${expiresAt},${now()})`);
    return {token,expiresAt:expiresAt.toISOString()};
  }
  async function insert(tx:Transaction,input:CreateManagedUser,auth?:AuthorizationContext) {
    if(!Value.Check(CreateManagedUserSchema,input))throw new AppError('INVALID_ACCOUNT',400,'Supply a name, username, valid email, company and pilot role.');
    const role=await roleFor(tx,input.roleKey,input.companyId,auth);
    const userId=randomUUID(),login=input.loginId.trim().toLowerCase(),email=input.email.trim().toLowerCase();
    const hash=await passwords.hash(randomBytes(48).toString('base64url'));
    const created=await tx.execute(sql`INSERT INTO app_user(id,company_id,name,login_id,email,password_hash,role_id,status)
      VALUES(${userId},${input.companyId},${input.name.trim()},${login},${email},${hash},${role.id},'invited')
      ON CONFLICT DO NOTHING RETURNING id`);
    if(!created.rows.length) throw new AppError("ACCOUNT_EXISTS",409,"An account already uses that username or email.");
    await presetScope(tx,userId,role.internal);
    if(auth)await boundedDelegation(tx,auth,userId);
    return {user:await readUser(tx,userId),invitation:await invite(tx,userId)};
  }
  async function audit(tx:Transaction,actor:Actor,companyId:string,id:string,before:unknown,after:unknown) {
    await writeAuditLog(tx,{actorUserId:actor.userId,companyId,capability:"users.all.manage",requestId:actor.requestId},{objectType:"app_user",objectId:id,before,after});
  }
  return {
    async list(actor:Actor,cursor?:string) {
      return database.transaction(async tx=>{
        const auth=await authority(tx,actor);
        const scope=auth.accountIds==='all'?sql`true`:auth.accountIds.length?sql`u.company_id IN (${sql.join(auth.accountIds.map(id=>sql`${id}`),sql`,`)})`:sql`false`;
        const result=await tx.execute(sql`SELECT ${fields} FROM app_user u JOIN company c ON c.id=u.company_id JOIN role r ON r.id=u.role_id WHERE ${scope} AND ${cursor?sql`u.id>${cursor}::uuid`:sql`true`} ORDER BY u.id LIMIT 101`);
        const users=result.rows.slice(0,100) as unknown as ManagedUser[];
        const companyScope=auth.accountIds==='all'?sql`true`:auth.accountIds.length?sql`id IN (${sql.join(auth.accountIds.map(id=>sql`${id}`),sql`,`)})`:sql`false`;
        const companies=await tx.execute(sql`SELECT id,name,type FROM company WHERE ${companyScope} AND status='active' ORDER BY name,id LIMIT 501`);
        if(companies.rows.length>500) throw new AppError("COMPANY_DIRECTORY_LIMIT",409,"Company directory exceeds the pilot limit. Contact the administrator.");
        const roles=await tx.execute(sql`SELECT key,CASE WHEN key='catalog_admin' THEN 'RUF admin' ELSE name END AS name FROM role WHERE key IN ('catalog_admin','purchaser','technician') ORDER BY key`);
        return {users,companies:companies.rows,roles:roles.rows,nextCursor:result.rows.length>100?users.at(-1)!.id:null};
      });
    },
    async create(actor:Actor,input:CreateManagedUser) {
      return database.transaction(async tx=>{await lock(tx);const auth=await authority(tx,actor,true);const result=await insert(tx,input,auth);
        await audit(tx,actor,result.user.companyId,result.user.id,null,{...result.user,action:'invited'});return result;});
    },
    async patch(actor:Actor,id:string,input:PatchManagedUser) {
      return database.transaction(async tx=>{
        await lock(tx);const auth=await authority(tx,actor,true);if(id===actor.userId)throw denied();
        const before=await readUser(tx,id,auth);if(before.version!==input.version)throw stale();
        if(input.status==='active'&&before.status==='invited')throw new AppError('ACTIVATION_REQUIRED',409,'The user must finish account setup first.');
        // A suspended invitation must not be reactivated with its inaccessible random password.
        if(input.status==='active'&&before.status!=='active'){
          const activated=await tx.execute(sql`SELECT 1 FROM audit_log WHERE object_id=${id} AND capability='identity.invitation.complete' LIMIT 1`);
          const invitation=await tx.execute(sql`SELECT 1 FROM account_invitation WHERE user_id=${id} LIMIT 1`);
          if(invitation.rows.length&&!activated.rows.length)throw new AppError('ACTIVATION_REQUIRED',409,'Generate a new setup link to restore this account and let its owner finish setup.');
        }
        const role=await roleFor(tx,input.roleKey??before.roleKey,before.companyId,auth);
        const updated=await tx.execute(sql`UPDATE app_user SET role_id=${role.id},status=${input.status??before.status},version=version+1,updated_at=${now()} WHERE id=${id} AND version=${input.version} RETURNING id`);
        if(!updated.rows.length)throw stale();
        if(input.roleKey&&input.roleKey!==before.roleKey)await presetScope(tx,id,role.internal);
        await boundedDelegation(tx,auth,id);
        await invalidate(tx,id);const after=await readUser(tx,id);
        await audit(tx,actor,before.companyId,id,before,after);return after;
      });
    },
    async reissue(actor:Actor,id:string,version:number) {
      return database.transaction(async tx=>{await lock(tx);const auth=await authority(tx,actor,true);const user=await readUser(tx,id,auth);
        if(user.version!==version)throw stale();
        if(user.status==='disabled'){
          const used=await tx.execute(sql`SELECT 1 FROM audit_log WHERE object_id=${id} AND capability='identity.invitation.complete' LIMIT 1`);
          const pending=await tx.execute(sql`SELECT 1 FROM account_invitation WHERE user_id=${id} LIMIT 1`);
          if(used.rows.length||!pending.rows.length)throw new AppError('INVITATION_UNAVAILABLE',409,'Use the password reset process for an account that has completed setup.');
        }else if(user.status!=='invited')throw new AppError('INVITATION_UNAVAILABLE',409,'Only accounts awaiting setup can receive a setup link.');
        await roleFor(tx,user.roleKey,user.companyId,auth);
        await boundedDelegation(tx,auth,id);
        await tx.execute(sql`UPDATE app_user SET status='invited',version=version+1,updated_at=${now()} WHERE id=${id}`);
        const invitation=await invite(tx,id);await audit(tx,actor,user.companyId,id,null,{action:'invitation_reissued',expiresAt:invitation.expiresAt});
        return {user:await readUser(tx,id),invitation};});
    },
    async complete(token:string,newPassword:string,requestId:string) {
      return database.transaction(async tx=>{
        await lock(tx);const current=now();
        const result=await tx.execute(sql`SELECT i.id,i.user_id,u.company_id FROM account_invitation i JOIN app_user u ON u.id=i.user_id JOIN company c ON c.id=u.company_id
          WHERE i.token_hash=${sha256(token)} AND i.consumed_at IS NULL AND i.expires_at>${current} AND u.status='invited' AND c.status='active' FOR UPDATE OF i,u`);
        const row=result.rows[0] as {id:string;user_id:string;company_id:string}|undefined;
        if(!row)throw new AppError('INVALID_INVITATION',401,'The setup link is invalid or expired. Ask your RUF administrator for a new link.');
        const hash=await passwords.hash(newPassword);
        await tx.execute(sql`UPDATE app_user SET password_hash=${hash},status='active',version=version+1,updated_at=${current} WHERE id=${row.user_id}`);
        await invalidate(tx,row.user_id);
        await writeAuditLog(tx,{actorUserId:row.user_id,companyId:row.company_id,capability:'identity.invitation.complete',requestId},{objectType:'app_user',objectId:row.user_id,after:{action:'activated'}});
        return {completed:true as const};
      });
    },
    async bootstrap(input:Omit<CreateManagedUser,'roleKey'>,deliver?: (result:InvitedUser)=>Promise<void>) {
      return database.transaction(async tx=>{await lock(tx);
        const existing=await tx.execute(sql`SELECT 1 FROM app_user u JOIN company c ON c.id=u.company_id
          WHERE c.type='internal' AND u.status IN ('active','invited') AND
          (EXISTS(SELECT 1 FROM role_capability rc WHERE rc.role_id=u.role_id AND rc.capability_key='users.all.manage') OR EXISTS(SELECT 1 FROM user_capability uc WHERE uc.user_id=u.id AND uc.capability_key='users.all.manage')) LIMIT 1`);
        if(existing.rows.length)throw new AppError('BOOTSTRAP_UNAVAILABLE',409,'An administrator already exists. Use account management.');
        const result=await insert(tx,{...input,roleKey:'catalog_admin'});
        await writeAuditLog(tx,{actorUserId:null,companyId:input.companyId,capability:'users.all.manage',requestId:'operator-bootstrap'},{objectType:'app_user',objectId:result.user.id,after:{action:'bootstrap_invited',...result.user}});
        if(deliver)await deliver(result);return result;
      });
    },
  };
}
