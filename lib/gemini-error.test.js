import assert from "node:assert/strict";
import test from "node:test";
import { formatGeminiError } from "./gemini-error.js";

test("explains Gemini 404 model errors and includes Google's diagnostic", () => {
  const message = formatGeminiError(
    404,
    "gemini-3.8-flash",
    "models/gemini-3.8-flash is not found for API version v1beta",
  );
  assert.match(message, /could not find or use model "gemini-3\.8-flash"/);
  assert.match(message, /GEMINI_MODEL/);
  assert.match(message, /Interactions API/);
  assert.match(message, /Google says: models\/gemini-3\.8-flash is not found/);
});

test("bounds and strips control characters from upstream diagnostics", () => {
  const message = formatGeminiError(500, "gemini-2.5-flash", `bad\nmessage${"x".repeat(500)}`);
  assert.doesNotMatch(message, /[\u0000-\u001f\u007f]/);
  assert.ok(message.length < 500);
});

test("provides a fallback when upstream response has no message", () => {
  assert.equal(formatGeminiError(503, "gemini-2.5-flash"), "Gemini returned an error (503). Try again later.");
});
