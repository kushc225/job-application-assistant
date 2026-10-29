import { NextResponse } from "next/server";
import { redactContactDetails } from "@/lib/job-post";
import { enforceRateLimit } from "@/lib/rate-limit";
import { formatGeminiError } from "@/lib/gemini-error";
import {
  buildGeminiInteractionInput,
  extractGeminiInteractionText,
} from "@/lib/gemini-interactions";

const MAX_JOB_LENGTH = 20000;
const MAX_PROFILE_LENGTH = 4000;
const MAX_REQUEST_BYTES = 128000;

function jsonResponse(body, init) {
  const response = NextResponse.json(body, init);
  response.headers.set("Cache-Control", "no-store");
  return response;
}

export async function POST(request) {
  const apiKey = process.env.GEMINI_API_KEY;
  const model = process.env.GEMINI_MODEL || "gemini-3.8-flash";

  if (!request.headers.get("content-type")?.includes("application/json")) {
    return jsonResponse({ error: "Content-Type must be application/json." }, { status: 415 });
  }
  if (Number(request.headers.get("content-length")) > MAX_REQUEST_BYTES) {
    return jsonResponse({ error: "Request body is too large." }, { status: 413 });
  }

  if (!apiKey) {
    return jsonResponse(
      { error: "Gemini isn’t configured yet. Add GEMINI_API_KEY as a server secret." },
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
  let upstream;
  try {
    upstream = await fetch(
      "https://generativelanguage.googleapis.com/v1beta/interactions",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": apiKey,
        },
        body: JSON.stringify({
          model,
          input: buildGeminiInteractionInput({
            role,
            company,
            profileHighlights: sanitizedHighlights,
            jobDescription: sanitizedJob,
          }),
          generation_config: {
            max_output_tokens: 400,
            temperature: 0.6,
          },
          store: false,
        }),
      },
    );
  } catch {
    return jsonResponse(
      { error: "Could not reach Gemini. Check the deployment’s network configuration and try again." },
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
        { error: "Gemini’s free-tier limit was reached. Wait for the quota to reset, then try again." },
        { status: 429 },
      );
    }
    if (upstream.status === 401 || upstream.status === 403) {
      return jsonResponse(
        { error: "Gemini rejected the configured API key. Check that the key and project are correct." },
        { status: 502 },
      );
    }
    if (upstream.status === 404) {
      return jsonResponse(
        { error: formatGeminiError(upstream.status, model, upstreamMessage) },
        { status: 502 },
      );
    }
    return jsonResponse(
      { error: formatGeminiError(upstream.status, model, upstreamMessage) },
      { status: 502 },
    );
  }

  let result;
  try {
    result = await upstream.json();
  } catch {
    return jsonResponse({ error: "Gemini returned an unreadable response." }, { status: 502 });
  }

  const body = extractGeminiInteractionText(result);

  if (!body) {
    return jsonResponse(
      { error: "Gemini did not return an email draft. Try editing the job post and retry." },
      { status: 502 },
    );
  }

  return jsonResponse({ body });
}
