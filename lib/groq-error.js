export function formatGroqError(status, model, upstreamMessage = "") {
  const safeMessage = upstreamMessage
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .slice(0, 400)
    .trim();

  if (status === 404) {
    return [
      `Groq could not find or use model "${model}". Check that GROQ_MODEL is an available Groq model ID.`,
      safeMessage ? `Groq says: ${safeMessage}` : "",
    ].filter(Boolean).join(" ");
  }

  return [
    `Groq returned an error (${status}).`,
    safeMessage || "Try again later.",
  ].filter(Boolean).join(" ");
}
