import { NextRequest, NextResponse } from "next/server";
import { codingAgent } from "@/utils/agent";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { repo, task } = body || {};
  if (!task || typeof task !== "string") {
    return NextResponse.json({ error: "Missing task" }, { status: 400 });
  }

  try {
    // repo can be a full name like owner/name; map to https URL if needed
    const repoUrl = repo?.startsWith("http")
      ? repo
      : repo
        ? `https://github.com/${repo}`
        : undefined;

    const result = await codingAgent(task, repoUrl);
    return NextResponse.json({ jobId: "job_" + Math.random().toString(36).slice(2), result });
  } catch (e) {
    console.error("Agent error:", e);
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
