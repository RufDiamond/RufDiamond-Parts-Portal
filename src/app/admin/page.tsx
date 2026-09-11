import { DraftFigurePageSchema } from "@rufdiamond/contracts";
import { readApiContract } from "@/data/api-response.server";
import { getBackendApiRead } from "@/lib/backend-api.server";
export default async function AdminPage({ searchParams }: { searchParams: Promise<{ cursor?: string }> }) {
  let page;
  try {
    const { cursor } = await searchParams;
    page = await readApiContract(await getBackendApiRead(), `admin/figures?limit=50${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`, DraftFigurePageSchema);
  } catch { return <main><h1>Draft figures unavailable</h1><p>Current draft access could not be verified.</p></main>; }
  return <main><h1>Draft figures</h1><p>Only figures within your current draft scope are listed.</p><ul>{page.items.map(figure => <li key={figure.id}><a href={`/admin/figures/${figure.id}/mapping`}>{figure.name}</a> · {figure.hasDrawing ? "Drawing attached" : "Drawing absent; source review or PNG upload required"} · version {figure.version} · <a href={`/admin/catalog-review/figures/${figure.id}`}>Review source depiction</a></li>)}</ul>{!page.items.length && <p>No figures in your current draft scope.</p>}{page.nextCursor && <a href={`/admin?cursor=${page.nextCursor}`}>Next figures</a>}</main>;
}
