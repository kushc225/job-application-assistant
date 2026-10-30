import { NextResponse } from "next/server";
import { redactContactDetails } from "@/lib/job-post";
import { enforceRateLimit } from "@/lib/rate-limit";
import { formatGroqError } from "@/lib/groq-error";
import {
  buildGroqMessages,
  extractGroqChatText,
  fetchGroqWithRetry,
  GROQ_MODEL,
  GROQ_MAX_COMPLETION_TOKENS,
  GROQ_REQUEST_TIMEOUT_MS,
  getGroqFinishReason,
  isGroqTimeoutError,
  isCompleteEmailBody,
} from "@/lib/groq-chat";

const MAX_JOB_LENGTH = 20000;
const MAX_PROFILE_LENGTH = 4000;
const MAX_REQUEST_BYTES = 128000;

function jsonResponse(body, init) {
  const response = NextResponse.json(body, init);
  response.headers.set("Cache-Control", "no-store");
  return response;
}

export async function POST(request) {
  const apiKey = process.env.GROQ_API_KEY;
  const model = process.env.GROQ_MODEL || GROQ_MODEL;

  if (!request.headers.get("content-type")?.includes("application/json")) {
    return jsonResponse({ error: "Content-Type must be application/json." }, { status: 415 });
  }
  if (Number(request.headers.get("content-length")) > MAX_REQUEST_BYTES) {
    return jsonResponse({ error: "Request body is too large." }, { status: 413 });
  }

  if (!apiKey) {
    return jsonResponse(
      { error: "Groq isn’t configured yet. Add GROQ_API_KEY as a server secret." },
      { status: 503 },
    );
  }

  const rateLimitResponse = await enforceRateLimit(
    request,
    "GENERATION_RATE_LIMITER",
    "Too many drafts requested. Wait a minute before trying again.",
  );
  if (rateLimitResponse) return rateLimitResponse;

  let rawBody;
  try {
    rawBody = await request.text();
  } catch {
    return jsonResponse({ error: "Request body could not be read." }, { status: 400 });
  }
  if (new TextEncoder().encode(rawBody).byteLength > MAX_REQUEST_BYTES) {
    return jsonResponse({ error: "Request body is too large." }, { status: 413 });
  }

  let payload;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return jsonResponse({ error: "Request body must be valid JSON." }, { status: 400 });
  }

  const { jobDescription, role, company, profileHighlights } = payload ?? {};
  if (
    typeof jobDescription !== "string" ||
    typeof role !== "string" ||
    typeof company !== "string" ||
    typeof profileHighlights !== "string"
  ) {
    return jsonResponse({ error: "Job post and profile fields must be text." }, { status: 400 });
  }

  if (!jobDescription.trim() || jobDescription.length > MAX_JOB_LENGTH) {
    return jsonResponse(
      { error: `Paste a job post between 1 and ${MAX_JOB_LENGTH.toLocaleString()} characters.` },
      { status: 400 },
    );
  }
  if (role.length > 200 || company.length > 200 || profileHighlights.length > MAX_PROFILE_LENGTH) {
    return jsonResponse({ error: "One or more fields exceed the allowed length." }, { status: 400 });
  }

  const sanitizedJob = redactContactDetails(jobDescription).slice(0, MAX_JOB_LENGTH);
  const sanitizedHighlights = redactContactDetails(profileHighlights).slice(0, MAX_PROFILE_LENGTH);
  const messages = buildGroqMessages({
    role,
    company,
    profileHighlights: sanitizedHighlights,
    jobDescription: sanitizedJob,
  });
  let upstream;
  try {
    upstream = await fetchGroqWithRetry(
      () => requestGroq(apiKey, model, messages),
      model,
    );
  } catch (error) {
    if (isGroqTimeoutError(error)) {
      return jsonResponse(
        { error: "Groq took too long to respond. Please try again in a moment." },
        { status: 504 },
      );
    }
    return jsonResponse(
      { error: "Could not reach Groq. Check the deployment’s network configuration and try again." },
      { status: 502 },
    );
  }

  if (!upstream.ok) {
    let upstreamMessage = "";
    try {
      const errorResult = await upstream.json();
      upstreamMessage = errorResult.error?.message || "";
    } catch {
      upstreamMessage = "";
    }

    if (upstream.status === 429) {
      return jsonResponse(
        { error: "Groq’s rate or usage limit was reached. Check your Groq limits, then try again." },
        { status: 429 },
      );
    }
    if (upstream.status === 401 || upstream.status === 403) {
      return jsonResponse(
        { error: "Groq rejected the configured API key. Check that the key is valid." },
        { status: 502 },
      );
    }
    if (upstream.status === 404) {
      return jsonResponse(
        { error: formatGroqError(upstream.status, model, upstreamMessage) },
        { status: 502 },
      );
    }
    return jsonResponse(
      { error: formatGroqError(upstream.status, model, upstreamMessage) },
      { status: 502 },
    );
  }

  let result;
  try {
    result = await upstream.json();
  } catch {
    return jsonResponse({ error: "Groq returned an unreadable response." }, { status: 502 });
  }

  const body = extractGroqChatText(result);

  if (getGroqFinishReason(result) === "length") {
    return jsonResponse(
      { error: "Groq reached its response limit before finishing the draft. Please try generating again." },
      { status: 502 },
    );
  }

  if (!isCompleteEmailBody(body)) {
    return jsonResponse(
      { error: "Groq returned an incomplete email draft. Please try generating again; no incomplete text was returned as a usable draft." },
      { status: 502 },
    );
  }

  return jsonResponse({ body });
}

function requestGroq(apiKey, model, messages) {
  return fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages,
      max_completion_tokens: GROQ_MAX_COMPLETION_TOKENS,
      reasoning_effort: "low",
      include_reasoning: false,
      temperature: 0.4,
    }),
    signal: AbortSignal.timeout(GROQ_REQUEST_TIMEOUT_MS),
  });
}
