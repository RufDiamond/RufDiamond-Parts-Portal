import { and, desc, eq, inArray, sql } from "drizzle-orm";
import type {
  AddFactoryQuoteLineInput,
  NotifyQuoteInput,
  PatchQuoteLineInput,
  QuoteLine,
  QuoteNotice,
  SubmitCommerceOrderInput,
  SubmitCommerceOrderResult,
  SubmitQuoteInput,
  SubmitQuoteResult,
  PatchCompanyDiscountInput,
  CompanyDiscountResult,
} from "@rufdiamond/contracts";
import type { Database, Transaction } from "../../db/client.js";
import {
  appUser,
  commerceOrder,
  commerceOrderLine,
  company,
  quoteLine,
  quoteNotice,
} from "../../db/schema/index.js";
import { AppError } from "../../plugins/error-handler.js";
import { writeAuditLog, type MutationContext } from "../audit/repository.js";
import { loadAuthorization, requireCapability } from "../authorization/policy.js";
import { mappingTransaction } from "../diagram-mapping/repository.js";
import { canonicalJsonHash, withIdempotency } from "../outbox/idempotency.js";
import { enqueueOutboxEvent } from "../outbox/repository.js";

export type QuoteActor = { userId: string; requestId: string };

function ontarioToday(now: Date): string {
  return now.toLocaleDateString("en-CA", { timeZone: "America/Toronto" });
}

function validateKey(key: string) {
  if (!key?.trim() || key.length > 255) {
    throw new AppError("INVALID_IDEMPOTENCY_KEY", 400, "Supply an idempotency key of 1 to 255 characters.");
  }
}

function mapLine(row: typeof quoteLine.$inferSelect): QuoteLine {
  return {
    id: row.id,
    companyId: row.companyId,
    productLine: row.productLine,
    quoteNo: row.quoteNo,
    requestDate: String(row.requestDate),
    customer: row.customerName,
    user: row.userName,
    requested: row.requested,
    catalogPartId: row.catalogPartId,
    responseDate: row.responseDate ? String(row.responseDate) : null,
    available: row.available ?? null,
    estAvailability: row.estAvailability ? String(row.estAvailability) : null,
    newPartNumber: row.newPartNumber,
    newDescription: row.newDescription,
    newQty: row.newQty,
    factoryPrice: row.factoryPrice,
    customerPrice: row.customerPrice,
    comments: row.comments,
    notifyCustomer: row.notifyCustomer,
    model: row.model,
    serialNumber: row.serialNumber,
    system: row.system,
    figure: row.figure,
    assemblyName: row.assemblyName,
    version: row.version,
  };
}

