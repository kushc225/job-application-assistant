import { getCloudflareContext } from "@opennextjs/cloudflare";
import { NextResponse } from "next/server";
import {
  decryptRefreshToken,
  getGmailConfig,
  GMAIL_TOKEN_KEY,
  isGmailConfigurationValid,
} from "@/lib/gmail";

export async function POST(request) {
  if (request.headers.get("origin") !== new URL(request.url).origin) {
    return NextResponse.json(
      { error: "Request origin is not allowed." },
      { status: 403, headers: { "Cache-Control": "no-store" } },
    );
  }

  const config = getGmailConfig();
  if (!isGmailConfigurationValid(config)) {
    return NextResponse.json(
      { error: "Gmail integration is not configured." },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }

  try {
    const { env } = await getCloudflareContext({ async: true });
    if (!env.GMAIL_TOKENS) throw new Error("Gmail token storage is not configured.");
    const encryptedToken = await env.GMAIL_TOKENS.get(GMAIL_TOKEN_KEY);
    if (!encryptedToken) return NextResponse.json({ ok: true });

    const refreshToken = await decryptRefreshToken(
      encryptedToken,
      config.tokenEncryptionKey,
    );
    const response = await fetch("https://oauth2.googleapis.com/revoke", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ token: refreshToken }),
    });
    if (!response.ok) {
      return NextResponse.json(
        { error: "Google could not revoke access. The connection was kept." },
        { status: 502, headers: { "Cache-Control": "no-store" } },
      );
    }

    await env.GMAIL_TOKENS.delete(GMAIL_TOKEN_KEY);
    return NextResponse.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json(
      { error: "Could not disconnect Gmail. Please try again." },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}
