import { randomBytes, randomUUID } from "node:crypto";
import argon2 from "argon2";
import { afterAll, afterEach, beforeAll, beforeEach, expect, it } from "vitest";
import { ft3CatalogueCompanyIds } from "@rufdiamond/contracts";
import { buildApp } from "../src/app.js";
import { createDatabase } from "../src/db/client.js";
import { grantLocalRuntime } from "../src/db/local-runtime-grants.js";
import { closePostgresPool, startPostgres } from "./helpers/postgres.js";

const origin = "https://portal.example.test";
const passwordOptions = { type: argon2.argon2id, memoryCost: 2048, timeCost: 2, parallelism: 1 } as const;
const revision = "a".repeat(64);
let pg: Awaited<ReturnType<typeof startPostgres>>;
let database: ReturnType<typeof createDatabase>;
let app: Awaited<ReturnType<typeof buildApp>>;
let ids: Record<string, string>;
let purchaser: Record<string, string>;
let technician: Record<string, string>;
let outsider: Record<string, string>;
const address = { firstName: "Test", lastName: "Purchaser", company: "Test", address: "1 Test Road", city: "Sudbury", province: "Ontario", country: "Canada", postalCode: "P3E 1A1", email: "test@example.test", phone: "7055550100" };
const payload = () => ({
  orderType: "regular", scheduleDate: null, poNumber: "E2E-TEST", vin: "TEST-FT3", shippingMethod: "purolator-ground",
  shipping: address, billing: address, instructions: "Disposable integration test", currency: "CAD",
  lines: [{ kind: "supplier-catalogue", cataloguePartId: ids.priced, catalogueRevision: revision, qty: 2 }],
});
const submit = (body = payload(), headers = purchaser, key = randomUUID()) => app.inject({
  method: "POST", url: "/api/v1/commerce-orders", headers: { ...headers, "idempotency-key": key }, payload: body,
});

beforeAll(async () => {
  pg = await startPostgres(); await pg.migrate();
  const role = `ruf_local_${randomBytes(8).toString("hex")}`;
  const dbPassword = randomBytes(32).toString("hex");
  await pg.pool.query(`create role "${role}" login password '${dbPassword}' nosuperuser nocreatedb nocreaterole noreplication nobypassrls`);
  await grantLocalRuntime(pg.pool, role);
  const url = new URL(pg.connectionString); url.username = role; url.password = dbPassword;
  database = createDatabase(url.href);
}, 120000);

beforeEach(async () => {
  await pg.pool.query("truncate company,ordering_catalogue_part,audit_log,outbox_event cascade");
  ids = Object.fromEntries(["priced", "unpriced", "purchaser", "technician", "outsider", "foreignCompany"].map(key => [key, randomUUID()]));
  await pg.pool.query("insert into company(id,name,type,discount_rate,technician_pricing_visible) values($1,'FT3 test company','customer',0.1,false),($2,'Foreign company','customer',0,false)", [ft3CatalogueCompanyIds[0], ids.foreignCompany]);
  const password = "Disposable Test Password";
  const hash = await argon2.hash(password, passwordOptions);
  for (const key of ["purchaser", "technician", "outsider"]) {
    const role = key === "technician" ? "technician" : "purchaser";
    await pg.pool.query("insert into app_user(id,company_id,name,login_id,email,password_hash,role_id) select $1,$2,$3,$4,$4,$5,id from role where key=$6",
      [ids[key], key === "outsider" ? ids.foreignCompany : ft3CatalogueCompanyIds[0], key, `${key}@example.test`, hash, role]);
    await pg.pool.query("insert into user_scope(user_id,brand_mode,account_mode,fleet_mode,environment) values($1,'all','own','all','published')", [ids[key]]);
    for (const capability of ["catalog.figure.view", "parts.record.view", "orders.own.view", "orders.list.build", ...(key === "technician" ? [] : ["orders.submit", "pricing.cost.view"])]) {
      await pg.pool.query("insert into user_capability(user_id,capability_key) values($1,$2) on conflict do nothing", [ids[key], capability]);
    }
  }
  await pg.pool.query("insert into ordering_catalogue_part(id,source_key,catalogue_key,source_revision,part_number,description,list_price) values($1,'prt-priced','ft3-wagon',$3,'82-00127','Pintle hook',645.86),($2,'prt-unpriced','ft3-wagon',$3,'12-210000-12','Nut',0)", [ids.priced, ids.unpriced, revision]);
  app = await buildApp({ config: { nodeEnv: "test", port: 0, databaseUrl: database.pool.options.connectionString!, webOrigin: origin,
    sessionSecret: "ft3-disposable-session-secret-32-characters", allowInsecureLoopbackCookie: false,
    deliveryEncryption: { activeKeyId: "test", keys: { test: randomBytes(32).toString("base64") } } },
    dependencies: { database, passwordOptions } });
  async function login(name: string) {
    const res = await app.inject({ method: "POST", url: "/api/v1/auth/sign-in", headers: { origin }, payload: { loginId: `${name}@example.test`, password } });
    expect(res.statusCode, res.body).toBe(200);
    return { origin, cookie: String(res.headers["set-cookie"]).split(";")[0], "x-csrf-token": res.json().csrfToken };
  }
  purchaser = await login("purchaser"); technician = await login("technician"); outsider = await login("outsider");
});
afterEach(async () => { await app?.close(); });
afterAll(async () => { if (database) await closePostgresPool(database.pool); await pg?.stop(); }, 30000);

