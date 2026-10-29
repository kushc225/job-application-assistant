import assert from "node:assert/strict";
import test from "node:test";
import {
  buildGeminiInteractionInput,
  extractGeminiInteractionText,
} from "./gemini-interactions.js";

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
