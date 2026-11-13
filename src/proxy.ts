import { NextResponse, type NextRequest } from "next/server";
import { usesFixtureMode } from "./lib/backend-config.server";

/** Defence in depth for API-mode development and accidentally copied public assets. */
export function proxy(request: NextRequest) {
  if (!usesFixtureMode(process.env)) {
    const path = request.nextUrl.pathname;
    const image = request.nextUrl.searchParams.get("url") ?? "";
    if (path.startsWith("/drawings/") || path === "/drawings" || path.startsWith("/review/") ||
      path === "/_next/image" && !/^\/(brand|home|nav|models|systems|toolbar)\/[\w .-]+\.(png|jpg)$/.test(image)) {
      return new NextResponse("Catalogue unavailable", { status: 404, headers: { "cache-control": "private, no-store" } });
    }
  }
  return NextResponse.next();
}
export const config = { matcher: ["/drawings/:path*", "/review/:path*", "/_next/image"] };
