import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";

// Minimal GitHub repo type
interface Repo {
  id: number;
  full_name: string;
  private: boolean;
  owner?: { login: string };
}

interface SessionResult {
  session?: {
    accessToken?: string;
  };
}

export async function GET(request: Request) {
  // Try to read session using Better Auth API (Next.js route)
  let token: string | undefined;
  try {
    const sessionRes = (await auth.api.getSession({
      headers: request.headers,
      asResponse: false,
    })) as unknown as SessionResult | null;
    token = sessionRes?.session?.accessToken;
  } catch {
    // ignore and fallback below
  }

  // Fallback to env token for server-side operations if user token is unavailable
  if (!token) token = process.env.GITHUB_TOKEN;
  if (!token) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  // Fetch repos from GitHub API
  const res = await fetch("https://api.github.com/user/repos?per_page=100", {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
    },
    next: { revalidate: 60 }, // cache briefly
  });

  if (!res.ok) {
    const msg = await res.text().catch(() => "");
    return NextResponse.json(
      { error: "Failed to fetch repos", detail: msg || res.statusText },
      { status: 500 }
    );
  }

  const data: Repo[] = await res.json();
  console.log(data)
  const repos = Array.isArray(data)
    ? data.map((repo) => ({
      id: repo.id,
      full_name: repo.full_name,
      private: repo.private,
      owner: repo.owner?.login,
    }))
    : [];

  return NextResponse.json({ repos });
}
