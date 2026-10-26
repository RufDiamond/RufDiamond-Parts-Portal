import { test, expect, type Page } from "@playwright/test";
import { spawn, type ChildProcess } from "node:child_process";
import { createServer } from "node:net";
import { randomBytes, randomUUID } from "node:crypto";
import { resolve } from "node:path";
import argon2 from "argon2";
import { startPostgres } from "../../apps/api/test/helpers/postgres.js";
import { grantLocalRuntime } from "../../apps/api/src/db/local-runtime-grants.js";
import { createDatabase } from "../../apps/api/src/db/client.js";
import { createAccountService } from "../../apps/api/src/modules/accounts/service.js";
import { createPasswordService } from "../../apps/api/src/modules/identity/passwords.js";
import { buildApp } from "../../apps/api/src/app.js";

let pg:Awaited<ReturnType<typeof startPostgres>>,database:ReturnType<typeof createDatabase>,app:Awaited<ReturnType<typeof buildApp>>;
let next:ChildProcess,origin:string;const password='Disposable-browser-account-42!';
const company=randomUUID(),internal=randomUUID();let serverOutput='';
async function freePort(){const server=createServer();await new Promise<void>(r=>server.listen(0,'127.0.0.1',r));const port=(server.address() as {port:number}).port;await new Promise<void>(r=>server.close(()=>r()));return port;}
test.beforeAll(async()=>{
  test.setTimeout(90000);const webPort=await freePort();origin=`http://127.0.0.1:${webPort}`;
  pg=await startPostgres();await pg.migrate();
  await pg.pool.query("insert into company(id,name,type) values($1,'Local RUF','internal'),($2,'Local Customer','customer')",[internal,company]);
  const role=`ruf_local_${randomBytes(8).toString('hex')}`,secret=randomBytes(24).toString('hex');
  await pg.pool.query(`CREATE ROLE "${role}" LOGIN PASSWORD '${secret}' NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS`);await grantLocalRuntime(pg.pool,role);
  const url=new URL(pg.connectionString);url.username=role;url.password=secret;database=createDatabase(url.href);
  const passwordOptions={type:argon2.argon2id,memoryCost:2048,timeCost:2,parallelism:1} as const;
  const service=createAccountService(database.db,()=>new Date(),createPasswordService(passwordOptions));
  const admin=await service.bootstrap({companyId:internal,name:'Local Admin',loginId:'local-admin',email:'admin@local.example.test'});await service.complete(admin.invitation.token,password,'browser-bootstrap');
  app=await buildApp({config:{nodeEnv:'test',port:0,databaseUrl:url.href,sessionSecret:randomBytes(32).toString('hex'),webOrigin:origin,allowInsecureLoopbackCookie:true,deliveryEncryption:{activeKeyId:'local',keys:{local:randomBytes(32).toString('base64')}},s3:{endpoint:'http://127.0.0.1:9',region:'us-east-1',bucket:'unused',accessKeyId:'unused',secretAccessKey:'unused'}},dependencies:{database,passwordOptions}});
  await app.listen({host:'127.0.0.1',port:0});const api=`http://127.0.0.1:${(app.server.address() as {port:number}).port}`;
  next=spawn(process.execPath,[resolve('node_modules/next/dist/bin/next'),'start','--hostname','127.0.0.1','--port',String(webPort)],{env:{...process.env,RUF_REPOSITORY_MODE:'api',RUF_DEPLOYMENT_ENV:'local',RUF_API_UPSTREAM_URL:api,RUF_WEB_ORIGIN:origin},stdio:['ignore','pipe','pipe']});
  const collect=(chunk:Buffer)=>{serverOutput=(serverOutput+chunk.toString()).slice(-6000);};next.stdout?.on('data',collect);next.stderr?.on('data',collect);
  await expect.poll(async()=>{try{return (await fetch(origin+'/signin')).status;}catch{return 0;}},{timeout:60000}).toBe(200);
});
test.afterAll(async()=>{next?.kill('SIGTERM');if(next&&next.exitCode===null)await new Promise<void>(r=>next.once('exit',()=>r()));await app?.close();await database?.close();await pg?.stop();});
async function login(page:Page,user:string){await page.goto(origin+'/signin');await page.getByLabel('Username:',{exact:true}).fill(user);await page.getByLabel('Password:',{exact:true}).fill(password);await page.getByRole('button',{name:'Sign in',exact:true}).click();await expect(page).toHaveURL(origin+'/');}

