export function formatGeminiError(status, model, upstreamMessage = "") {
  const safeMessage = upstreamMessage
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .slice(0, 400)
    .trim();

  if (status === 404) {
    return [
      `Gemini could not find or use model "${model}". Check that GEMINI_MODEL is a model ID supported by the Gemini Developer API Interactions API.`,
      safeMessage ? `Google says: ${safeMessage}` : "",
    ].filter(Boolean).join(" ");
  }

  return [
    `Gemini returned an error (${status}).`,
    safeMessage || "Try again later.",
  ].filter(Boolean).join(" ");
}
