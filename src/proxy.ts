import { NextResponse, type NextRequest } from "next/server";

/**
 * Optimistic layer only: adds a per-request CSP nonce and bounces visitors without a session
 * cookie to /signin. Real authorization happens in the data-access layer (src/server/dal.ts)
 * on every page, action and route handler — never rely on this file for security.
 */
const PUBLIC = ["/", "/signin", "/about"];

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  const isDev = process.env.NODE_ENV === "development";

  const csp = [
    `default-src 'self'`,
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${isDev ? " 'unsafe-eval'" : ""}`,
    `style-src 'self' 'unsafe-inline' https://fonts.googleapis.com`,
    `img-src 'self' blob: data:`,
    `font-src 'self' https://fonts.gstatic.com`,
    `connect-src 'self'${isDev ? " ws:" : ""}`,
    `object-src 'none'`,
    `base-uri 'self'`,
    `form-action 'self' https://login.microsoftonline.com`,
    `frame-ancestors 'none'`,
    isDev ? "" : "upgrade-insecure-requests",
  ]
    .filter(Boolean)
    .join("; ");

  const hasSession =
    request.cookies.has("better-auth.session_token") || request.cookies.has("__Secure-better-auth.session_token");
  if (!hasSession && !PUBLIC.includes(pathname)) {
    const url = request.nextUrl.clone();
    url.pathname = "/signin";
    url.search = pathname === "/board" ? "" : `?next=${encodeURIComponent(pathname)}`;
    return NextResponse.redirect(url);
  }

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("Content-Security-Policy", csp);
  const res = NextResponse.next({ request: { headers: requestHeaders } });
  res.headers.set("Content-Security-Policy", csp);
  return res;
}

export const config = {
  matcher: [
    {
      source: "/((?!api|_next/static|_next/image|favicon.ico|icon.svg|robots.txt).*)",
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
  ],
};
