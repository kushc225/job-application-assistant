import { createRemoteJWKSet, jwtVerify } from "jose";
import { NextResponse } from "next/server";

let remoteKeys;

export async function proxy(request) {
  const teamDomain = process.env.CF_ACCESS_TEAM_DOMAIN;
  const audience = process.env.CF_ACCESS_AUD;
  const allowedEmail = process.env.CF_ACCESS_ALLOWED_EMAIL?.toLowerCase();

  if (!teamDomain || !audience || !allowedEmail) {
    if (
      process.env.NODE_ENV === "development" &&
      process.env.CF_ACCESS_LOCAL_DEV_BYPASS === "true"
    ) {
      return NextResponse.next();
    }

    return new NextResponse("Private access is not configured for this deployment.", {
      status: 503,
      headers: { "Cache-Control": "no-store" },
    });
  }

  if (!/^[a-z0-9-]+\.cloudflareaccess\.com$/i.test(teamDomain)) {
    return new NextResponse("Cloudflare Access configuration is invalid.", {
      status: 503,
      headers: { "Cache-Control": "no-store" },
    });
  }

  const assertion = request.headers.get("cf-access-jwt-assertion");
  if (!assertion) {
    return new NextResponse("Authentication required.", {
      status: 401,
      headers: { "Cache-Control": "no-store" },
    });
  }

  try {
    const issuer = `https://${teamDomain}`;
    remoteKeys ??= createRemoteJWKSet(
      new URL(`${issuer}/cdn-cgi/access/certs`),
    );
    const { payload } = await jwtVerify(assertion, remoteKeys, {
      issuer,
      audience,
    });

    if (
      typeof payload.email !== "string" ||
      payload.email.toLowerCase() !== allowedEmail
    ) {
      return new NextResponse("This account is not permitted to use this application.", {
        status: 403,
        headers: { "Cache-Control": "no-store" },
      });
    }
  } catch {
    return new NextResponse("Authentication could not be verified.", {
      status: 401,
      headers: { "Cache-Control": "no-store" },
    });
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
