import "server-only";

export const rufNewsUrl = "https://www.rufdiamond.com/news";
type NewsItem = { href: string; title: string };

function decodeHeadline(value: string): string {
  return value.replace(/&(?:amp|quot|apos|nbsp|lt|gt|#x[0-9a-f]+|#\d+);/gi, entity => {
    const named: Record<string, string> = { "&amp;": "&", "&quot;": '"', "&apos;": "'", "&nbsp;": " ", "&lt;": "<", "&gt;": ">" };
    if (entity in named) return named[entity];
    const hex = entity.startsWith("&#x");
    if (!entity.startsWith("&#")) return entity;
    const code = Number.parseInt(entity.slice(hex ? 3 : 2, -1), hex ? 16 : 10);
    return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : entity;
  }).trim();
}

export function parseRufNews(html: string): NewsItem[] {
  const items = new Map<string, NewsItem>();
  for (const [, slug, raw] of html.matchAll(/<a\s+href="(\/news\/[a-z0-9-]+)"[^>]*class="[^"]*\bblog-title\b[^"]*"[^>]*>([^<]+)<\/a>/gi)) {
    const title = decodeHeadline(raw);
    if (title) items.set(slug, { href: new URL(slug, rufNewsUrl).href, title });
    if (items.size === 3) break;
  }
  return [...items.values()];
}

let latest: NewsItem[] = [];
let nextRefresh = 0;
let pending: Promise<NewsItem[]> | undefined;
export function getRufNews(): Promise<NewsItem[]> {
  if (Date.now() < nextRefresh) return Promise.resolve(latest);
  pending ??= (async () => {
    try {
      const response = await fetch(rufNewsUrl, { signal: AbortSignal.timeout(2000), redirect: "error" });
      if (!response.ok) throw new Error("News unavailable");
      const items = parseRufNews(await response.text());
      if (!items.length) throw new Error("No news articles found");
      latest = items;
      nextRefresh = Date.now() + 30 * 60_000;
    } catch {
      nextRefresh = Date.now() + 60_000;
    } finally {
      pending = undefined;
    }
    return latest;
  })();
  return pending;
}
