import { NextResponse } from "next/server";
import {
  createGmailAuthorizationUrl,
  createOAuthState,
  getGmailConfig,
  GMAIL_STATE_COOKIE,
  GMAIL_STATE_MAX_AGE_SECONDS,
  isGmailConfigurationValid,
} from "@/lib/gmail";

export async function GET(request) {
  const config = getGmailConfig();
  if (!isGmailConfigurationValid(config)) {
    return new NextResponse("Gmail integration is not configured.", {
      status: 503,
      headers: { "Cache-Control": "no-store" },
    });
  }

  const { state, codeVerifier, cookieValue } = await createOAuthState(process.env.AUTH_SECRET);
  const response = NextResponse.redirect(
    await createGmailAuthorizationUrl(
      request,
      state,
      codeVerifier,
      config.clientId,
    ),
  );
  response.headers.append(
    "Set-Cookie",
    `${GMAIL_STATE_COOKIE}=${cookieValue}; Path=/; Max-Age=${GMAIL_STATE_MAX_AGE_SECONDS}; HttpOnly; Secure; SameSite=Lax`,
  );
  response.headers.set("Cache-Control", "no-store");
  return response;
}
