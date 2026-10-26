import { randomBytes, randomUUID } from "node:crypto";
import argon2 from "argon2";
import { beforeAll, afterAll, describe, expect, it } from "vitest";
import { buildApp } from "../../src/app.js";
import { createDatabase } from "../../src/db/client.js";
import { startPostgres } from "../helpers/postgres.js";
import { createAccountService } from "../../src/modules/accounts/service.js";
import { createPasswordService } from "../../src/modules/identity/passwords.js";
import { grantLocalRuntime } from "../../src/db/local-runtime-grants.js";

const origin = "https://portal.example.test";
const password = "Disposable-test-password-92!";
const passwordOptions = { type: argon2.argon2id, memoryCost: 2048, timeCost: 2, parallelism: 1 } as const;
describe("admin-created pilot accounts", () => {
  let postgres: Awaited<ReturnType<typeof startPostgres>>;
  let database: ReturnType<typeof createDatabase>;
  let app: Awaited<ReturnType<typeof buildApp>>;
  let admin: { cookie: string; csrf: string };
  let customer: { cookie: string; csrf: string };
  const companyId = randomUUID(), otherCompanyId = randomUUID(), internalId = randomUUID(), adminId = randomUUID();
  beforeAll(async () => {
    postgres = await startPostgres(); await postgres.migrate(); database = createDatabase(postgres.connectionString);
    await postgres.pool.query("insert into company(id,name,type) values($1,'RUF','internal'),($2,'Customer A','customer'),($3,'Customer B','customer')", [internalId, companyId, otherCompanyId]);
    const hash = await argon2.hash(password, passwordOptions);
    for (const [id, company, key, login] of [[adminId, internalId, 'catalog_admin', 'admin'], [randomUUID(), companyId, 'purchaser', 'customer']]) {
      await postgres.pool.query("insert into app_user(id,company_id,name,login_id,email,password_hash,role_id) select $1,$2,$3,$3,$4,$5,id from role where key=$6", [id, company, login, `${login}@example.test`, hash, key]);
      await postgres.pool.query("insert into user_scope(user_id,brand_mode,account_mode,fleet_mode,environment) values($1,$2,$3,$2,$4)", [id, company === internalId ? 'all':'company', company === internalId ? 'all':'own', company === internalId ? 'published_and_draft':'published']);
    }
    const runtimeRole=`ruf_local_${randomBytes(8).toString('hex')}`,runtimePassword=randomBytes(24).toString('hex');
    await postgres.pool.query(`CREATE ROLE "${runtimeRole}" LOGIN PASSWORD '${runtimePassword}' NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS`);
    await grantLocalRuntime(postgres.pool,runtimeRole);await database.close();
    const runtimeUrl=new URL(postgres.connectionString);runtimeUrl.username=runtimeRole;runtimeUrl.password=runtimePassword;database=createDatabase(runtimeUrl.href);
    app = await buildApp({ config: {nodeEnv:'test',port:0,databaseUrl:runtimeUrl.href,sessionSecret:'account-test-session-secret-at-least-32',webOrigin:origin,allowInsecureLoopbackCookie:false,deliveryEncryption:{activeKeyId:'test',keys:{test:randomBytes(32).toString('base64')}},s3:{endpoint:'http://localhost:9000',region:'us-east-1',bucket:'test',accessKeyId:'test',secretAccessKey:'test'}}, dependencies:{database,passwordOptions} });
    admin = await login('admin'); customer = await login('customer');
  }, 120000);
  afterAll(async () => { await app?.close(); await database?.close(); await postgres?.stop(); },30000);
  async function login(loginId: string) {
    const r=await app.inject({method:'POST',url:'/api/v1/auth/sign-in',headers:{origin},payload:{loginId,password}});
    expect(r.statusCode).toBe(200);return {cookie:r.headers['set-cookie']!.toString().split(';')[0],csrf:r.json().csrfToken as string};
  }
  function request(method: 'GET'|'POST'|'PATCH', url: string, payload?: object, actor=admin) {
    return app.inject({method,url,headers:{origin,cookie:actor.cookie,'x-csrf-token':actor.csrf},payload});
  }
  function input(overrides={}) { const id=randomUUID();return {companyId,name:'New user',email:`${id}@example.test`,loginId:id,roleKey:'technician',...overrides}; }
  async function create(overrides={}) {
    const body=input(overrides);const r=await request('POST','/api/v1/admin/users',body);expect(r.statusCode).toBe(201);return {...r.json(),input:body};
  }
  it('denies anonymous and customer account discovery before returning any identity data',async()=>{
    expect((await app.inject('/api/v1/admin/users')).statusCode).toBe(401);
    expect((await request('GET','/api/v1/admin/users',undefined,customer)).statusCode).toBe(403);
  });
  it('lists the three pilot roles and safe user summaries without credential material',async()=>{
    const r=await request('GET','/api/v1/admin/users');expect(r.statusCode).toBe(200);
    expect(r.json().roles.map((r:{key:string})=>r.key).sort()).toEqual(['catalog_admin','purchaser','technician']);
    expect(r.body).not.toMatch(/password|tokenHash|password_hash|sessionSecret/i);
  });
  it('creates an invited technician, activates once with a chosen password, and grants no submission authority',async()=>{
    const created=await create();expect(created.user.status).toBe('invited');expect(created.invitation.token.length).toBeGreaterThanOrEqual(32);
    const signIn=()=>app.inject({method:'POST',url:'/api/v1/auth/sign-in',headers:{origin},payload:{loginId:created.input.loginId,password}});
    expect((await signIn()).statusCode).toBe(401);
    const complete=()=>app.inject({method:'POST',url:'/api/v1/auth/invitations/complete',headers:{origin},payload:{token:created.invitation.token,newPassword:password}});
    expect((await complete()).statusCode).toBe(200);expect((await complete()).statusCode).toBe(401);
    const r=await signIn();expect(r.statusCode).toBe(200);
    const me=await app.inject({url:'/api/v1/me',headers:{cookie:r.headers['set-cookie']!.toString().split(';')[0]}});
    expect(me.json().capabilities).toContain('orders.list.build');expect(me.json().capabilities).not.toContain('orders.submit');
    expect(me.json().scopes.accountIds).toEqual([companyId]);
    expect((await postgres.pool.query('select token_hash from account_invitation where user_id=$1',[created.user.id])).rows[0].token_hash).not.toBe(created.invitation.token);
    const audit=await postgres.pool.query('select after_patch from audit_log where object_id=$1',[created.user.id]);
    expect(JSON.stringify(audit.rows)).not.toContain(created.invitation.token);
  });
  it('requires origin and CSRF; rejects unknown roles, self edits and staff roles in customer companies',async()=>{
    expect((await app.inject({method:'POST',url:'/api/v1/admin/users',headers:{origin,cookie:admin.cookie},payload:input()})).statusCode).toBe(403);
    expect((await request('POST','/api/v1/admin/users',input({roleKey:'owner'}))).statusCode).toBe(400);
    expect((await request('POST','/api/v1/admin/users',input({roleKey:'catalog_admin'}))).statusCode).toBe(403);
    expect((await request('PATCH',`/api/v1/admin/users/${adminId}`,{version:1,status:'disabled'})).statusCode).toBe(403);
  });
  it('reissues setup links, rejecting the original token, expiry and cross-origin activation',async()=>{
    const created=await create();const reissue=await request('POST',`/api/v1/admin/users/${created.user.id}/invitation`,{version:created.user.version});
    expect(reissue.statusCode).toBe(200);
    const activate=(token:string,originHeader=origin)=>app.inject({method:'POST',url:'/api/v1/auth/invitations/complete',headers:{origin:originHeader},payload:{token,newPassword:password}});
    expect((await activate(created.invitation.token)).statusCode).toBe(401);
    expect((await activate(reissue.json().invitation.token,'https://untrusted.example')).statusCode).toBe(403);
    await postgres.pool.query("update account_invitation set expires_at=now()-interval '1 second' where user_id=$1",[created.user.id]);
    expect((await activate(reissue.json().invitation.token)).statusCode).toBe(401);
  });
  it('rejects stale edits and invalidates setup links when an invited account is disabled',async()=>{
    const created=await create();const patch=await request('PATCH',`/api/v1/admin/users/${created.user.id}`,{version:created.user.version,status:'disabled'});
    expect(patch.statusCode).toBe(200);
    expect((await request('PATCH',`/api/v1/admin/users/${created.user.id}`,{version:created.user.version,status:'active'})).statusCode).toBe(409);
    expect((await app.inject({method:'POST',url:'/api/v1/auth/invitations/complete',headers:{origin},payload:{token:created.invitation.token,newPassword:password}})).statusCode).toBe(401);
  });
  it('revokes a signed-in purchaser after a role change and removes extra grants',async()=>{
    const created=await create({roleKey:'purchaser'});
    await app.inject({method:'POST',url:'/api/v1/auth/invitations/complete',headers:{origin},payload:{token:created.invitation.token,newPassword:password}});
    const signed=await login(created.input.loginId);
    await postgres.pool.query("insert into user_capability(user_id,capability_key) values($1,'audit.log.view')",[created.user.id]);
    const version=(await postgres.pool.query('select version from app_user where id=$1',[created.user.id])).rows[0].version;
    const changed=await request('PATCH',`/api/v1/admin/users/${created.user.id}`,{version,roleKey:'technician'});expect(changed.statusCode).toBe(200);
    expect((await request('GET','/api/v1/me',undefined,signed)).statusCode).toBe(401);
    const again=await login(created.input.loginId);const me=await request('GET','/api/v1/me',undefined,again);
    expect(me.json().capabilities).not.toContain('orders.submit');expect(me.json().capabilities).not.toContain('audit.log.view');
  });
  it('does not allow customer-company users to become account administrators through direct grants',async()=>{
    const user=(await postgres.pool.query("select id from app_user where login_id='customer'")).rows[0].id;
    await postgres.pool.query("insert into user_capability(user_id,capability_key) values($1,'users.all.manage'),($1,'roles.manage')",[user]);
    try{expect((await request('GET','/api/v1/admin/users',undefined,customer)).statusCode).toBe(403);
      expect((await request('POST','/api/v1/admin/users',input({companyId:otherCompanyId}),customer)).statusCode).toBe(403);
    }finally{await postgres.pool.query('delete from user_capability where user_id=$1',[user]);}
  });
  it('keeps scoped internal administrators within their accounts',async()=>{
    const created=await create({companyId:internalId,roleKey:'catalog_admin'});
    await app.inject({method:'POST',url:'/api/v1/auth/invitations/complete',headers:{origin},payload:{token:created.invitation.token,newPassword:password}});
    await postgres.pool.query("update user_scope set account_mode='own' where user_id=$1",[created.user.id]);
    const scoped=await login(created.input.loginId);const directory=await request('GET','/api/v1/admin/users',undefined,scoped);
    expect(directory.statusCode).toBe(200);expect(directory.json().users.every((u:{companyId:string})=>u.companyId===internalId)).toBe(true);
    expect((await request('POST','/api/v1/admin/users',input(),scoped)).statusCode).toBe(403);
    expect((await request('POST','/api/v1/admin/users',input({companyId:internalId,roleKey:'catalog_admin'}),scoped)).statusCode).toBe(403);
    const target=await create({companyId:internalId,roleKey:'technician'});
    expect((await request('PATCH',`/api/v1/admin/users/${target.user.id}`,{version:target.user.version,roleKey:'catalog_admin'},scoped)).statusCode).toBe(403);
    const broad=await create({companyId:internalId,roleKey:'catalog_admin'});
    expect((await request('POST',`/api/v1/admin/users/${broad.user.id}/invitation`,{version:broad.user.version},scoped)).statusCode).toBe(403);
  });
  it('does not reissue setup credentials for named extra grants the administrator lacks',async()=>{
    const created=await create();await postgres.pool.query("insert into user_capability(user_id,capability_key) values($1,'publish.execute')",[created.user.id]);
    expect((await request('POST',`/api/v1/admin/users/${created.user.id}/invitation`,{version:created.user.version})).statusCode).toBe(403);
  });
  it('refuses upward role delegation by an administrator with a narrower capability bundle',async()=>{
    const role=randomUUID(),user=randomUUID();const hash=await argon2.hash(password,passwordOptions);
    await postgres.pool.query("insert into role(id,key,name) values($1,'account_operator','Account operator')",[role]);
    await postgres.pool.query("insert into role_capability(role_id,capability_key) values($1,'users.all.manage'),($1,'roles.manage')",[role]);
    await postgres.pool.query("insert into app_user(id,company_id,name,login_id,email,password_hash,role_id) values($1,$2,'Limited','limited','limited@example.test',$3,$4)",[user,internalId,hash,role]);
    await postgres.pool.query("insert into user_scope(user_id,brand_mode,account_mode,fleet_mode) values($1,'all','all','all')",[user]);
    const limited=await login('limited');expect((await request('POST','/api/v1/admin/users',input({companyId:internalId,roleKey:'catalog_admin'}),limited)).statusCode).toBe(403);
  });
  it('refuses bootstrap when an administrator already exists',async()=>{
    const service=createAccountService(database.db,()=>new Date(),createPasswordService(passwordOptions));
    await expect(service.bootstrap(input({companyId:internalId}))).rejects.toMatchObject({code:'BOOTSTRAP_UNAVAILABLE'});
  });
  it('serializes conflicting administrator writes instead of disabling both actors',async()=>{
    const one=await create({companyId:internalId,roleKey:'catalog_admin'}),two=await create({companyId:internalId,roleKey:'catalog_admin'});
    for(const item of [one,two])await app.inject({method:'POST',url:'/api/v1/auth/invitations/complete',headers:{origin},payload:{token:item.invitation.token,newPassword:password}});
    const first=await login(one.input.loginId),second=await login(two.input.loginId);
    const responses=await Promise.all([request('PATCH',`/api/v1/admin/users/${two.user.id}`,{version:2,status:'disabled'},first),request('PATCH',`/api/v1/admin/users/${one.user.id}`,{version:2,status:'disabled'},second)]);
    expect(responses.map(r=>r.statusCode).sort()).toEqual([200,403]);
    const active=await postgres.pool.query("select id from app_user where id in ($1,$2) and status='active'",[one.user.id,two.user.id]);expect(active.rows).toHaveLength(1);
  });
  it('bootstraps one invited internal admin and rolls back if private delivery fails',async()=>{
    const previous=await postgres.pool.query("select u.id,u.status from app_user u join company c on c.id=u.company_id where c.type='internal'");
    const service=createAccountService(database.db,()=>new Date(),createPasswordService(passwordOptions));const data=input({companyId:internalId});
    let createdId:string|undefined;
    try{
      await postgres.pool.query("update app_user set status='disabled' where company_id=$1",[internalId]);
      await expect(service.bootstrap(data,async()=>{throw new Error('private file unavailable');})).rejects.toThrow('private file unavailable');
      expect((await postgres.pool.query('select id from app_user where login_id=$1',[data.loginId])).rows).toHaveLength(0);
      const result=await service.bootstrap(data);createdId=result.user.id;expect(result.user.status).toBe('invited');
      await expect(service.bootstrap(input({companyId:internalId}))).rejects.toMatchObject({code:'BOOTSTRAP_UNAVAILABLE'});
      await service.complete(result.invitation.token,password,'bootstrap-test');
      const signed=await login(data.loginId);const me=await request('GET','/api/v1/me',undefined,signed);expect(me.json().capabilities).toContain('users.all.manage');
    }finally{
      if(createdId)await postgres.pool.query("update app_user set status='disabled' where id=$1",[createdId]);
      for(const row of previous.rows)await postgres.pool.query('update app_user set status=$2 where id=$1',[row.id,row.status]);
    }
  });
});
