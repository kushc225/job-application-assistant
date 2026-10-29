import { getCloudflareContext } from "@opennextjs/cloudflare";
import { NextResponse } from "next/server";
import { enforceRateLimit } from "@/lib/rate-limit";
import {
  createRawEmail,
  decryptRefreshToken,
  getGmailConfig,
  GMAIL_TOKEN_KEY,
  isGmailConfigurationValid,
  isValidEmail,
  refreshGmailAccessToken,
} from "@/lib/gmail";

const MAX_BODY_BYTES = 32_000;

function jsonResponse(body, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

export async function POST(request) {
  if (request.headers.get("origin") !== new URL(request.url).origin) {
    return jsonResponse({ error: "Request origin is not allowed." }, 403);
  }
  if (!request.headers.get("content-type")?.includes("application/json")) {
    return jsonResponse({ error: "Content-Type must be application/json." }, 415);
  }
  if (Number(request.headers.get("content-length")) > MAX_BODY_BYTES) {
    return jsonResponse({ error: "Email is too large to send." }, 413);
  }

  const config = getGmailConfig();
  if (!isGmailConfigurationValid(config)) {
    return jsonResponse({ error: "Gmail integration is not configured." }, 503);
  }

  const rateLimitResponse = await enforceRateLimit(
    request,
    "GMAIL_SEND_RATE_LIMITER",
    "Too many emails sent. Wait a minute before trying again.",
  );
  if (rateLimitResponse) return rateLimitResponse;

  let payload;
  try {
    const raw = await request.text();
    if (new TextEncoder().encode(raw).byteLength > MAX_BODY_BYTES) {
      return jsonResponse({ error: "Email is too large to send." }, 413);
    }
    payload = JSON.parse(raw);
  } catch {
    return jsonResponse({ error: "Request body must be valid JSON." }, 400);
  }

  const { to, subject, body } = payload ?? {};
  if (
    !isValidEmail(to) ||
    typeof subject !== "string" ||
    typeof body !== "string" ||
    !subject.trim() ||
    subject.length > 300 ||
    /[\r\n]/.test(subject) ||
    !body.trim() ||
    body.length > 20_000
  ) {
    return jsonResponse({ error: "Check the recipient, subject, and email body." }, 400);
  }

  try {
    const { env } = await getCloudflareContext({ async: true });
    if (!env.GMAIL_TOKENS) throw new Error("Gmail token storage is not configured.");
    const encryptedToken = await env.GMAIL_TOKENS.get(GMAIL_TOKEN_KEY);
    if (!encryptedToken) {
      return jsonResponse({ error: "Connect Gmail before sending an email." }, 409);
    }

    const refreshToken = await decryptRefreshToken(
      encryptedToken,
      config.tokenEncryptionKey,
    );
    const tokenResult = await refreshGmailAccessToken(refreshToken, config);
    if (tokenResult.error === "reauthorize") {
      return jsonResponse(
        { error: "Gmail authorization expired. Reconnect Gmail before sending." },
        401,
      );
    }
    if (!tokenResult.accessToken) {
      return jsonResponse({ error: "Could not authorize with Google. Try again later." }, 502);
    }

    let response;
    try {
      response = await fetch(
        "https://gmail.googleapis.com/gmail/v1/users/me/messages/send",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${tokenResult.accessToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            raw: createRawEmail({ to, subject: subject.trim(), body }),
          }),
        },
      );
    } catch {
      return jsonResponse(
        { error: "Gmail could not be reached. Check your Sent folder before retrying." },
        502,
      );
    }

    if (response.status === 401 || response.status === 403) {
      return jsonResponse({ error: "Gmail denied the send request. Reconnect Gmail and retry." }, 502);
    }
    if (!response.ok) {
      return jsonResponse(
        { error: `Gmail could not send the email (HTTP ${response.status}).` },
        502,
      );
    }
    return jsonResponse({ ok: true });
  } catch {
    return jsonResponse({ error: "Could not send the email. Please try again." }, 503);
  }
}
