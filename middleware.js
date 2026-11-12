import { NextResponse } from "next/server";

export function middleware(request) {
  const { pathname } = request.nextUrl;

  // 1. Allow public assets, Next.js internal files, and auth endpoints
  if (
    pathname.startsWith("/api/auth") ||
    pathname.startsWith("/_next") ||
    pathname.startsWith("/static") ||
    pathname === "/favicon.ico" ||
    pathname === "/login" ||
    pathname === "/register"
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
