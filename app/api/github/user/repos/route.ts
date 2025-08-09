import { NextRequest, NextResponse } from "next/server";
import Database from "better-sqlite3";

// Ensure this route runs on the Node.js runtime (not Edge) so native sqlite works
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

type ColumnInfo = { name: string };

function pickColumn(cols: ColumnInfo[], candidates: string[]): string | null {
  const names = cols.map((c) => c.name.toLowerCase());
  for (const cand of candidates) {
    const idx = names.indexOf(cand.toLowerCase());
    if (idx !== -1) return cols[idx].name; // return original-cased name
  }
  // fuzzy: contains
  for (const c of cols) {
    const n = c.name.toLowerCase();
    if (candidates.some((cand) => n.includes(cand.toLowerCase()))) return c.name;
  }
  return null;
}

async function getSessionUser(request: NextRequest): Promise<{ id?: string } | null> {
  const origin = request.nextUrl.origin;
  const sessRes = await fetch(`${origin}/api/auth/get-session`, {
    headers: { cookie: request.headers.get("cookie") || "" },
    cache: "no-store",
  });
  const data = await sessRes.json().catch(() => ({}));
  return data?.user ?? null;
}

function getGithubTokenForUser(userId: string): string | null {
  try {
    const db = new Database("./auth.db", { readonly: true });
    // Find accounts-like table name
    const tbls = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND lower(name) LIKE '%account%'")
      .all() as { name: string }[];
    const accountsTable = tbls.find((t) => t.name.toLowerCase() === "accounts")?.name || tbls[0]?.name;
    if (!accountsTable) return null;

    const pragma = db.prepare(`PRAGMA table_info(${accountsTable})`).all() as ColumnInfo[];
    if (!pragma || pragma.length === 0) return null;

    const providerCol = pickColumn(pragma, ["provider", "provider_id", "providerId"]);
    const userIdCol = pickColumn(pragma, ["user_id", "userId"]);
    const accessTokenCol = pickColumn(pragma, ["access_token", "accessToken", "token"]);

    if (!providerCol || !userIdCol || !accessTokenCol) return null;

    // Prefer provider rows that look like github
    // Try strict match first, then LIKE fallback
    let row = db
      .prepare(
        `SELECT ${accessTokenCol} as token FROM ${accountsTable} WHERE ${providerCol} = @provider AND ${userIdCol} = @userId ORDER BY rowid DESC LIMIT 1`
      )
      .get({ provider: "github", userId }) as { token?: string } | undefined;

    if (!row?.token) {
      row = db
        .prepare(
          `SELECT ${accessTokenCol} as token FROM ${accountsTable} WHERE lower(${providerCol}) LIKE '%github%' AND ${userIdCol} = @userId ORDER BY rowid DESC LIMIT 1`
        )
        .get({ userId }) as { token?: string } | undefined;
    }

    return row?.token ?? null;
  } catch (e) {
    console.error("Failed to read GitHub token from DB", e);
    return null;
  }
}

export async function GET(request: NextRequest) {
  try {
    const user = await getSessionUser(request);
    if (!user?.id) return NextResponse.json({ repos: [] }, { status: 200 });

    const token = getGithubTokenForUser(String(user.id));
    if (!token) {
      // No token found yet (user not connected or schema mismatch); return empty list gracefully
      return NextResponse.json({ repos: [] }, { status: 200 });
    }

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

      // Debug: Log the token scopes to see what permissions we have
      const tokenInfoRes = await fetch("https://api.github.com/user", {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/vnd.github+json",
        },
      });

      if (tokenInfoRes.ok) {
        const scopes = tokenInfoRes.headers.get("x-oauth-scopes");
        console.log("Current OAuth scopes:", scopes);
      }

      return NextResponse.json({ repos: [] }, { status: 200 });
    }

    const data = (await ghRes.json()) as Array<{ id: number; full_name: string; private: boolean }>; // narrow mapping later
    const repos = Array.isArray(data)
      ? data.map((r) => ({ id: r.id, full_name: r.full_name, private: r.private || false }))
      : [];

    console.log(`Found ${repos.length} repositories (${repos.filter(r => r.private).length} private)`);
    return NextResponse.json({ repos }, { status: 200 });
  } catch (e) {
    console.error("Failed to list repos", e);
    return NextResponse.json({ repos: [] }, { status: 200 });
  }
}