test('real admin login, one-use setup, technician restrictions, role change and disablement',async({page,browser},info)=>{
  await login(page,'local-admin');await page.getByRole('link',{name:'User accounts',exact:true}).click();
  await expect(page.getByRole('button',{name:'Create account',exact:true})).toBeVisible();
  await page.getByLabel('Full name',{exact:true}).fill('Local Technician');await page.getByLabel('Username',{exact:true}).fill('local-technician');await page.getByLabel('Email',{exact:true}).fill('technician@local.example.test');await page.getByLabel('Company',{exact:true}).selectOption(company);
  await page.getByRole('button',{name:'Create account',exact:true}).click();
  const invitation=page.getByLabel('Private setup link');await expect(invitation).toBeVisible();const setup=await invitation.inputValue();
  await page.getByRole('button',{name:'Dismiss setup link'}).click();await expect(invitation).toHaveCount(0);
  await page.screenshot({path:info.outputPath('admin-accounts.png')});
  const context=await browser.newContext();const client=await context.newPage();
  try{
    await client.goto(setup);await expect(client.getByLabel('New password',{exact:true})).toBeVisible();await expect(client).toHaveURL(origin+'/activate');
    await client.getByLabel('New password',{exact:true}).fill(password);await client.getByLabel('Confirm password',{exact:true}).fill(password);await client.getByRole('button',{name:'Set password',exact:true}).click();await expect(client.getByRole('link',{name:'Sign in',exact:true})).toBeVisible();
    await client.goto(setup);await client.getByLabel('New password',{exact:true}).fill(password);await client.getByLabel('Confirm password',{exact:true}).fill(password);await client.getByRole('button',{name:'Set password',exact:true}).click();await expect(client.locator('main').getByRole('alert')).toContainText('invalid or expired');
    await login(client,'local-technician');await client.goto(origin+'/admin/users');await expect(client.getByText('Verified RUF administrator access is required.')).toBeVisible();expect((await client.request.get(origin+'/api/v1/admin/users')).status()).toBe(403);
    await client.goto(origin+'/checkout');await expect(client.getByRole('heading',{name:'Order request',exact:true})).toBeVisible();await expect(client.getByRole('button',{name:'Submit',exact:true})).toHaveCount(0);
    const me=await (await client.request.get(origin+'/api/v1/me')).json();expect(me.scopes.accountIds).toEqual([company]);expect(me.capabilities).not.toContain('orders.submit');
    await page.getByRole('button',{name:'Reload accounts'}).click();const row=page.getByRole('row').filter({has:page.getByText('Local Technician',{exact:true})});
    await expect(row).toContainText('active');await row.getByLabel('Role for Local Technician').selectOption('purchaser');const savedResponse=page.waitForResponse(r=>r.request().method()==='PATCH'&&r.url().includes('/api/v1/admin/users/'));await row.getByRole('button',{name:'Save role'}).click();const saved=await savedResponse;expect(saved.status(),await saved.text()).toBe(200);await expect(page.getByRole('status')).toContainText('Updated Local Technician');expect((await client.request.get(origin+'/api/v1/me')).status()).toBe(401);
    await login(client,'local-technician');const purchaser=await (await client.request.get(origin+'/api/v1/me')).json();expect(purchaser.capabilities).toContain('orders.submit');expect((await client.request.get(origin+'/api/v1/admin/quotes')).status()).toBe(403);
    await row.getByRole('button',{name:'Disable access'}).click();await expect(row).toContainText('disabled');expect((await client.request.get(origin+'/api/v1/me')).status()).toBe(401);
    await row.getByRole('button',{name:'Enable access'}).click();await expect(row).toContainText('active');await login(client,'local-technician');
    expect((await pg.pool.query("select id from outbox_event where event_type like 'identity.%'")).rows).toHaveLength(0);
  }finally{await context.close();}
});
test('admin account form remains usable on mobile without page overflow',async({page},info)=>{
  await page.setViewportSize({width:390,height:844});await login(page,'local-admin');await page.goto(origin+'/admin/users');await expect(page.getByRole('button',{name:'Create account',exact:true})).toBeVisible();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth)).toBeLessThanOrEqual(1);
  await page.screenshot({path:info.outputPath('mobile-accounts.png')});expect(serverOutput).not.toContain('permission denied');
});
