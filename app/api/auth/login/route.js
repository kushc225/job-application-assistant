import { NextResponse } from "next/server";
import {
  createSessionToken,
  isValidAuthConfiguration,
  SESSION_COOKIE,
  SESSION_MAX_AGE_SECONDS,
  verifyCredentials,
} from "@/lib/session";
import { enforceRateLimit } from "@/lib/rate-limit";

const MAX_BODY_BYTES = 4096;

export async function POST(request) {
  const username = process.env.APP_USERNAME;
  const password = process.env.APP_PASSWORD;
  const secret = process.env.AUTH_SECRET;

  if (!isValidAuthConfiguration(username, password, secret)) {
    return jsonResponse({ error: "Private sign-in is not configured correctly." }, 503);
  }
  if (!isSameOrigin(request)) {
    return jsonResponse({ error: "Request origin is not allowed." }, 403);
  }
  if (!request.headers.get("content-type")?.includes("application/json")) {
    return jsonResponse({ error: "Content-Type must be application/json." }, 415);
  }
  if (Number(request.headers.get("content-length")) > MAX_BODY_BYTES) {
    return jsonResponse({ error: "Request body is too large." }, 413);
  }

  let body;
  try {
    const raw = await request.text();
    if (new TextEncoder().encode(raw).byteLength > MAX_BODY_BYTES) {
      return jsonResponse({ error: "Request body is too large." }, 413);
    }
    body = JSON.parse(raw);
  } catch {
    return jsonResponse({ error: "Request body must be valid JSON." }, 400);
  }

  if (
    typeof body?.username !== "string" ||
    typeof body?.password !== "string" ||
    body.username.length > 128 ||
    body.password.length > 256
  ) {
    return jsonResponse({ error: "Invalid username or password." }, 401);
  }

  const rateLimitResponse = await enforceRateLimit(
    request,
    "LOGIN_RATE_LIMITER",
    "Too many sign-in attempts. Please wait and try again.",
  );
  if (rateLimitResponse) return rateLimitResponse;

  if (!(await verifyCredentials(body.username, body.password, username, password))) {
    return jsonResponse({ error: "Invalid username or password." }, 401);
  }

  const token = await createSessionToken(username, password, secret);
  const response = jsonResponse({ ok: true }, 200);
  response.headers.append(
    "Set-Cookie",
    `${SESSION_COOKIE}=${token}; Path=/; Max-Age=${SESSION_MAX_AGE_SECONDS}; HttpOnly; Secure; SameSite=Strict`,
  );
  return response;
}

function isSameOrigin(request) {
  const origin = request.headers.get("origin");
  return origin === new URL(request.url).origin;
}

function jsonResponse(body, status) {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}
