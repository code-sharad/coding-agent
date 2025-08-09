import { NextRequest, NextResponse } from "next/server";
import Database from "better-sqlite3";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ColumnInfo = { name: string };

function pickColumn(cols: ColumnInfo[], candidates: string[]): string | null {
  const names = cols.map((c) => c.name.toLowerCase());
  for (const cand of candidates) {
    const idx = names.indexOf(cand.toLowerCase());
    if (idx !== -1) return cols[idx].name;
  }
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
    if (!user?.id) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

    const token = getGithubTokenForUser(String(user.id));
    if (!token) {
      return NextResponse.json({ error: "No GitHub token found" }, { status: 404 });
    }

    // Check what scopes the token has
    const userRes = await fetch("https://api.github.com/user", {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github+json",
      },
    });

    const scopes = userRes.headers.get("x-oauth-scopes") || "";
    const scopesList = scopes.split(",").map(s => s.trim()).filter(Boolean);

    // Also check rate limits
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
