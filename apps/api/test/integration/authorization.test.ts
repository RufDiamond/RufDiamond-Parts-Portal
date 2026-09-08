import { randomBytes, randomUUID } from "node:crypto";

import argon2 from "argon2";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { buildApp } from "../../src/app.js";
import { createDatabase } from "../../src/db/client.js";
import { seedPilotRoleReadCapabilities } from "../../src/db/seeds/pilot-roles.js";
import {
  loadAuthorization,
  loadBehalfOfAuthorization,
  requireBehalfOf,
  requireUserManagement,
} from "../../src/modules/authorization/policy.js";
import { scopeSql } from "../../src/modules/authorization/scope-sql.js";
import { productLine } from "../../src/db/schema/catalog.js";
import { startPostgres } from "../helpers/postgres.js";

const passwordOptions = { type: argon2.argon2id, memoryCost: 2_048, timeCost: 2, parallelism: 1 } as const;
const config = {
  nodeEnv: "test" as const,
  port: 0,
  databaseUrl: "postgres://unused",
  sessionSecret: "authorization-test-secret-long-enough",
  webOrigin: "https://portal.example.test",
  allowInsecureLoopbackCookie: false,
  deliveryEncryption: { activeKeyId: "test-key", keys: { "test-key": randomBytes(32).toString("base64") } },
  s3: {
    endpoint: "http://localhost:9000", region: "us-east-1", bucket: "test",
    accessKeyId: "test", secretAccessKey: "test",
  },
};

