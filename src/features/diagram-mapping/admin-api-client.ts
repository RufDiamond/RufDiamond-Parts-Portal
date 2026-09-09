import { Value } from "@sinclair/typebox/value";
import type { Static, TSchema } from "@sinclair/typebox";
import { DraftFigurePageSchema, PublicationQueuePageSchema, PublishResultSchema, SourceReviewDetailSchema, type AssemblyReferenceReviewInput, type DepictionReviewInput, type PublishInput } from "@rufdiamond/contracts";
import { MappingApiError } from "./api-client";

export function createAdminApiClient(csrfToken: string) {
  async function send<S extends TSchema>(path: string, schema: S, body?: PublishInput | AssemblyReferenceReviewInput | DepictionReviewInput, key?: string,version?:number): Promise<Static<S>> {
    const response = await fetch(`/api/v1/admin/${path}`, { method: body ? "POST" : "GET", credentials: "same-origin", cache: "no-store", redirect: "error", headers: body ? { "Content-Type": "application/json", "X-CSRF-Token": csrfToken, "Idempotency-Key": key!,...(version===undefined?{}:{"If-Match":`"${version}"`}) } : {}, ...(body ? { body: JSON.stringify(body) } : {}) });
    let result: unknown;
    try { result = await response.json(); } catch { throw new MappingApiError(502, "The admin API response is unavailable."); }
    if (!response.ok) throw new MappingApiError(response.status, response.status === 409 ? "The catalogue changed. Reload the queue and review its current versions." : "The operation could not complete. Recheck access and current catalogue readiness.");
    if (!Value.Check(schema, result)) throw new MappingApiError(502, "The admin API returned an invalid contract.");
    return result;
  }
  return {
    figures: (cursor?: string) => send(`figures?limit=50${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`, DraftFigurePageSchema),
    queue: (cursor?: string) => send(`publication/queue?limit=50${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`, PublicationQueuePageSchema),
    publish: (input: PublishInput, key: string) => send("publication/releases", PublishResultSchema, input, key),
    sourceReview:(target:"import"|"figure",id:string)=>send(`catalog-review/${target}s/${id}`,SourceReviewDetailSchema),
    approveSourceReview:(target:"import"|"figure",id:string,version:number,input:AssemblyReferenceReviewInput|DepictionReviewInput,key:string)=>send(`catalog-review/${target}s/${id}/${target==="import"?"quantity-decisions":"decisions"}`,SourceReviewDetailSchema,input,key,version),
  };
}
export type PublisherApi = Pick<ReturnType<typeof createAdminApiClient>, "queue" | "publish">;
