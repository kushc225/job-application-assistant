import assert from "node:assert/strict";
import test from "node:test";
import {
  buildGroqMessages,
  extractGroqChatText,
  fetchGroqWithRetry,
  getGroqFinishReason,
  GROQ_MODEL,
  GROQ_MAX_COMPLETION_TOKENS,
  isCompleteEmailBody,
  isGroqTimeoutError,
} from "./groq-chat.js";

test("uses the tested Groq chat model as the default", () => {
  assert.equal(GROQ_MODEL, "openai/gpt-oss-120b");
  assert.equal(GROQ_MAX_COMPLETION_TOKENS, 1200);
});

test("reads the Groq completion finish reason", () => {
  assert.equal(getGroqFinishReason({ choices: [{ finish_reason: "stop" }] }), "stop");
  assert.equal(getGroqFinishReason({ choices: [{ finish_reason: "length" }] }), "length");
  assert.equal(getGroqFinishReason({ choices: [] }), "");
});

test("retries one temporary 503 with the same model", async () => {
  const requestedModels = [];
  const response = await fetchGroqWithRetry(async (model) => {
    requestedModels.push(model);
    return requestedModels.length === 1
      ? new Response("", { status: 503 })
      : new Response("success", { status: 200 });
  }, GROQ_MODEL, { retryDelayMs: 0 });

  assert.deepEqual(requestedModels, [GROQ_MODEL, GROQ_MODEL]);
  assert.equal(response.status, 200);
});

test("does not retry non-503 responses", async () => {
  let requestCount = 0;
  const response = await fetchGroqWithRetry(async () => {
    requestCount += 1;
    return new Response("", { status: 429 });
  }, GROQ_MODEL);

  assert.equal(requestCount, 1);
  assert.equal(response.status, 429);
});

test("builds separate system instructions and delimited user facts", () => {
  const messages = buildGroqMessages({
    role: "DevOps Engineer",
    company: "Example Corp",
    profileHighlights: "Built CI/CD pipelines.",
    jobDescription: "Hiring for DevOps.",
  });

  assert.equal(messages.length, 2);
  assert.equal(messages[0].role, "system");
  assert.match(messages[0].content, /Do not include a subject line/);
  assert.match(messages[0].content, /claim that a resume is attached/);
  assert.equal(messages[1].role, "user");
  assert.match(messages[1].content, /<untrusted_job_application_data>/);
  assert.match(messages[1].content, /Role: DevOps Engineer/);
  assert.match(messages[1].content, /Company: Example Corp/);
  assert.match(messages[1].content, /Applicant profile facts:\nBuilt CI\/CD pipelines\./);
  assert.match(messages[1].content, /Redacted job post:\nHiring for DevOps\./);
  assert.match(messages[1].content, /<\/untrusted_job_application_data>$/);
});

test("extracts only assistant message content, excluding reasoning", () => {
  const result = {
    choices: [{
      message: {
        content: "  Hello, I am interested in applying.  ",
        reasoning: "This private reasoning field must not be used.",
      },
    }],
  };
  assert.equal(extractGroqChatText(result), "Hello, I am interested in applying.");
  assert.equal(extractGroqChatText({ choices: [] }), "");
  assert.equal(extractGroqChatText({ choices: [{ message: { content: null } }] }), "");
});

test("detects request timeouts", () => {
  assert.equal(isGroqTimeoutError({ name: "TimeoutError" }), true);
  assert.equal(isGroqTimeoutError({ name: "AbortError" }), true);
  assert.equal(isGroqTimeoutError(new Error("Connection failed")), false);
});

test("rejects fragments, labels, placeholders, and unfinished sentences", () => {
  assert.equal(isCompleteEmailBody("Body:* State interest in joining the team in"), false);
  assert.equal(isCompleteEmailBody("Subject: Applying for the job."), false);
  assert.equal(isCompleteEmailBody("I would love to apply for this role."), false);
  assert.equal(isCompleteEmailBody(`${"I am interested in applying. ".repeat(20)}unfinished`), false);
  assert.equal(isCompleteEmailBody(`I am interested in applying. ${"[Your Name]"}`), false);
});

test("accepts a complete plain-text email body within the requested length", () => {
  const body = [
    "I am writing to express my interest in the software engineering opportunity at your company.",
    "My experience includes building reliable services and collaborating with teams to deliver practical improvements.",
    "I would welcome the chance to discuss how my background and skills could support your current goals.",
    "Thank you for considering my application, and I look forward to hearing from you.",
  ].join(" ");

  assert.equal(isCompleteEmailBody(body), true);
});
