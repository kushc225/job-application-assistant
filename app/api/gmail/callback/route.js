import { getCloudflareContext } from "@opennextjs/cloudflare";
import { NextResponse } from "next/server";
import {
  decryptRefreshToken,
  encryptRefreshToken,
  exchangeAuthorizationCode,
  getGmailConfig,
  getGmailRedirectUri,
  GMAIL_STATE_COOKIE,
  GMAIL_TOKEN_KEY,
  isGmailConfigurationValid,
  verifyGoogleSender,
  verifyOAuthState,
} from "@/lib/gmail";

function redirectToApp(request, result) {
  const url = new URL("/", request.url);
  url.searchParams.set("gmail", result);
  const response = NextResponse.redirect(url);
  response.headers.append(
    "Set-Cookie",
    `${GMAIL_STATE_COOKIE}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax`,
  );
  response.headers.set("Cache-Control", "no-store");
  return response;
}

export async function GET(request) {
  const config = getGmailConfig();
  const url = new URL(request.url);
  const stateCookie = request.cookies.get(GMAIL_STATE_COOKIE)?.value;
  const returnedState = url.searchParams.get("state");

  const codeVerifier = await verifyOAuthState(
    stateCookie,
    returnedState,
    process.env.AUTH_SECRET,
  );
  if (!isGmailConfigurationValid(config) || !codeVerifier) {
    return new NextResponse("Gmail authorization could not be verified.", {
      status: 400,
      headers: {
        "Cache-Control": "no-store",
        "Set-Cookie": `${GMAIL_STATE_COOKIE}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax`,
      },
    });
  }

  if (url.searchParams.has("error")) return redirectToApp(request, "cancelled");
  const code = url.searchParams.get("code");
  if (!code || code.length > 4096) return redirectToApp(request, "error");

  try {
    const tokens = await exchangeAuthorizationCode(code, request, config, codeVerifier);
    if (!(await verifyGoogleSender(tokens.id_token, config.clientId))) {
      if (typeof tokens.refresh_token === "string") {
        let revokeResponse;
        try {
          revokeResponse = await fetch("https://oauth2.googleapis.com/revoke", {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            body: new URLSearchParams({ token: tokens.refresh_token }),
          });
        } catch {
          return redirectToApp(request, "wrong-account-revoke-failed");
        }
        if (!revokeResponse.ok) {
          return redirectToApp(request, "wrong-account-revoke-failed");
        }
      }
      return redirectToApp(request, "wrong-account");
    }

    let refreshToken = tokens.refresh_token;
    const { env } = await getCloudflareContext({ async: true });
    if (!env.GMAIL_TOKENS) {
      return new NextResponse("Gmail token storage is not configured.", {
        status: 503,
        headers: { "Cache-Control": "no-store" },
      });
    }
    if (typeof refreshToken !== "string" || !refreshToken) {
      const previousToken = await env.GMAIL_TOKENS.get(GMAIL_TOKEN_KEY);
      if (!previousToken) return redirectToApp(request, "error");
      refreshToken = await decryptRefreshToken(previousToken, config.tokenEncryptionKey);
    }

    const encryptedToken = await encryptRefreshToken(
      refreshToken,
      config.tokenEncryptionKey,
    );
    await env.GMAIL_TOKENS.put(GMAIL_TOKEN_KEY, encryptedToken);
    return redirectToApp(request, "connected");
  } catch {
    return redirectToApp(request, "error");
  }
}
