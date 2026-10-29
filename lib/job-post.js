export function parseJobPost(text) {
  const content = text.replace(/\r\n?/g, "\n");
  const email = content.match(
    /(?:mailto:)?([a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,})/i,
  )?.[1] ?? "";
  const roleMatch =
    content.match(/hiring\s*:\s*([^|\n]+)/i) ??
    content.match(/^[^\S\n]*[^A-Za-z0-9\n]*([A-Za-z][^|\n]*?)\s*[|—-]\s*/m);
  const companyLink = content.match(/\bjoin\s+\[([^\]]+)\]\((?!mailto:)[^)]+\)/i);
  const companyLine = content.match(/\bjoin\s+(.+?)(?:\s+and\b|[!.?\n])/i);
  const location = content.match(/(?:📍\s*)?location\s*:\s*([^\n]+)/i)?.[1];
  const experience = content.match(/(?:💻\s*)?experience\s*:\s*([^\n]+)/i)?.[1];

  return {
    email: cleanInlineText(email),
    role: cleanInlineText(roleMatch?.[1] ?? ""),
    company: cleanInlineText(companyLink?.[1] ?? companyLine?.[1] ?? ""),
    location: cleanInlineText(location ?? ""),
    experience: cleanInlineText(experience ?? ""),
  };
}

export function redactContactDetails(text) {
  return text
    .replace(/mailto:\s*[^\s)>]+/gi, "[application contact removed]")
    .replace(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi, "[email removed]")
    .replace(/https?:\/\/\S+|www\.\S+/gi, "[link removed]")
    .replace(/(?<!\w)\+?\d[\d\s().-]{7,}\d(?!\w)/g, "[phone number removed]");
}

function cleanInlineText(value) {
  return value
    .replace(/\*{1,2}/g, "")
    .replace(/[_`]/g, "")
    .replace(/<[^>]*>/g, "")
    .trim()
    .replace(/\s+/g, " ");
}
