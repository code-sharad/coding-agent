"use client";

import React, { useEffect, useRef, useState, useCallback, useMemo } from "react";
import { Github, Play, Wand2, ShieldCheck, GitBranch, GitPullRequest, FileCode, Terminal, Rocket } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea"

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useSession, signIn } from "@/lib/auth-client";
import Image from "next/image";
import confetti from "canvas-confetti";

type Repo = { id: number; full_name: string };
type FileListEvent = { path: string; output: string };
type FileDiffEvent = { path: string; before: string; after: string };
type PRCreatedEvent = { url: string; branch?: string };

export default function Home() {
  const session = useSession();
  // Derive a loading flag from common shapes (status/isLoading/isPending)
  const sessionLoading = useMemo(() => {
    const s = session as unknown;
    if (s && typeof s === "object") {
      const o = s as Record<string, unknown>;
      if (typeof o.status === "string") return o.status === "loading";
      if (typeof o.isLoading === "boolean") return Boolean(o.isLoading);
      if (typeof o.isPending === "boolean") return Boolean(o.isPending);
    }
    return false;
  }, [session]);
  const authed = !!session.data?.user;
  // Step state
  const [repos, setRepos] = useState<Repo[]>([]);
  const [selectedRepo, setSelectedRepo] = useState<string>("");
  const [task, setTask] = useState("");
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState(0);
  const [logs, setLogs] = useState<string[]>([]);
  const [fileLists, setFileLists] = useState<FileListEvent[]>([]);
  const [fileDiffs, setFileDiffs] = useState<FileDiffEvent[]>([]);
  const [pr, setPr] = useState<PRCreatedEvent | null>(null);
  const [view, setView] = useState<"logs" | "files" | "diffs">("logs");
  const [showConnect, setShowConnect] = useState(false);
  const [reposLoading, setReposLoading] = useState(false);
  const [connectLoading, setConnectLoading] = useState(false);

  const fetchRepos = useCallback(async () => {
    if (!authed) return;
    setReposLoading(true);
    try {
      const r = await fetch("/api/github/user/repos", { cache: "no-store" });
      const d = await r.json();
      setRepos(d.repos ?? []);
    } catch (e) {
      console.error(e);
      setRepos([]);
    } finally {
      setReposLoading(false);
    }
  }, [authed]);

  // Load repos when authed; show connect dialog otherwise
  useEffect(() => {
    if (sessionLoading) return; // don't toggle UI while session is fetching
    if (!authed) {
      setShowConnect(true);
      setRepos([]);
      return;
    }
    setShowConnect(false);
    fetchRepos();
  }, [authed, fetchRepos, sessionLoading]);

  const canRun = useMemo(() => authed && selectedRepo && task.trim().length > 5, [authed, selectedRepo, task]);

  const handleConnect = async () => {
    if (connectLoading) return;
    setConnectLoading(true);
    try {
      await signIn.social({ provider: "github" });
    } catch {
      // If sign-in fails (no redirect), re-enable the button
      setConnectLoading(false);
    }
  };

  const logRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight });
  }, [logs]);

  // Confetti when PR is created
  useEffect(() => {
    if (pr?.url) {
      const end = Date.now() + 800;
      const colors = ["#7ee787", "#56d364", "#2ea043", "#79c0ff", "#1f6feb"];
      const frame = () => {
        confetti({
          particleCount: 10,
          spread: 100,
          startVelocity: 125,
          gravity: 1.3,
          ticks: 150,
          origin: { x: -0.1, y: 1 },
          colors,
          angle: 60
        });
        if (Date.now() < end) requestAnimationFrame(frame);
      };
      frame();
    }
  }, [pr]);

  const runAgent = async () => {
    setRunning(true);
    setLogs([`Starting agent on ${selectedRepo}…`, `Task: ${task}`]);
    setFileLists([]);
    setFileDiffs([]);
    setPr(null);
    setProgress(10);
    try {
      const res = await fetch("/api/jobs/stream", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ repo: selectedRepo, task }),
      });

      if (!res.body) throw new Error("No response body");

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      const processChunk = (chunk: string) => {
        buffer += chunk;
        const parts = buffer.split("\n\n");
        buffer = parts.pop() || "";
        for (const part of parts) {
          const lines = part.split("\n");
          let event = "message";
          let data = "";
          for (const line of lines) {
            if (line.startsWith("event:")) event = line.slice(6).trim();
            else if (line.startsWith("data:")) data += line.slice(5).trim();
          }
          // Attempt to parse JSON payloads
          let parsed: unknown = data;
          try {
            if (data && (data.startsWith("{") || data.startsWith("["))) {
              parsed = JSON.parse(data);
            }
          } catch {
            parsed = data;
          }

          if (event === "log") {
            if (typeof parsed === "string") setLogs((l) => [...l, parsed]);
            else if (parsed && typeof parsed === "object") setLogs((l) => [...l, JSON.stringify(parsed)]);
            setProgress((p) => (p < 95 ? Math.min(95, p + 3) : p));
          }
          if (event === "file_list") {
            try {
              if (parsed && typeof parsed === "object" && parsed !== null && "output" in parsed) {
                const obj = parsed as Record<string, unknown>;
                const pathVal = typeof obj.path === "string" ? obj.path : ".";
                const outputVal = String(obj.output ?? "");
                setFileLists((cur) => [...cur, { path: pathVal, output: outputVal }]);
                if (view !== "files") setView("files");
              }
            } catch { }
          }
          if (event === "file_diff") {
            try {
              if (parsed && typeof parsed === "object" && parsed !== null && "before" in parsed && "after" in parsed) {
                const obj = parsed as Record<string, unknown>;
                const pathVal = typeof obj.path === "string" ? obj.path : "";
                const beforeVal = typeof obj.before === "string" ? obj.before : String(obj.before ?? "");
                const afterVal = typeof obj.after === "string" ? obj.after : String(obj.after ?? "");
                setFileDiffs((cur) => [...cur, { path: pathVal, before: beforeVal, after: afterVal }]);
                if (view !== "diffs") setView("diffs");
              }
            } catch { }
          }
          if (event === "result") {
            let text: unknown = parsed;
            if (parsed && typeof parsed === "object" && "response" in (parsed as Record<string, unknown>)) {
              text = (parsed as Record<string, unknown>).response;
            }
            const out = typeof text === "string" ? text : JSON.stringify(text);
            setLogs((l) => [...l, "Agent response:", out]);
            setProgress((p) => (p < 98 ? 98 : p));
          }
          if (event === "pr_created") {
            try {
              if (parsed && typeof parsed === "object" && parsed !== null && "url" in parsed) {
                const obj = parsed as Record<string, unknown>;
                const url = typeof obj.url === "string" ? obj.url : "";
                const branch = typeof obj.branch === "string" ? obj.branch : undefined;
                setPr({ url, branch });
                setProgress(100);
              }
            } catch { }
          }
          if (event === "end") setProgress(100);
          if (event === "error") setLogs((l) => [...l, `Error: ${data}`]);
        }
      };

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        processChunk(decoder.decode(value, { stream: true }));
      }
      // flush remaining buffer (if any)
      if (buffer) processChunk(buffer);
    } catch (e) {
      console.error(e);
      setLogs((l) => [...l, `Error: ${(e as Error).message}`]);
    }
    setLogs((l) => [...l, "Done ✅"]);
    setRunning(false);
  };

  // While fetching session, show a lightweight loading view
  if (sessionLoading) {
    return (
      <div className="min-h-svh bg-background">
        <div className="mx-auto max-w-7xl px-5 py-8">
          <div className="border p-6 sm:p-8 md:p-10 min-h-[75svh] flex flex-col items-center justify-center gap-4">
            <div className="h-6 w-6 rounded-full border-2 border-muted-foreground border-t-transparent animate-spin" />
            <div className="text-sm text-muted-foreground">Checking your session…</div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-svh bg-background">
      <SubtleGridBackground />
      <div className="mx-auto max-w-7xl px-5 py-8 relative z-10">
        <Dialog
          open={showConnect}
          onOpenChange={(open) => (authed ? setShowConnect(open) : setShowConnect(true))}
        >
          <DialogContent
            hideClose
            className="sm:max-w-xl md:max-w-2xl p-0 overflow-hidden rounded-3xl border-0 shadow-2xl"
            onInteractOutside={(e) => e.preventDefault()}
            onEscapeKeyDown={(e) => e.preventDefault()}
          >
            <div className="relative isolate">
              {/* Soft gradient background */}
              <div className="pointer-events-none absolute inset-0 opacity-70">
                <div className="absolute -top-24 -left-24 h-72 w-72 rounded-full bg-gradient-to-br from-indigo-500/40 via-violet-500/30 to-cyan-400/30 blur-3xl" />
                <div className="absolute -bottom-24 -right-24 h-72 w-72 rounded-full bg-gradient-to-tr from-cyan-400/30 via-emerald-400/30 to-indigo-500/30 blur-3xl" />
              </div>

              {/* Header */}
              <div className="relative z-10 px-6 pt-6 pb-3 sm:px-8">
                <div className="inline-flex items-center gap-2 rounded-full border bg-white/5 px-3 py-1 text-xs text-foreground/80 backdrop-blur">
                  <span className="inline-flex h-1.5 w-1.5 rounded-full bg-emerald-400" />
                  AI-powered Code Agent
                </div>
                <DialogHeader>
                  <DialogTitle className="mt-3 font-serif text-3xl sm:text-4xl leading-tight">
                    <span className="bg-gradient-to-r from-white to-neutral-300 bg-clip-text text-transparent">
                      Build smarter with GitHub
                    </span>
                  </DialogTitle>
                  <DialogDescription className="mt-2 text-base text-muted-foreground">
                    Connect your GitHub to let the agent explore your repo, propose changes, and open PRs — all with live logs and safety.
                  </DialogDescription>
                </DialogHeader>
              </div>

              {/* Features */}
              <div className="relative z-10 px-6 pb-4 sm:px-8">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-1">
                  <Feature icon={<FileCode className="h-6 w-6" />} title="Repo-aware edits" desc="Reads your code and suggests precise changes." />
                  <Feature icon={<Terminal className="h-6 w-6" />} title="Live logs" desc="Streamed output and status as it works." />
                  <Feature icon={<GitBranch className="h-6 w-6" />} title="Sandboxed changes" desc="Isolated env; no local mess-ups." />
                  <Feature icon={<GitPullRequest className="h-6 w-6" />} title="Auto PRs" desc="Commits, pushes, and opens PRs for you." />
                  <Feature icon={<ShieldCheck className="h-6 w-6" />} title="Private-safe" desc="Per-user tokens; your access stays yours." />
                  <Feature icon={<Rocket className="h-6 w-6" />} title="Fast start" desc="Pick a repo, describe a task, run." />
                </div>
              </div>

              {/* Sticky footer */}
              <div className="z-10 sticky bottom-0 -mb-px border-t bg-background/80 backdrop-blur px-6 py-4 sm:px-8">
                <Button
                  onClick={handleConnect}
                  disabled={connectLoading || sessionLoading}
                  aria-busy={connectLoading}
                  size="lg"
                  className="w-full h-14 rounded-xl relative overflow-hidden border bg-[#0d1117] text-[#c9d1d9] hover:bg-[#161b22] transition-colors"
                >
                  <span className="absolute inset-0 opacity-0 group-hover:opacity-100 pointer-events-none" aria-hidden>
                    {/* subtle light sheen on hover */}
                  </span>
                  {connectLoading ? (
                    <span className="mr-2 inline-flex h-4 w-4 items-center justify-center">
                      <span className="h-4 w-4 animate-spin rounded-full border-2 border-[#8b949e] border-t-transparent" />
                    </span>
                  ) : (
                    <Github className="mr-2 h-4 w-4" />
                  )}
                  <span className="font-medium">{connectLoading ? "Connecting…" : "Continue with GitHub"}</span>
                </Button>
                <p className="mt-2 text-center text-[11px] text-muted-foreground">
                  By continuing, you agree to use your GitHub access only to list repos and open PRs on your behalf.
                </p>
              </div>
            </div>
          </DialogContent>
        </Dialog>
        <div className=" md:border bg-black/10 p-6 sm:p-8 md:p-10 min-h-[75svh] relative">
          {/* Header within bordered container */}
          <div className="flex items-center justify-between">
            <span className="text-md font-mono">Coding Agent</span>
            <button
              onClick={!authed ? handleConnect : undefined}
              disabled={!authed && (connectLoading || sessionLoading)}
              className="h-9 w-9 rounded-full border flex items-center justify-center"
              aria-label={authed ? "Account" : "Connect GitHub"}
              title={authed ? "Account" : "Connect GitHub"}
            >
              {!authed ? <Github className="h-4 w-4" /> : <Image className="rounded-full" width={36} height={36} src={`${session.data?.user?.image}`} alt="User Avatar" />}
            </button>
          </div>

          {/* Centered content */}
          <div className="mt-10 flex flex-col items-center gap-6">
            <h2 className="font-serif text-3xl flex justify-center items-center text-center">
              Hi
              {session.data?.user?.name ? (
                <span
                  className="ml-1 text-3xl align-middle  tracking-wide  "
                  style={{ fontFamily: 'var(--font-username), serif', fontStyle: '' }}
                >
                  {`, ${session.data.user.name}`}
                </span>
              ) : ", User"}
            </h2>

            {/* Select repo pill */}
            <div className="w-full max-w-xs ">
              <Select value={selectedRepo} onValueChange={setSelectedRepo} disabled={!authed || reposLoading}>
                <SelectTrigger className="rounded-xl bg-black">
                  <SelectValue placeholder={!authed ? "Connect GitHub first" : reposLoading ? "Loading repos…" : repos.length ? "Select Repo" : "No repos found"} />
                </SelectTrigger>
                <SelectContent>
                  {repos.map((r) => (
                    <SelectItem key={r.id} value={r.full_name}>
                      {r.full_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Large rounded prompt box with run button bottom-right */}
            <div className="relative w-full max-w-2xl">
              <div className="rounded-[2rem] bg-black border p-4 sm:p-5">
                <Textarea
                  className="min-h-40  resize-y border-0 focus-visible:ring-0 focus:outline-none bg-transparent"
                  placeholder="Describe the change you want to make…"
                  value={task}
                  onChange={(e) => setTask(e.target.value)}
                />
              </div>
              <div className="absolute bottom-8 right-8">
                <Button
                  variant="outline"
                  className="rounded-full"
                  onClick={runAgent}
                  disabled={!canRun || running}
                >
                  <Wand2 className="mr-2 h-4 w-4" /> {running ? "running…" : "Run agent"}
                </Button>
              </div>
            </div>

            {/* Progress underneath when running */}
            {(running || logs.length > 0 || fileLists.length > 0 || fileDiffs.length > 0) && (
              <div className="w-full max-w-2xl mt-8">
                <div className="flex items-center gap-2 text-sm">
                  <Play className="h-4 w-4 opacity-70" />
                  <span>{running ? "Working…" : progress === 100 ? "Completed" : "Idle"}</span>
                  <span className="ml-auto tabular-nums">{progress}%</span>
                </div>
                {pr && (
                  <div className="mt-2 rounded-md border bg-[#0d1117] text-[#c9d1d9] p-3 flex flex-col md:flex-row gap-2 items-start md:items-center justify-between">
                    <div className="text-sm">Pull request created{pr.branch ? ` on ${pr.branch}` : ""}.</div>
                    <a
                      className=""
                      href={pr.url}
                      target="_blank"
                      rel="noreferrer"
                    >
                      <Button variant="outline" className="text-xs  decoration-dotted text-[#7ee787] hover:cursor-pointer hover:text-[#56d364]">Open Pull Request →</Button>
                    </a>
                  </div>
                )}
                {pr?.branch ? "" : <Progress value={progress} className="mt-2" />}

                {/* View switcher */}
                <div className="mt-3 flex items-center gap-2 text-xs">
                  <button className={`px-3 py-1 rounded-full border ${view === "logs" ? "bg-primary text-primary-foreground" : "bg-muted"}`} onClick={() => setView("logs")}>Logs</button>
                  <button className={`px-3 py-1 rounded-full border ${view === "files" ? "bg-primary text-primary-foreground" : "bg-muted"}`} onClick={() => setView("files")}>Files</button>
                  <button className={`px-3 py-1 rounded-full border ${view === "diffs" ? "bg-primary text-primary-foreground" : "bg-muted"}`} onClick={() => setView("diffs")}>Diffs</button>
                </div>
                {/* Panels */}
                {view === "logs" && (
                  <div ref={logRef} className="rounded-md border bg-card mt-3">
                    <ScrollArea className="h-64 p-3">
                      <pre className="font-mono text-xs leading-relaxed whitespace-pre-wrap">
                        {logs.join("\n") || "Logs will appear here when the agent runs."}
                      </pre>
                    </ScrollArea>
                  </div>
                )}
                {view === "files" && (
                  <div className="rounded-md border bg-card mt-3">
                    <ScrollArea className="h-64 p-0">
                      {fileLists.length === 0 ? (
                        <div className="p-3 text-xs text-muted-foreground">No directories listed yet.</div>
                      ) : (
                        <ul className="divide-y">
                          {fileLists.map((f, i) => (
                            <li key={i} className="p-3">
                              <div className="text-xs text-muted-foreground">{f.path}</div>
                              <pre className="font-mono text-xs leading-relaxed whitespace-pre-wrap mt-1">{f.output}</pre>
                            </li>
                          ))}
                        </ul>
                      )}
                    </ScrollArea>
                  </div>
                )}
                {view === "diffs" && (
                  <div className="rounded-md border bg-card mt-3">
                    <ScrollArea className="h-64 p-0">
                      {fileDiffs.length === 0 ? (
                        <div className="p-3 text-xs text-muted-foreground">No file edits yet.</div>
                      ) : (
                        <ul className="divide-y">
                          {fileDiffs.map((d, i) => (
                            <li key={i} className="p-3 space-y-2">
                              <div className="text-xs text-muted-foreground">{d.path}</div>
                              <UnifiedDiff before={d.before} after={d.after} />
                            </li>
                          ))}
                        </ul>
                      )}
                    </ScrollArea>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// Fixed, subtle grid/dots background
function SubtleGridBackground() {
  const style: React.CSSProperties = {
    backgroundImage:
      `linear-gradient(to right, rgba(120,120,128,0.06) 1px, transparent 1px),` +
      `linear-gradient(to bottom, rgba(120,120,128,0.06) 1px, transparent 1px)`,
    backgroundSize: "24px 24px",
    backgroundPosition: "0 0",
    WebkitMaskImage: "radial-gradient(120% 80% at 50% 20%, black 60%, transparent 100%)",
    maskImage: "radial-gradient(120% 80% at 50% 20%, black 60%, transparent 100%)",
  };
  return (
    <div
      aria-hidden
      className="pointer-events-none fixed inset-0 z-0"
      style={style}
    />
  );
}

// --- Minimal unified diff (line-based) with small context, styled GitHub-dark-ish ---
type DiffOp = { type: 'context' | 'add' | 'remove'; line: string };
function lcsDiff(a: string[], b: string[]): DiffOp[] {
  const n = a.length, m = b.length;
  const dp: number[][] = Array.from({ length: n + 1 }, () => Array(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }
  const ops: DiffOp[] = [];
  let i = 0, j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      ops.push({ type: 'context', line: a[i] });
      i++; j++;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      ops.push({ type: 'remove', line: a[i] });
      i++;
    } else {
      ops.push({ type: 'add', line: b[j] });
      j++;
    }
  }
  while (i < n) { ops.push({ type: 'remove', line: a[i++] }); }
  while (j < m) { ops.push({ type: 'add', line: b[j++] }); }
  return ops;
}

function buildHunks(ops: DiffOp[], context = 2): DiffOp[][] {
  const hunks: DiffOp[][] = [];
  let current: DiffOp[] = [];
  let seenChange = false;
  let trailingContext = 0;
  for (let idx = 0; idx < ops.length; idx++) {
    const op = ops[idx];
    if (op.type === 'context') {
      if (seenChange) {
        current.push(op);
        trailingContext++;
        if (trailingContext >= context) {
          if (current.length) hunks.push(current);
          current = [];
          seenChange = false;
          trailingContext = 0;
        }
      } else {
        // Keep up to leading context lines; trim older ones if too many
        current.push(op);
        if (current.length > context) current.shift();
      }
    } else {
      // Change line
      if (!seenChange) {
        // Ensure we keep existing leading context in current
        seenChange = true;
        trailingContext = 0;
      }
      current.push(op);
    }
  }
  if (current.length) hunks.push(current);
  return hunks;
}

function UnifiedDiff({ before, after }: { before: string; after: string }) {
  const linesA = before.split('\n');
  const linesB = after.split('\n');
  const ops = lcsDiff(linesA, linesB);
  const hunks = buildHunks(ops, 2);
  if (hunks.length === 0) return <div className="text-xs text-muted-foreground">No changes</div>;
  return (
    <div className="rounded border overflow-hidden">
      {hunks.map((h, idx) => (
        <div key={idx} className="border-b last:border-b-0">
          <pre className="bg-[#0d1117] text-[#c9d1d9] font-mono text-xs whitespace-pre-wrap leading-relaxed">
            {h.map((op, i) => {
              if (op.type === 'add') {
                return (
                  <div key={i} className="px-3 py-0.5 border-l-2 border-[#2ea043] bg-[#122b16] text-[#7ee787]">
                    + {op.line}
                  </div>
                );
              }
              if (op.type === 'remove') {
                return (
                  <div key={i} className="px-3 py-0.5 border-l-2 border-[#f85149] bg-[#2c1515] text-[#ffa198]">
                    - {op.line}
                  </div>
                );
              }
              return (
                <div key={i} className="px-3 py-0.5 text-[#8b949e]">
                  {op.line}
                </div>
              );
            })}
          </pre>
        </div>
      ))}
    </div>
  );
}

// Small feature pill for dialog
function Feature({ icon, title, desc }: { icon: React.ReactNode; title: string; desc: string }) {
  return (
    <div className="group rounded-2xl border bg-card/60 backdrop-blur px-3.5 py-3.5 transition-colors hover:bg-card">
      <div className="flex items-start gap-3.5">
        <div className="mt-0 flex p-2 h-10 w-10 items-center justify-center rounded-full border bg-background">
          {icon}
        </div>
        <div>
          <div className="text-sm font-medium leading-tight">{title}</div>
          <div className="text-xs text-muted-foreground leading-snug">{desc}</div>
        </div>
      </div>
    </div>
  );
}
