import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    let token: string | undefined;
    try {
      const sessionRes = await auth.api.getSession({ headers: request.headers, asResponse: false });
      type Sess = { session?: { accessToken?: string } };
      token = (sessionRes as Sess)?.session?.accessToken;
    } catch { }

    if (!token) token = process.env.GITHUB_TOKEN;
    if (!token) return NextResponse.json({ error: "No GitHub token available" }, { status: 401 });

    const userRes = await fetch("https://api.github.com/user", {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github+json",
      },
    });

    const scopes = userRes.headers.get("x-oauth-scopes") || "";
    const scopesList = scopes.split(",").map((s) => s.trim()).filter(Boolean);

    const rateLimitRes = await fetch("https://api.github.com/rate_limit", {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github+json",
      },
    });

    const rateLimit = await rateLimitRes.json();

    return NextResponse.json({
      scopes: scopesList,
      hasRepoScope: scopesList.includes("repo"),
      rateLimit: rateLimit.rate,
      user: await userRes.json(),
    });
  } catch (e) {
    console.error("Failed to check GitHub status", e);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
