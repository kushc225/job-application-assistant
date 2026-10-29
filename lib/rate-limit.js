import { getCloudflareContext } from "@opennextjs/cloudflare";
import { NextResponse } from "next/server";

export async function enforceRateLimit(request, bindingName, message) {
  if (process.env.NODE_ENV === "development") return null;

  try {
    const { env } = await getCloudflareContext({ async: true });
    const ip = request.headers.get("cf-connecting-ip");
    const binding = env[bindingName];

    if (!ip || !binding) {
      return NextResponse.json(
        { error: "Rate limiting is not configured." },
        { status: 503, headers: { "Cache-Control": "no-store" } },
      );
    }

    const { success } = await binding.limit({ key: ip });
    if (!success) {
      return NextResponse.json(
        { error: message },
        { status: 429, headers: { "Cache-Control": "no-store" } },
      );
    }
    return null;
  } catch {
    return NextResponse.json(
      { error: "Rate limiting is unavailable." },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}
