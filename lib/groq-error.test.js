import assert from "node:assert/strict";
import test from "node:test";
import { formatGroqError } from "./groq-error.js";

test("explains Groq 404 model errors and includes the upstream diagnostic", () => {
  const message = formatGroqError(
    404,
    "openai/gpt-oss-120b",
    "The model does not exist or is unavailable",
  );
  assert.match(message, /could not find or use model "openai\/gpt-oss-120b"/);
  assert.match(message, /GROQ_MODEL/);
  assert.match(message, /Groq says: The model does not exist/);
});

test("bounds and strips control characters from upstream diagnostics", () => {
  const message = formatGroqError(500, "openai/gpt-oss-120b", `bad\nmessage${"x".repeat(500)}`);
  assert.match(message, /Groq returned an error \(500\)\. bad message/);
  assert.equal(message.includes("\n"), false);
  assert.ok(message.length < 500);
});

test("provides a fallback when upstream response has no message", () => {
  assert.equal(formatGroqError(503, "openai/gpt-oss-120b"), "Groq returned an error (503). Try again later.");
});
