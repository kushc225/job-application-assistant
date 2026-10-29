import assert from "node:assert/strict";
import test from "node:test";
import {
  buildGeminiInteractionInput,
  extractGeminiInteractionText,
  fetchGeminiWithFallback,
  GEMINI_FALLBACK_MODEL,
  getGeminiFallbackModel,
} from "./gemini-interactions.js";

test("selects one distinct fallback model without looping", () => {
  assert.equal(getGeminiFallbackModel("gemini-3.8-flash"), GEMINI_FALLBACK_MODEL);
  assert.equal(getGeminiFallbackModel("gemini-2.5-flash"), GEMINI_FALLBACK_MODEL);
  assert.equal(getGeminiFallbackModel(GEMINI_FALLBACK_MODEL), null);
});

test("retries one supported fallback after primary 503 and marks successful fallback", async () => {
  const requestedModels = [];
  const result = await fetchGeminiWithFallback(async (model) => {
    requestedModels.push(model);
    return model === "gemini-3.8-flash"
      ? new Response("", { status: 503 })
      : new Response("success", { status: 200 });
  }, "gemini-3.8-flash");

  assert.deepEqual(requestedModels, ["gemini-3.8-flash", GEMINI_FALLBACK_MODEL]);
  assert.equal(result.response.status, 200);
  assert.equal(result.usedFallback, true);
});

test("does not fallback for non-503 errors or loop when fallback is already selected", async () => {
  let requestCount = 0;
  const rateLimited = await fetchGeminiWithFallback(async () => {
    requestCount += 1;
    return new Response("", { status: 429 });
  }, "gemini-3.8-flash");
  assert.equal(requestCount, 1);
  assert.equal(rateLimited.usedFallback, false);

  const unavailable = await fetchGeminiWithFallback(async () => {
    requestCount += 1;
    return new Response("", { status: 503 });
  }, GEMINI_FALLBACK_MODEL);
  assert.equal(requestCount, 2);
  assert.equal(unavailable.response.status, 503);
  assert.equal(unavailable.usedFallback, false);
});

test("builds an instruction-led prompt with job and profile data clearly delimited", () => {
  const input = buildGeminiInteractionInput({
    role: "DevOps Engineer",
    company: "Example Corp",
    profileHighlights: "Built CI/CD pipelines.",
    jobDescription: "Hiring for DevOps.",
  });

  assert.match(input, /^Instructions: Write a concise, warm, professional/);
  assert.match(input, /<untrusted_job_application_data>/);
  assert.match(input, /Role: DevOps Engineer/);
  assert.match(input, /Company: Example Corp/);
  assert.match(input, /Applicant profile facts:\nBuilt CI\/CD pipelines\./);
  assert.match(input, /Redacted job post:\nHiring for DevOps\./);
  assert.match(input, /<\/untrusted_job_application_data>$/);
});

test("extracts only text from model output steps", () => {
  const result = {
    steps: [
      { type: "user_input", content: [{ type: "text", text: "Do not return this." }] },
      {
        type: "model_output",
        content: [
          { type: "text", text: "Hello, " },
          { type: "image", data: "not text" },
          { type: "text", text: "I am interested." },
        ],
      },
    ],
  };

  assert.equal(extractGeminiInteractionText(result), "Hello, I am interested.");
  assert.equal(extractGeminiInteractionText({ steps: [] }), "");
  assert.equal(extractGeminiInteractionText({ candidates: [] }), "");
});
