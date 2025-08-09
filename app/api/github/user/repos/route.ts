import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/db/client";
import { eq } from "drizzle-orm";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

type Repo = { id: number; full_name: string; private: boolean };

export async function GET(request: NextRequest) {
  try {
    // Get Better Auth session and extract provider token if available
    let token: string | undefined;
    try {
      const sessionRes = await auth.api.getSession({ headers: request.headers, asResponse: false });
      const account = await db.select().from("account").where(eq(sessionRes?.user.id, "userId"));
      console.log(account);
      // type Sess = { session?: { accessToken?: string } };
      // token = (sessionRes as Sess)?.session?.accessToken;

    } catch { }

    // Fallback to server PAT if user token missing
    // if (!token) token = process.env.GITHUB_TOKEN;
    if (!token) return NextResponse.json({ repos: [] }, { status: 200 });

    const ghRes = await fetch("https://api.github.com/user/repos?per_page=100&type=all&sort=updated", {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        "User-Agent": "coding-agent-app",
      },
      cache: "no-store",
    });

    if (!ghRes.ok) {
      const text = await ghRes.text().catch(() => "");
      console.error("GitHub API error", ghRes.status, text);
      return NextResponse.json({ repos: [] }, { status: 200 });
    }

    const data = (await ghRes.json()) as Array<Repo>;
    const repos = Array.isArray(data)
      ? data.map((r) => ({ id: r.id, full_name: r.full_name, private: !!r.private }))
      : [];

    return NextResponse.json({ repos }, { status: 200 });
  } catch (e) {
    console.error("Failed to list repos", e);
    return NextResponse.json({ repos: [] }, { status: 200 });
  }
}