function addDays(isoDate: string, days: number): string {
  const date = new Date(`${isoDate}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function toCustomer(row: QuoteLine, today: string) {
  const priceValidUntil = addDays(row.requestDate, 30);
  const expired = today > priceValidUntil;
  const released = row.notifyCustomer;
  const partNumber = released
    ? (row.newPartNumber ?? row.requested?.partNumber ?? null)
    : (row.requested?.partNumber ?? null);
  const description = released
    ? (row.newDescription ?? row.requested?.description ?? null)
    : (row.requested?.description ?? null);
  const qty = released
    ? (row.newQty ?? row.requested?.qty ?? null)
    : (row.requested?.qty ?? null);
  const unit = released ? row.customerPrice : null;
  const total =
    released && unit && qty != null
      ? (Number(unit) * qty).toFixed(2)
      : null;
  return {
    id: row.id,
    quoteNo: row.quoteNo,
    requestDate: row.requestDate,
    customer: row.customer,
    user: row.user,
    partNumber,
    description,
    qty,
    response: released
      ? {
          available: row.available,
          estAvailability: row.estAvailability,
          newPartNumber: row.newPartNumber,
          newDescription: row.newDescription,
          newQty: row.newQty,
          unitPrice: unit,
          totalPrice: total,
          comments: row.comments,
        }
      : null,
    priceValidUntil,
    expired,
  };
}

async function nextReference(tx: Transaction, sequence: "quote_reference_seq" | "commerce_order_reference_seq"): Promise<string> {
  const result = sequence === "quote_reference_seq"
    ? await tx.execute<{ n: string }>(sql`SELECT nextval('quote_reference_seq') AS n`)
    : await tx.execute<{ n: string }>(sql`SELECT nextval('commerce_order_reference_seq') AS n`);
  const n = Number(result.rows[0]?.n);
  if (!Number.isFinite(n)) throw new AppError("REFERENCE_ALLOCATION_FAILED", 500, "Could not allocate a reference number.");
  return `RD-${String(n).padStart(5, "0")}`;
}

async function companyRow(tx: Transaction, companyId: string) {
  const [row] = await tx.select().from(company).where(eq(company.id, companyId)).limit(1);
  if (!row) throw new AppError("COMPANY_NOT_FOUND", 404, "Company was not found.");
  return row;
}

function money(value: number): string {
  return value.toFixed(2);
}

export function createQuoteService(database: Database, now: () => Date = () => new Date()) {
  return {
    async submit(actor: QuoteActor, input: SubmitQuoteInput, idempotencyKey: string): Promise<SubmitQuoteResult> {
      validateKey(idempotencyKey);
      return mappingTransaction(database, async (tx) => {
        const auth = await loadAuthorization(tx, actor.userId);
        requireCapability(auth, "orders.submit");
        const mutation: MutationContext = {
          actorUserId: actor.userId,
          companyId: auth.companyId,
          capability: "orders.submit",
          requestId: actor.requestId,
        };
        const response = await withIdempotency(tx, mutation, "quotes.submit", idempotencyKey, canonicalJsonHash(input), async () => {
          const account = await companyRow(tx, auth.companyId);
          const [user] = await tx.select({ name: appUser.name }).from(appUser).where(eq(appUser.id, actor.userId)).limit(1);
          const quoteNo = await nextReference(tx, "quote_reference_seq");
          const requestDate = ontarioToday(now());
          const inserted: string[] = [];
          for (const line of input.lines) {
            const [row] = await tx.insert(quoteLine).values({
              companyId: auth.companyId,
              submittedByUserId: actor.userId,
              quoteNo,
              requestDate,
              productLine: input.productLine,
              customerName: account.name,
              userName: user?.name ?? "—",
              requested: {
                partNumber: line.partNumber,
                description: line.description,
                qty: line.qty,
              },
              catalogPartId: line.partId,
              model: line.model ?? "—",
              serialNumber: line.serialNumber ?? "—",
              system: line.system ?? "—",
              figure: line.figure ?? "—",
              assemblyName: line.assemblyName ?? "—",
            }).returning({ id: quoteLine.id });
            inserted.push(row.id);
          }
          await writeAuditLog(tx, mutation, {
            objectType: "quote_request",
            objectId: inserted[0],
            before: null,
            after: { quoteNo, lineIds: inserted },
          });
          await enqueueOutboxEvent(tx, {
            eventType: "quote.submitted.email",
            aggregateType: "quote_request",
            aggregateId: inserted[0],
            payload: {
              quoteNo,
              companyId: auth.companyId,
              companyName: account.name,
              lineIds: inserted,
              shipping: input.shipping,
              generalComment: input.generalComment,
              productLine: input.productLine,
            },
            deduplicationKey: `quote.submitted:${quoteNo}`,
          });
          return { status: 201, body: { quoteNo, lineIds: inserted } satisfies SubmitQuoteResult };
        });
        return response.body as SubmitQuoteResult;
      });
    },

    async listAdmin(actor: QuoteActor, productLine?: string) {
      return mappingTransaction(database, async (tx) => {
        const auth = await loadAuthorization(tx, actor.userId);
        requireCapability(auth, "orders.quote");
        const rows = await tx.select().from(quoteLine).orderBy(desc(quoteLine.requestDate), desc(quoteLine.id)).limit(500);
        const items = rows
          .filter((row) => !productLine || row.productLine === productLine)
          .filter((row) => auth.accountIds === "all" || auth.accountIds.includes(row.companyId))
          .map(mapLine);
        return { items, nextCursor: null };
      }, false);
    },

    async listMine(actor: QuoteActor) {
      return mappingTransaction(database, async (tx) => {
        const auth = await loadAuthorization(tx, actor.userId);
        requireCapability(auth, "orders.own.view");
        const today = ontarioToday(now());
        const rows = await tx.select().from(quoteLine)
          .where(eq(quoteLine.companyId, auth.companyId))
          .orderBy(desc(quoteLine.requestDate), desc(quoteLine.id))
          .limit(500);
        const notices = await tx.select().from(quoteNotice)
          .where(eq(quoteNotice.companyId, auth.companyId))
          .orderBy(desc(quoteNotice.at))
          .limit(100);
        return {
          items: rows.map((row) => toCustomer(mapLine(row), today)),
          notices: notices.map((notice): QuoteNotice => ({
            id: notice.id,
            companyId: notice.companyId,
            customer: notice.customerName,
            quoteNo: notice.quoteNo,
            lineIds: notice.lineIds,
            at: notice.at.toISOString(),
            seen: notice.seen,
          })),
          nextCursor: null,
        };
      }, false);
    },

    async patchLine(actor: QuoteActor, id: string, input: PatchQuoteLineInput, idempotencyKey: string): Promise<QuoteLine> {
      validateKey(idempotencyKey);
      return mappingTransaction(database, async (tx) => {
        const auth = await loadAuthorization(tx, actor.userId);
        requireCapability(auth, "orders.quote");
        const [existing] = await tx.select().from(quoteLine).where(eq(quoteLine.id, id)).limit(1);
        if (!existing) throw new AppError("QUOTE_LINE_NOT_FOUND", 404, "Quote line was not found.");
        if (auth.accountIds !== "all" && !auth.accountIds.includes(existing.companyId)) {
          throw new AppError("FORBIDDEN", 403, "Out of account scope.");
        }
        const mutation: MutationContext = {
          actorUserId: actor.userId,
          companyId: auth.companyId,
          capability: "orders.quote",
          requestId: actor.requestId,
        };
        const response = await withIdempotency(tx, mutation, "quotes.patch-line", idempotencyKey, canonicalJsonHash({ id, input }), async () => {
          if (existing.version !== input.version) {
            throw new AppError("STALE_QUOTE_LINE", 412, "Reload the quote line before saving.");
          }
          const [updated] = await tx.update(quoteLine).set({
            available: input.available !== undefined ? input.available ?? null : existing.available,
            estAvailability: input.estAvailability !== undefined ? input.estAvailability : existing.estAvailability,
            newPartNumber: input.newPartNumber !== undefined ? input.newPartNumber : existing.newPartNumber,
            newDescription: input.newDescription !== undefined ? input.newDescription : existing.newDescription,
            newQty: input.newQty !== undefined ? input.newQty : existing.newQty,
            factoryPrice: input.factoryPrice !== undefined ? input.factoryPrice : existing.factoryPrice,
            customerPrice: input.customerPrice !== undefined ? input.customerPrice : existing.customerPrice,
            comments: input.comments !== undefined ? input.comments : existing.comments,
            responseDate: input.responseDate !== undefined ? input.responseDate : existing.responseDate,
            updatedAt: now(),
            version: existing.version + 1,
          }).where(and(eq(quoteLine.id, id), eq(quoteLine.version, input.version))).returning();
          if (!updated) throw new AppError("STALE_QUOTE_LINE", 412, "Reload the quote line before saving.");
          await writeAuditLog(tx, mutation, {
            objectType: "quote_line",
            objectId: id,
            before: { version: existing.version },
            after: { version: updated.version },
          });
          return { status: 200, body: mapLine(updated) };
        });
        return response.body as QuoteLine;
      });
    },

    async notify(actor: QuoteActor, input: NotifyQuoteInput, idempotencyKey: string): Promise<{ notices: QuoteNotice[] }> {
      validateKey(idempotencyKey);
      return mappingTransaction(database, async (tx) => {
        const auth = await loadAuthorization(tx, actor.userId);
        requireCapability(auth, "orders.quote");
        const mutation: MutationContext = {
          actorUserId: actor.userId,
          companyId: auth.companyId,
          capability: "orders.quote",
          requestId: actor.requestId,
        };
        const response = await withIdempotency(tx, mutation, "quotes.notify", idempotencyKey, canonicalJsonHash(input), async () => {
          const today = ontarioToday(now());
          const rows = await tx.select().from(quoteLine).where(inArray(quoteLine.id, input.lineIds));
          if (rows.length !== input.lineIds.length) {
            throw new AppError("QUOTE_LINE_NOT_FOUND", 404, "One or more quote lines were not found.");
          }
          for (const row of rows) {
            if (auth.accountIds !== "all" && !auth.accountIds.includes(row.companyId)) {
              throw new AppError("FORBIDDEN", 403, "Out of account scope.");
            }
          }
          await tx.update(quoteLine).set({
            notifyCustomer: true,
            responseDate: sql`coalesce(${quoteLine.responseDate}, ${today}::date)`,
            updatedAt: now(),
            version: sql`${quoteLine.version} + 1`,
          }).where(inArray(quoteLine.id, input.lineIds));

          const byQuote = new Map<string, typeof rows>();
          for (const row of rows) {
            const key = `${row.companyId}|${row.quoteNo}`;
            byQuote.set(key, [...(byQuote.get(key) ?? []), row]);
          }
          const notices: QuoteNotice[] = [];
          for (const group of byQuote.values()) {
            const [notice] = await tx.insert(quoteNotice).values({
              companyId: group[0].companyId,
              customerName: group[0].customerName,
              quoteNo: group[0].quoteNo,
              lineIds: group.map((row) => row.id),
              at: now(),
              seen: false,
            }).returning();
            notices.push({
              id: notice.id,
              companyId: notice.companyId,
              customer: notice.customerName,
              quoteNo: notice.quoteNo,
              lineIds: notice.lineIds,
              at: notice.at.toISOString(),
              seen: notice.seen,
            });
            await enqueueOutboxEvent(tx, {
              eventType: "quote.notified.email",
              aggregateType: "quote_notice",
              aggregateId: notice.id,
              payload: {
                noticeId: notice.id,
                companyId: notice.companyId,
                quoteNo: notice.quoteNo,
                lineIds: notice.lineIds,
                customerName: notice.customerName,
              },
              deduplicationKey: `quote.notified:${notice.id}`,
            });
          }
          return { status: 200, body: { notices } };
        });
        return response.body as { notices: QuoteNotice[] };
      });
    },

    async addFactoryLine(actor: QuoteActor, input: AddFactoryQuoteLineInput, idempotencyKey: string): Promise<QuoteLine> {
      validateKey(idempotencyKey);
      return mappingTransaction(database, async (tx) => {
        const auth = await loadAuthorization(tx, actor.userId);
        requireCapability(auth, "orders.quote");
        if (auth.accountIds !== "all" && !auth.accountIds.includes(input.companyId)) {
          throw new AppError("FORBIDDEN", 403, "Out of account scope.");
        }
        const mutation: MutationContext = {
          actorUserId: actor.userId,
          companyId: auth.companyId,
          capability: "orders.quote",
          requestId: actor.requestId,
        };
        const response = await withIdempotency(tx, mutation, "quotes.add-factory-line", idempotencyKey, canonicalJsonHash(input), async () => {
          const account = await companyRow(tx, input.companyId);
          const [existing] = await tx.select().from(quoteLine)
            .where(and(eq(quoteLine.quoteNo, input.quoteNo), eq(quoteLine.companyId, input.companyId)))
            .limit(1);
          const requestDate = existing?.requestDate ?? ontarioToday(now());
          const [row] = await tx.insert(quoteLine).values({
            companyId: input.companyId,
            submittedByUserId: actor.userId,
            quoteNo: input.quoteNo,
            requestDate,
            productLine: input.productLine,
            customerName: account.name,
            userName: "Factory",
            requested: null,
            newPartNumber: input.newPartNumber,
            newDescription: input.newDescription,
            newQty: input.newQty,
            factoryPrice: input.factoryPrice ?? null,
            customerPrice: input.customerPrice ?? null,
            available: input.available ?? "yes",
            comments: input.comments ?? "",
            responseDate: ontarioToday(now()),
          }).returning();
          return { status: 201, body: mapLine(row) };
        });
        return response.body as QuoteLine;
      });
    },

    async markNoticesSeen(actor: QuoteActor) {
      return mappingTransaction(database, async (tx) => {
        const auth = await loadAuthorization(tx, actor.userId);
        requireCapability(auth, "orders.own.view");
        await tx.update(quoteNotice).set({
          seen: true,
          updatedAt: now(),
          version: sql`${quoteNotice.version} + 1`,
        }).where(and(eq(quoteNotice.companyId, auth.companyId), eq(quoteNotice.seen, false)));
        return { ok: true as const };
      });
    },

    async submitCommerceOrder(actor: QuoteActor, input: SubmitCommerceOrderInput, idempotencyKey: string): Promise<SubmitCommerceOrderResult> {
      validateKey(idempotencyKey);
      return mappingTransaction(database, async (tx) => {
        const auth = await loadAuthorization(tx, actor.userId);
        requireCapability(auth, "orders.submit");
        const mutation: MutationContext = {
          actorUserId: actor.userId,
          companyId: auth.companyId,
          capability: "orders.submit",
          requestId: actor.requestId,
        };
        const response = await withIdempotency(tx, mutation, "commerce-orders.submit", idempotencyKey, canonicalJsonHash(input), async () => {
          if (input.orderType === "schedule" && !input.scheduleDate) {
            throw new AppError("SCHEDULE_DATE_REQUIRED", 400, "Schedule orders require a schedule date.");
          }
          if (input.orderType !== "schedule" && !input.shippingMethod) {
            throw new AppError("SHIPPING_METHOD_REQUIRED", 400, "Regular and urgent orders require a shipping method.");
          }
          let listTotal = 0;
          for (const line of input.lines) {
            listTotal += Number(line.unitPrice) * line.qty;
          }
          if (!Number.isFinite(listTotal) || listTotal < 0) {
            throw new AppError("INVALID_ORDER_TOTAL", 400, "Order totals are invalid.");
          }
          // Quoted unit prices are final (decision B); dealer discount applies only to catalogue list lines.
          // Clients send the already-discounted catalogue unit prices, so we do not re-apply discountRate here.
          const discountRate = "0";
          const discountApplied = money(0);
          const netTotal = money(listTotal);
          const reference = await nextReference(tx, "commerce_order_reference_seq");
          const [order] = await tx.insert(commerceOrder).values({
            companyId: auth.companyId,
            submittedByUserId: actor.userId,
            reference,
            customerPo: input.poNumber,
            vin: input.vin,
            orderType: input.orderType,
            scheduleDate: input.scheduleDate,
            shippingMethod: input.shippingMethod,
            shippingAddress: input.shipping,
            billingAddress: input.billing,
            instructions: input.instructions,
            currency: input.currency,
            listTotal: money(listTotal),
            discountRate,
            discountApplied,
            netTotal,
            status: "submitted",
            submittedAt: now(),
          }).returning();
          for (const line of input.lines) {
            await tx.insert(commerceOrderLine).values({
              orderId: order.id,
              partNumber: line.partNumber,
              description: line.description,
              qty: line.qty,
              unitPrice: line.unitPrice,
              lineTotal: money(Number(line.unitPrice) * line.qty),
              catalogPartId: line.catalogPartId,
              quoteNo: line.quoteNo,
            });
          }
          await writeAuditLog(tx, mutation, {
            objectType: "commerce_order",
            objectId: order.id,
            before: null,
            after: { reference, lineCount: input.lines.length, netTotal },
          });
          await enqueueOutboxEvent(tx, {
            eventType: "commerce-order.submitted.email",
            aggregateType: "commerce_order",
            aggregateId: order.id,
            payload: {
              orderId: order.id,
              reference,
              companyId: auth.companyId,
              customerPo: input.poNumber,
              netTotal,
              currency: input.currency,
            },
            deduplicationKey: `commerce-order.submitted:${reference}`,
          });
          return {
            status: 201,
            body: { id: order.id, reference, status: "submitted" } satisfies SubmitCommerceOrderResult,
          };
        });
        return response.body as SubmitCommerceOrderResult;
      });
    },

    async patchCompanyDiscount(actor: QuoteActor, companyId: string, input: PatchCompanyDiscountInput, idempotencyKey: string): Promise<CompanyDiscountResult> {
      validateKey(idempotencyKey);
      return mappingTransaction(database, async (tx) => {
        const auth = await loadAuthorization(tx, actor.userId);
        requireCapability(auth, "users.all.manage");
        if (auth.accountIds !== "all" && !auth.accountIds.includes(companyId)) {
          throw new AppError("FORBIDDEN", 403, "Out of account scope.");
        }
        const mutation: MutationContext = {
          actorUserId: actor.userId,
          companyId: auth.companyId,
          capability: "users.all.manage",
          requestId: actor.requestId,
        };
        const response = await withIdempotency(tx, mutation, "accounts.discount.patch", idempotencyKey, canonicalJsonHash({ companyId, input }), async () => {
          const [existing] = await tx.select().from(company).where(eq(company.id, companyId)).limit(1);
          if (!existing) throw new AppError("COMPANY_NOT_FOUND", 404, "Company was not found.");
          if (existing.version !== input.version) {
            throw new AppError("STALE_COMPANY", 412, "Reload the company before saving the discount.");
          }
          const [updated] = await tx.update(company).set({
            discountRate: input.discountRate,
            updatedAt: now(),
            version: existing.version + 1,
          }).where(and(eq(company.id, companyId), eq(company.version, input.version))).returning();
          if (!updated) throw new AppError("STALE_COMPANY", 412, "Reload the company before saving the discount.");
          await writeAuditLog(tx, mutation, {
            objectType: "company",
            objectId: companyId,
            before: { discountRate: existing.discountRate, version: existing.version },
            after: { discountRate: updated.discountRate, version: updated.version },
          });
          return {
            status: 200,
            body: {
              id: updated.id,
              name: updated.name,
              discountRate: updated.discountRate,
              version: updated.version,
            } satisfies CompanyDiscountResult,
          };
        });
        return response.body as CompanyDiscountResult;
      });
    },

    async getCompanyDiscount(actor: QuoteActor, companyId: string): Promise<CompanyDiscountResult> {
      return mappingTransaction(database, async (tx) => {
        const auth = await loadAuthorization(tx, actor.userId);
        requireCapability(auth, "users.all.manage");
        if (auth.accountIds !== "all" && !auth.accountIds.includes(companyId)) {
          throw new AppError("FORBIDDEN", 403, "Out of account scope.");
        }
        const row = await companyRow(tx, companyId);
        return {
          id: row.id,
          name: row.name,
          discountRate: row.discountRate,
          version: row.version,
        };
      }, false);
    },
  };
}
