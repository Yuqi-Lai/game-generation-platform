import { NextResponse } from "next/server";
import { isPublicPortfolioMode } from "./lib/deployment-mode";

export async function proxy(request: Request) {
  if (isPublicPortfolioMode()) {
    const url = new URL(request.url);
    if (
      url.pathname.startsWith("/api/projects") ||
      url.pathname.startsWith("/auth")
    ) {
      return NextResponse.redirect(new URL("/", request.url));
    }
    return NextResponse.next();
  }
  return (await import("./lib/auth0")).auth0.middleware(request);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|sitemap.xml|robots.txt).*)"],
};
