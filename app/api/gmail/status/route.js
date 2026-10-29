import { getCloudflareContext } from "@opennextjs/cloudflare";
import { NextResponse } from "next/server";
import {
  decryptRefreshToken,
  getGmailConfig,
  GMAIL_TOKEN_KEY,
  isGmailConfigurationValid,
} from "@/lib/gmail";

export async function GET() {
  const configured = isGmailConfigurationValid(getGmailConfig());
  if (!configured) {
    return NextResponse.json(
      { configured: false, connected: false },
      { headers: { "Cache-Control": "no-store" } },
    );
  }

  try {
    const { env } = await getCloudflareContext({ async: true });
    if (!env.GMAIL_TOKENS) throw new Error("Gmail token storage is not configured.");
    const token = await env.GMAIL_TOKENS.get(GMAIL_TOKEN_KEY);
    if (token) await decryptRefreshToken(token, getGmailConfig().tokenEncryptionKey);
    return NextResponse.json(
      { configured: true, connected: Boolean(token) },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    return NextResponse.json(
      { error: "Gmail connection status is unavailable." },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}
