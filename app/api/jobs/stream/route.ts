import { NextRequest } from "next/server";
import { codingAgent } from "@/utils/agent";
import { auth } from "@/lib/auth";
import { getGithubAccessToken } from "@/db/users";

export const runtime = "nodejs";

function sseTransform(controller: ReadableStreamDefaultController, event: string, data: unknown) {
  controller.enqueue(new TextEncoder().encode(`event: ${event}\n`));
  controller.enqueue(new TextEncoder().encode(`data: ${typeof data === "string" ? data : JSON.stringify(data)}\n\n`));
}

export async function POST(req: NextRequest) {
  const { repo, task } = await req.json();
  if (!task || typeof task !== "string") {
    return new Response("Missing task", { status: 400 });
  }

  const repoUrl = repo?.startsWith("http") ? repo : repo ? `https://github.com/${repo}` : undefined;
  const user = await auth.api.getSession({ headers: req.headers, asResponse: false });
  console.log("--- User", user);
  const acc = await getGithubAccessToken(user?.user.id as string);
  console.log("--- Access Token", acc);
  const accessToken = {
    email: user?.user.email,
    token: acc
  } as { email: string; token: string };

  const stream = new ReadableStream({ 
    start(controller) {
      sseTransform(controller, "open", "ok");
      const ping = setInterval(() => sseTransform(controller, "ping", Date.now()), 15000);
      // Run async and stream logs
      (async () => {
        try {
          const result = await codingAgent(task, repoUrl, accessToken, (msg: unknown) => {
            try {
              if (msg && typeof msg === "object" && "event" in msg && "data" in msg) {
                const { event, data } = msg as { event: unknown; data: unknown };
                if (typeof event === "string") {
                  sseTransform(controller, event, data);
                  return;
                }
              }
              sseTransform(controller, "log", msg);
            } catch {
              sseTransform(controller, "log", msg);
            }
          });
          sseTransform(controller, "result", result);
          sseTransform(controller, "end", "done");
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          sseTransform(controller, "error", msg);
        } finally {
          clearInterval(ping);
          controller.close();
        }
      })();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