describe("database authorization policy", () => {
  let postgres: Awaited<ReturnType<typeof startPostgres>>;
  let database: ReturnType<typeof createDatabase>;
  const apps: Array<Awaited<ReturnType<typeof buildApp>>> = [];
  const ids = {
    fatTruck: randomUUID(), ironHorse: randomUUID(),
    fatModel: randomUUID(), ironModel: randomUUID(),
    fatVariant: randomUUID(), ironVariant: randomUUID(),
    customer: randomUUID(), target: randomUUID(), dealer: randomUUID(), internal: randomUUID(),
    customerUser: randomUUID(), technicianUser: randomUUID(), dealerUser: randomUUID(),
    dealerTechnicianUser: randomUUID(), internalUser: randomUUID(),
  };

  beforeAll(async () => {
    postgres = await startPostgres();
    await postgres.migrate();
    database = createDatabase(postgres.connectionString);
    const q = (text: string, values?: unknown[]) => postgres.pool.query(text, values);

    await q("insert into product_line(id,name,normalized_name) values($1,'Fat Truck','fat truck'),($2,'IronHorse','ironhorse')", [ids.fatTruck, ids.ironHorse]);
    await q("insert into model(id,product_line_id,name) values($1,$2,'FT3'),($3,$4,'IH6')", [ids.fatModel, ids.fatTruck, ids.ironModel, ids.ironHorse]);
    await q("insert into variant(id,model_id,label) values($1,$2,'Wagon'),($3,$4,'Six')", [ids.fatVariant, ids.fatModel, ids.ironVariant, ids.ironModel]);
    await q("insert into company(id,name,type,discount_rate,technician_pricing_visible) values($1,'Fat Customer','customer',0.12,false),($2,'Target Customer','customer',0.20,true),($3,'Dealer','dealer',0.05,true),($4,'RUFDiamond','internal',0,true)", [ids.customer, ids.target, ids.dealer, ids.internal]);
    await q("insert into company_product_line(company_id,product_line_id) values($1,$2),($3,$4),($5,$2)", [ids.customer, ids.fatTruck, ids.target, ids.ironHorse, ids.dealer]);
    await q("insert into company_machine(company_id,variant_id,unit_reference) values($1,$2,'FT-CUSTOMER'),($3,$4,'IH-TARGET'),($5,$2,'FT-DEALER')", [ids.customer, ids.fatVariant, ids.target, ids.ironVariant, ids.dealer]);
    await q("insert into role(key,name) values('internal_viewer','Internal viewer')");
    await q("insert into price_tier(id,key,name,discount_rate) values($1,'target-contract','Target contract',0.30),($2,'user-contract','User contract',0.40)", [randomUUID(), randomUUID()]);
    const tiers = (await q("select id,key from price_tier where key in ('target-contract','user-contract')")).rows;
    const targetTier = tiers.find(row => row.key === "target-contract").id;
    const userTier = tiers.find(row => row.key === "user-contract").id;
    await q("update company set price_tier_id=$2 where id=$1", [ids.target, targetTier]);

    for (const [userId, companyId, roleKey, tierId] of [
      [ids.customerUser, ids.customer, "purchaser", userTier],
      [ids.technicianUser, ids.customer, "technician", null],
      [ids.dealerUser, ids.dealer, "purchaser", null],
      [ids.dealerTechnicianUser, ids.dealer, "technician", null],
      [ids.internalUser, ids.internal, "internal_viewer", null],
    ]) {
      await q("insert into app_user(id,company_id,name,login_id,email,password_hash,role_id) select $1,$2,$3,$4,$4,'hash',id from role where key=$5", [userId, companyId, userId, `${userId}@example.test`, roleKey]);
      await q("insert into user_scope(user_id,brand_mode,account_mode,fleet_mode,environment,price_tier_id) values($1,$2,$3,$4,$5,$6)", [
        userId,
        companyId === ids.internal ? "all" : companyId === ids.customer ? "subset" : "all",
        companyId === ids.internal ? "all" : companyId === ids.dealer ? "all" : "own",
        companyId === ids.internal ? "all" : companyId === ids.customer ? "subset" : "all",
        companyId === ids.internal ? "published_and_draft" : "published",
        tierId,
      ]);
    }
    await q("insert into user_product_line_scope(user_id,product_line_id) values($1,$2),($1,$3)", [ids.customerUser, ids.fatTruck, ids.ironHorse]);
    await q("insert into user_fleet_scope(user_id,variant_id) values($1,$2),($1,$3)", [ids.customerUser, ids.fatVariant, ids.ironVariant]);
    await q("insert into dealer_customer_scope(dealer_company_id,customer_company_id) values($1,$2)", [ids.dealer, ids.target]);
    await q("insert into user_capability(user_id,capability_key) values($1,'orders.behalf'),($2,'orders.behalf'),($3,'pricing.cost.view'),($3,'orders.behalf'),($4,'audit.log.view')", [ids.dealerUser, ids.dealerTechnicianUser, ids.internalUser, ids.customerUser]);
  }, 120_000);

  afterAll(async () => {
    await Promise.all(apps.splice(0).map(app => app.close()));
    await database?.close();
    await postgres?.stop();
  }, 30_000);

  async function load(userId: string) {
    return database.db.transaction(tx => loadAuthorization(tx, userId));
  }

  it("denies an active user when the mandatory scope row is missing", async () => {
    const unscoped = randomUUID();
    await postgres.pool.query("insert into app_user(id,company_id,name,login_id,email,password_hash,role_id) select $1,$2,'No Scope',$3,$3,'hash',id from role where key='purchaser'", [unscoped, ids.customer, `${unscoped}@example.test`]);
    await expect(load(unscoped)).rejects.toMatchObject({ code: "FORBIDDEN", status: 403 });
  });

  it("intersects user subsets with company brands and fleet", async () => {
    const authorization = await load(ids.customerUser);
    expect(authorization.brandIds).toEqual([ids.fatTruck]);
    expect(authorization.variantIds).toEqual([ids.fatVariant]);
    expect(authorization.accountIds).toEqual([ids.customer]);

    const rows = await database.db.select({ id: productLine.id }).from(productLine)
      .where(scopeSql(productLine.id, authorization.brandIds));
    expect(rows).toEqual([{ id: ids.fatTruck }]);
    const denied = await database.db.select({ id: productLine.id }).from(productLine)
      .where(scopeSql(productLine.id, []));
    expect(denied).toEqual([]);
  });

  it("emits literal all only for explicit internal scopes", async () => {
    const external = await load(ids.dealerUser);
    expect(external.brandIds).toEqual([ids.fatTruck]);
    expect(external.variantIds).toEqual([ids.fatVariant]);
    expect(external.accountIds).toEqual([ids.dealer, ids.target].sort());

    const internal = await load(ids.internalUser);
    expect(internal.brandIds).toBe("all");
    expect(internal.variantIds).toBe("all");
    expect(internal.accountIds).toBe("all");
  });

  it("does not treat a non-dealer company as authority for a malformed dealer pair", async () => {
    await postgres.pool.query("update user_scope set account_mode='all' where user_id=$1", [ids.customerUser]);
    await postgres.pool.query("insert into dealer_customer_scope(dealer_company_id,customer_company_id) values($1,$2)", [ids.customer, ids.target]);
    try {
      expect((await load(ids.customerUser)).accountIds).toEqual([ids.customer]);
    } finally {
      await postgres.pool.query("delete from dealer_customer_scope where dealer_company_id=$1 and customer_company_id=$2", [ids.customer, ids.target]);
      await postgres.pool.query("update user_scope set account_mode='own' where user_id=$1", [ids.customerUser]);
    }
  });

  it("filters unknown grants and always removes the publication blocker override", async () => {
    await postgres.pool.query("insert into capability(key,description) values('future.unknown','Unknown')");
    await postgres.pool.query("insert into user_capability(user_id,capability_key) values($1,'future.unknown'),($1,'publish.block.override')", [ids.customerUser]);
    const authorization = await load(ids.customerUser);
    expect(authorization.capabilities.has("future.unknown")).toBe(false);
    expect(authorization.capabilities.has("publish.block.override")).toBe(false);
  });

  it("uses capability semantics for technician price visibility and tier precedence", async () => {
    const purchaser = await load(ids.customerUser);
    expect(purchaser.canViewPrices).toBe(true);
    expect(purchaser.discountRate).toBe("0.400000");
    expect(purchaser.priceTierId).not.toBeNull();

    const technician = await load(ids.technicianUser);
    expect(technician.canViewPrices).toBe(false);
    expect(technician.discountRate).toBe("0.120000");

    const internalViewer = await load(ids.internalUser);
    expect(internalViewer.capabilities.has("orders.list.build")).toBe(false);
    expect(internalViewer.capabilities.has("orders.submit")).toBe(false);
    expect(internalViewer.canViewPrices).toBe(true);
  });

  it("requires named dealer account, brand, and fleet intersections and uses target pricing", async () => {
    const dealer = await load(ids.dealerUser);
    expect(() => requireBehalfOf(dealer, { companyId: ids.target, brandId: ids.ironHorse, variantId: ids.ironVariant }))
      .toThrowError(expect.objectContaining({ code: "FORBIDDEN" }));

    await postgres.pool.query("insert into company_product_line(company_id,product_line_id) values($1,$2)", [ids.dealer, ids.ironHorse]);
    await postgres.pool.query("insert into company_machine(company_id,variant_id,unit_reference) values($1,$2,'IH-DEALER')", [ids.dealer, ids.ironVariant]);
    const expandedDealer = await load(ids.dealerUser);
    expect(() => requireBehalfOf(expandedDealer, { companyId: ids.target, brandId: ids.ironHorse, variantId: ids.ironVariant })).not.toThrow();
    await expect(database.db.transaction(tx => loadBehalfOfAuthorization(tx, expandedDealer, {
      companyId: ids.target, brandId: ids.ironHorse, variantId: ids.ironVariant,
    }))).resolves.toMatchObject({ companyId: ids.target, discountRate: "0.300000" });
    await expect(database.db.transaction(tx => loadBehalfOfAuthorization(tx, expandedDealer, {
      companyId: randomUUID(), brandId: ids.ironHorse, variantId: ids.ironVariant,
    }))).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("requires a named actor-target pair inside the behalf-of transaction even for internal all scope", async () => {
    const internal = await load(ids.internalUser);
    const target = { companyId: ids.target, brandId: ids.ironHorse, variantId: ids.ironVariant };
    expect(() => requireBehalfOf(internal, target)).not.toThrow();
    await expect(database.db.transaction(tx => loadBehalfOfAuthorization(tx, internal, target)))
      .rejects.toMatchObject({ code: "FORBIDDEN" });

    await postgres.pool.query("insert into dealer_customer_scope(dealer_company_id,customer_company_id) values($1,$2)", [ids.internal, ids.target]);
    try {
      await expect(database.db.transaction(tx => loadBehalfOfAuthorization(tx, internal, target)))
        .resolves.toMatchObject({ companyId: ids.target });
    } finally {
      await postgres.pool.query("delete from dealer_customer_scope where dealer_company_id=$1 and customer_company_id=$2", [ids.internal, ids.target]);
    }
  });

  it("recomputes technician price visibility from the target company policy in both directions", async () => {
    const target = { companyId: ids.target, brandId: ids.ironHorse, variantId: ids.ironVariant };
    await postgres.pool.query("insert into company_product_line(company_id,product_line_id) values($1,$2) on conflict do nothing", [ids.dealer, ids.ironHorse]);
    await postgres.pool.query("insert into company_machine(company_id,variant_id,unit_reference) values($1,$2,'IH-DEALER-TECH') on conflict do nothing", [ids.dealer, ids.ironVariant]);

    const initiallyVisible = await load(ids.dealerTechnicianUser);
    expect(initiallyVisible.canViewPrices).toBe(true);
    await postgres.pool.query("update company set technician_pricing_visible=false where id=$1", [ids.target]);
    await expect(database.db.transaction(tx => loadBehalfOfAuthorization(tx, initiallyVisible, target)))
      .resolves.toMatchObject({ canViewPrices: false });

    await postgres.pool.query("update company set technician_pricing_visible=false where id=$1", [ids.dealer]);
    await postgres.pool.query("update company set technician_pricing_visible=true where id=$1", [ids.target]);
    const hiddenAtDealer = await load(ids.dealerTechnicianUser);
    expect(hiddenAtDealer.canViewPrices).toBe(false);
    await expect(database.db.transaction(tx => loadBehalfOfAuthorization(tx, hiddenAtDealer, target)))
      .resolves.toMatchObject({ canViewPrices: true });
    await postgres.pool.query("update company set technician_pricing_visible=true where id=$1", [ids.dealer]);
  });

  it("denies own-user role escalation under own-company management", async () => {
    const ctx = { ...(await load(ids.customerUser)), capabilities: new Set(["users.own.manage"]) };
    expect(() => requireUserManagement(ctx, { userId: ids.customerUser, companyId: ids.customer, changesRole: true }))
      .toThrowError(expect.objectContaining({ code: "FORBIDDEN" }));
  });

  it("changes the opaque scope version for every authorization dependency family", async () => {
    let previous = (await load(ids.customerUser)).scopeVersion;
    const mutations: Array<[string, ...unknown[]]> = [
      ["update company set technician_pricing_visible=true,discount_rate=0.13 where id=$1", ids.customer],
      ["update role_capability set version=version+1 where role_id=(select role_id from app_user where id=$1) and capability_key='orders.submit'", ids.customerUser],
      ["update user_capability set version=version+1 where user_id=$1 and capability_key='audit.log.view'", ids.customerUser],
      ["update user_scope set environment='published_and_draft' where user_id=$1", ids.customerUser],
      ["update company_product_line set version=version+1 where company_id=$1", ids.customer],
      ["update company_machine set version=version+1 where company_id=$1", ids.customer],
      ["update user_product_line_scope set version=version+1 where user_id=$1 and product_line_id=$2", ids.customerUser, ids.fatTruck],
      ["update user_fleet_scope set version=version+1 where user_id=$1 and variant_id=$2", ids.customerUser, ids.fatVariant],
      ["insert into user_account_scope(user_id,company_id) values($1,$2)", ids.customerUser, ids.target],
    ];
    for (const [text, ...values] of mutations) {
      await postgres.pool.query(text, values);
      const current = (await load(ids.customerUser)).scopeVersion;
      expect(current).not.toBe(previous);
      previous = current;
    }
    await postgres.pool.query("update company set technician_pricing_visible=false where id=$1", [ids.customer]);

    previous = (await load(ids.dealerUser)).scopeVersion;
    for (const [text, ...values] of [
      ["update dealer_customer_scope set version=version+1 where dealer_company_id=$1 and customer_company_id=$2", ids.dealer, ids.target],
      ["update company set discount_rate=0.21 where id=$1", ids.target],
      ["update price_tier set discount_rate=0.31,version=version+1 where id=(select price_tier_id from company where id=$1)", ids.target],
      ["delete from company_product_line where company_id=$1 and product_line_id=$2", ids.target, ids.ironHorse],
      ["insert into company_product_line(company_id,product_line_id) values($1,$2)", ids.target, ids.ironHorse],
      ["delete from company_machine where company_id=$1 and variant_id=$2", ids.target, ids.ironVariant],
      ["insert into company_machine(company_id,variant_id,unit_reference) values($1,$2,'IH-TARGET-RESTORED')", ids.target, ids.ironVariant],
    ] as Array<[string, ...unknown[]]>) {
      await postgres.pool.query(text, values);
      const current = (await load(ids.dealerUser)).scopeVersion;
      expect(current).not.toBe(previous);
      previous = current;
    }
  });

  it("uses the real resolver for existing sessions and never serializes internal pricing policy", async () => {
    const password = "correct horse battery staple";
    const passwordHash = await argon2.hash(password, passwordOptions);
    await postgres.pool.query("update app_user set password_hash=$2,login_id='authorized@example.test',email='authorized@example.test' where id=$1", [ids.technicianUser, passwordHash]);
    const app = await buildApp({ config, dependencies: { database, passwordOptions } });
    apps.push(app);
    expect((await postgres.pool.query("select count(*)::int count from role_capability rc join role r on r.id=rc.role_id where r.key='technician' and rc.capability_key='catalog.model.view'")).rows[0].count).toBe(0);
    const login = await app.inject({ method: "POST", url: "/api/v1/auth/sign-in", headers: { origin: config.webOrigin }, payload: { loginId: "authorized@example.test", password } });
    const cookie = String(login.headers["set-cookie"]).split(";")[0];
    const first = await app.inject({ method: "GET", url: "/api/v1/me", headers: { cookie } });
    expect(first.statusCode).toBe(200);
    expect(first.json().scopes.scopeVersion).toMatch(/^[a-f0-9]{64}$/);
    expect(first.json().scopes.canViewPrices).toBe(false);
    expect(first.json()).not.toHaveProperty("discountRate");
    expect(first.body).not.toMatch(/0\.120000|priceTierId|discountRate/);

    await postgres.pool.query("update user_scope set brand_mode='company' where user_id=$1", [ids.technicianUser]);
    const second = await app.inject({ method: "GET", url: "/api/v1/me", headers: { cookie } });
    expect(second.json().scopes.scopeVersion).not.toBe(first.json().scopes.scopeVersion);
  });

  it("uses a user-tier override in a real database-resolved priced session", async () => {
    const password = "user tier password value";
    const passwordHash = await argon2.hash(password, passwordOptions);
    await postgres.pool.query("update app_user set password_hash=$2,login_id='tiered@example.test',email='tiered@example.test' where id=$1", [ids.customerUser, passwordHash]);
    const app = await buildApp({ config, dependencies: { database, passwordOptions } });
    apps.push(app);
    const login = await app.inject({ method: "POST", url: "/api/v1/auth/sign-in", headers: { origin: config.webOrigin }, payload: { loginId: "tiered@example.test", password } });
    const response = await app.inject({
      method: "GET", url: "/api/v1/me",
      headers: { cookie: String(login.headers["set-cookie"]).split(";")[0] },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().scopes).toMatchObject({ priceTier: "user-contract", canViewPrices: true });
    expect(response.json().company.discountRate).toBe("0.400000");
  });

  it("adds only controlled customer read grants and is idempotent", async () => {
    await postgres.pool.query("delete from role_capability where role_id=(select id from role where key='purchaser') and capability_key='orders.submit'");
    await database.db.transaction(seedPilotRoleReadCapabilities);
    await database.db.transaction(seedPilotRoleReadCapabilities);
    const grants = (await postgres.pool.query("select r.key as role_key,rc.capability_key from role_capability rc join role r on r.id=rc.role_id where r.key in ('purchaser','technician') order by r.key,rc.capability_key")).rows;
    for (const roleKey of ["purchaser", "technician"]) {
      for (const capabilityKey of ["catalog.model.view", "catalog.figure.view", "parts.record.view"]) {
        expect(grants).toContainEqual({ role_key: roleKey, capability_key: capabilityKey });
      }
    }
    expect(grants).not.toContainEqual({ role_key: "purchaser", capability_key: "orders.submit" });
    expect(grants).not.toContainEqual({ role_key: "purchaser", capability_key: "publish.execute" });
    const resolved = await load(ids.customerUser);
    for (const capabilityKey of ["catalog.model.view", "catalog.figure.view", "parts.record.view"]) {
      expect(resolved.capabilities.has(capabilityKey)).toBe(true);
    }
  });
});
