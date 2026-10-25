import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createDatabase } from "../../src/db/client.js";
import { createQuoteNotificationResolver } from "../../src/modules/quotes/notification-recipient.js";
import { createQuoteNotifiedDelivery } from "../../src/modules/quotes/email-delivery.js";
import { startPostgres } from "../helpers/postgres.js";

describe("customer quote email recipient authorization", () => {
  let postgres: Awaited<ReturnType<typeof startPostgres>>;
  let database: ReturnType<typeof createDatabase>;
  beforeAll(async () => {
    postgres = await startPostgres();
    await postgres.migrate();
    database = createDatabase(postgres.connectionString);
  }, 120000);
  afterAll(async () => { await database?.close(); await postgres?.stop(); }, 30000);

  async function fixture() {
    const companyId = randomUUID(), userId = randomUUID(), otherId = randomUUID(), staffId = randomUUID();
    const foreignCompanyId = randomUUID(), noticeId = randomUUID(), lineId = randomUUID();
    const quoteNo = `RD-${randomUUID()}`;
    await postgres.pool.query("insert into company(id,name) values($1,'Dealer'),($2,'Foreign')", [companyId, foreignCompanyId]);
    for (const [id, company, email] of [[userId,companyId,`requester-${userId}@example.test`], [otherId,companyId,`other-${otherId}@example.test`], [staffId,foreignCompanyId,`staff-${staffId}@example.test`]]) {
      await postgres.pool.query("insert into app_user(id,company_id,name,login_id,email,password_hash,role_id) select $1,$2,'User',$3,$3,'not-a-login-hash',id from role where key='purchaser'", [id,company,email]);
      await postgres.pool.query("insert into user_scope(user_id) values($1)", [id]);
    }
    await postgres.pool.query("insert into quote_line(id,company_id,submitted_by_user_id,quote_no,request_date,product_line,customer_name,user_name,requested,notify_customer) values($1,$2,$3,$4,current_date,'Fat Truck','Dealer','Requester',$5,true)", [lineId,companyId,userId,quoteNo,JSON.stringify({partNumber:'A',description:'Part',qty:1})]);
    const factoryLineId = randomUUID();
    await postgres.pool.query("insert into quote_line(id,company_id,submitted_by_user_id,quote_no,request_date,product_line,customer_name,user_name,requested,notify_customer) values($1,$2,$3,$4,current_date,'Fat Truck','Dealer','Staff',null,true)", [factoryLineId,companyId,staffId,quoteNo]);
    await postgres.pool.query("insert into quote_notice(id,company_id,customer_name,quote_no,line_ids) values($1,$2,'Dealer',$3,$4)", [noticeId,companyId,quoteNo,[factoryLineId]]);
    const event = {
      eventId: randomUUID(), eventType: "quote.notified.email", aggregateType: "quote_notice",
      aggregateId: noticeId, payloadVersion: 1, providerIdempotencyKey: randomUUID(),
      payload: { noticeId: randomUUID(), companyId: foreignCompanyId, quoteNo: "FORGED", authorizedRecipients: ["attacker@example.test"] },
    };
    return { companyId, userId, staffId, noticeId, lineId, quoteNo, event };
  }

  it("requires an explicit recipient policy before any database-backed customer mail", async () => {
    const f = await fixture();
    await expect(createQuoteNotificationResolver(database.db)(f.event)).rejects.toThrow("QUOTE_NOTIFY_POLICY_UNCONFIGURED");
  });

  it("resolves the active original requester from the persisted notice even for factory-only added lines", async () => {
    const f = await fixture();
    const result = await createQuoteNotificationResolver(database.db, "original-requester")(f.event);
    expect(result).toEqual({ to: [`requester-${f.userId}@example.test`], quoteNo: f.quoteNo, customerName: "Dealer" });
    // Neither another company member, a factory-line author, nor payload recipients are used.
  });

  it("uses the resolved quote identity and sends no payload-controlled addresses or private fields", async () => {
    const f = await fixture();
    const delivered: Array<{to:string[];body:string;subject:string}> = [];
    const delivery = createQuoteNotifiedDelivery({ async deliver(mail) { delivered.push(mail); } }, createQuoteNotificationResolver(database.db, "original-requester"));
    const previous = process.env.QUOTE_EMAIL_SENDING;
    process.env.QUOTE_EMAIL_SENDING = "enabled";
    try { await delivery(f.event); } finally {
      if (previous === undefined) delete process.env.QUOTE_EMAIL_SENDING;
      else process.env.QUOTE_EMAIL_SENDING = previous;
    }
    expect(delivered).toHaveLength(1);
    expect(delivered[0].to).toEqual([`requester-${f.userId}@example.test`]);
    expect(delivered[0].subject).toBe(`Your quote ${f.quoteNo} is ready`);
    expect(delivered[0].body).not.toMatch(/FORGED|attacker|factoryPrice|Factory Price/);
  });

  it("withholds email when the requester or company is disabled, or customer access is revoked", async () => {
    const f = await fixture();
    const resolve = createQuoteNotificationResolver(database.db, "original-requester");
    await postgres.pool.query("update app_user set status='disabled',version=version+1 where id=$1", [f.userId]);
    await expect(resolve(f.event)).rejects.toThrow("QUOTE_NOTIFY_RECIPIENTS_UNRESOLVED");
    await postgres.pool.query("update app_user set status='active',version=version+1 where id=$1", [f.userId]);
    await postgres.pool.query("update company set status='suspended',version=version+1 where id=$1", [f.companyId]);
    await expect(resolve(f.event)).rejects.toThrow("QUOTE_NOTIFY_RECIPIENTS_UNRESOLVED");
    await postgres.pool.query("update company set status='active',version=version+1 where id=$1", [f.companyId]);
    const emptyRoleId = randomUUID();
    await postgres.pool.query("insert into role(id,key,name) values($1,$2,'No capabilities')", [emptyRoleId,`none-${emptyRoleId}`]);
    await postgres.pool.query("update app_user set role_id=$2,version=version+1 where id=$1", [f.userId,emptyRoleId]);
    await expect(resolve(f.event)).rejects.toThrow("QUOTE_NOTIFY_RECIPIENTS_UNRESOLVED");
  });

  it("rejects events that do not identify an existing notice", async () => {
    const f = await fixture();
    const resolve = createQuoteNotificationResolver(database.db, "original-requester");
    await expect(resolve({ ...f.event, aggregateId: randomUUID() })).rejects.toThrow("QUOTE_NOTICE_NOT_FOUND");
    await expect(resolve({ ...f.event, aggregateType: "quote_line" })).rejects.toThrow("QUOTE_NOTICE_EVENT_INVALID");
  });
});
