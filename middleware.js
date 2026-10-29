import { getToken } from "next-auth/jwt";
import { NextResponse } from "next/server";

export async function middleware(request) {
  const secret = process.env.NEXTAUTH_SECRET;
  const allowedEmail = process.env.APP_ALLOWED_EMAIL;
  const hasGoogleOAuth =
    process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET;

  if (!secret || !allowedEmail || !hasGoogleOAuth) {
    if (
      process.env.NODE_ENV === "development" &&
      process.env.AUTH_LOCAL_DEV_BYPASS === "true"
    ) {
      return NextResponse.next();
    }

    return new NextResponse("Private sign-in is not configured for this deployment.", {
      status: 503,
      headers: { "Cache-Control": "no-store" },
    });
  }

  try {
    const token = await getToken({
      req: request,
      secret,
    });
    const authenticatedEmail =
      typeof token?.email === "string" ? token.email.toLowerCase() : "";

    if (authenticatedEmail !== allowedEmail.toLowerCase()) {
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
  } catch {
    return new NextResponse("Sign-in could not be verified.", {
      status: 503,
      headers: { "Cache-Control": "no-store" },
    });
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|login|api/auth).*)"],
};
