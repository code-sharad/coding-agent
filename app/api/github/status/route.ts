import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  try {
    const origin = request.nextUrl.origin;
    const res = await fetch(`${origin}/api/auth/get-session`, {
      headers: {
        cookie: request.headers.get("cookie") || "",
      },
    });
    const data = await res.json().catch(() => ({}));
    const authed = Boolean(data?.user);
    return NextResponse.json({ authed, user: data?.user ?? null });
  } catch {
    return NextResponse.json({ authed: false }, { status: 200 });
  }
}