it("uses database pricing and company discount, stores immutable snapshots and reloads the order", async () => {
  const response = await submit(); expect(response.statusCode, response.body).toBe(201);
  const [line] = (await pg.pool.query("select * from commerce_order_line where order_id=$1", [response.json().id])).rows;
  expect(line).toMatchObject({ part_number: "82-00127", qty: 2, unit_price: "581.2740", line_total: "1162.55",
    price_source: "supplier-catalogue", catalogue_revision: revision, list_price_snapshot: "645.8600", discount_rate_snapshot: "0.100000" });
  await pg.pool.query("update ordering_catalogue_part set list_price=700 where id=$1", [ids.priced]);
  const stored = await app.inject({ method: "GET", url: "/api/v1/commerce-orders/mine", headers: purchaser });
  expect(stored.statusCode, stored.body).toBe(200);
  expect(stored.json().items[0]).toMatchObject({ id: response.json().id, netTotal: "1162.55", lines: [{ partNumber: "82-00127", qty: 2, unitPrice: "581.2740" }] });
});

it("replays a retried submission exactly once and scopes saved orders by company", async () => {
  const key = randomUUID();
  const [first, second] = await Promise.all([submit(payload(), purchaser, key), submit(payload(), purchaser, key)]);
  expect(first.statusCode, first.body).toBe(201); expect(second.statusCode, second.body).toBe(201);
  expect(first.json()).toEqual(second.json());
  expect((await pg.pool.query("select count(*)::int n from commerce_order")).rows[0].n).toBe(1);
  expect((await app.inject({ method: "GET", url: "/api/v1/commerce-orders/mine", headers: outsider })).json().items).toEqual([]);
});

it("requires authentication, purchaser authority and the existing catalogue company scope", async () => {
  expect((await app.inject({ method: "GET", url: "/api/v1/commerce-catalogue/ft3-wagon" })).statusCode).toBe(401);
  expect((await submit(payload(), technician)).statusCode).toBe(403);
  expect((await submit(payload(), outsider)).statusCode).toBe(404);
  const prices = await app.inject({ method: "GET", url: "/api/v1/commerce-catalogue/ft3-wagon", headers: technician });
  expect(prices.statusCode, prices.body).toBe(200);
  expect(prices.body).not.toContain('"listPrice"');
});

it.each(["zero", "stale", "currency", "forged-price", "csrf"])("rejects %s without creating an order", async kind => {
  const input = payload();
  if (kind === "zero") input.lines[0].cataloguePartId = ids.unpriced;
  if (kind === "stale") input.lines[0].catalogueRevision = "b".repeat(64);
  if (kind === "currency") input.currency = "USD";
  if (kind === "forged-price") Object.assign(input.lines[0], { unitPrice: "0.01" });
  const result = await submit(input, kind === "csrf" ? { ...purchaser, "x-csrf-token": "wrong" } : purchaser);
  expect(result.statusCode, result.body).toBe(({zero:422,stale:409,currency:422,"forged-price":400,csrf:403})[kind]);
  expect((await pg.pool.query("select count(*)::int n from commerce_order")).rows[0].n).toBe(0);
});
