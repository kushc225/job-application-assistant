import { NextResponse } from "next/server";
import {
  isValidAuthConfiguration,
  SESSION_COOKIE,
  verifySessionToken,
} from "@/lib/session";

export async function proxy(request) {
  const secret = process.env.AUTH_SECRET;
  const username = process.env.APP_USERNAME;
  const password = process.env.APP_PASSWORD;

  if (!isValidAuthConfiguration(username, password, secret)) {
    if (
      process.env.NODE_ENV === "development" &&
      process.env.AUTH_LOCAL_DEV_BYPASS === "true"
    ) {
      return NextResponse.next();
    }

    return new NextResponse("Private sign-in is not configured.", {
      status: 503,
      headers: { "Cache-Control": "no-store" },
    });
  }

  try {
    const cookie = request.cookies.get(SESSION_COOKIE)?.value;
    if (await verifySessionToken(cookie, secret, username, password)) {
      return NextResponse.next();
    }
  } catch {
    return new NextResponse("Sign-in could not be verified.", { status: 503 });
  }

  if (request.nextUrl.pathname.startsWith("/api/")) {
    return NextResponse.json(
      { error: "Authentication required." },
      { status: 401, headers: { "Cache-Control": "no-store" } },
    );
  }

  const loginUrl = new URL("/login", request.url);
  loginUrl.searchParams.set(
    "callbackUrl",
    `${request.nextUrl.pathname}${request.nextUrl.search}`,
  );
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|login|api/auth/login|api/auth/logout|api/gmail/callback).*)",
  ],
};
