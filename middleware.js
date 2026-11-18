import { NextResponse } from "next/server";

export function middleware(request) {
  const { pathname } = request.nextUrl;

  // Intercept raw Better Auth email verification links (/api/auth/verify-email)
  // and route them to our dedicated UI page (/verify-email) so users see the confirmation state
  if (pathname === "/api/auth/verify-email") {
    const token = request.nextUrl.searchParams.get("token");
    if (token) {
      const url = request.nextUrl.clone();
      url.pathname = "/verify-email";
      return NextResponse.redirect(url);
    }
  }

  // 1. Allow public assets, Next.js internal files, and auth endpoints
  if (
    pathname.startsWith("/api/auth") ||
    pathname.startsWith("/_next") ||
    pathname.startsWith("/static") ||
    pathname === "/favicon.ico" ||
    pathname === "/login" ||
    pathname === "/register" ||
    pathname === "/verify-email"
  ) {
    return NextResponse.next();
  }

  // 2. Allow cron pipeline if cron secret matches
  const cronSecret = process.env.CRON_SECRET;
  if (
    pathname === "/api/run" &&
    cronSecret &&
    request.headers.get("x-cron-secret") === cronSecret
  ) {
    return NextResponse.next();
  }

  // 3. Check for Better Auth session token cookie
  const sessionCookie =
    request.cookies.get("better-auth.session_token") ||
    request.cookies.get("__Secure-better-auth.session_token");

  // If no session cookie and accessing user pages, redirect to /login
  if (!sessionCookie && !pathname.startsWith("/api/")) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico).*)",
  ],
};
