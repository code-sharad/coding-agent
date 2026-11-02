# ⚡ Coding Agent

**An AI-powered coding agent that lives in your GitHub repos.**
Describe a task in plain English — it spins up an isolated sandbox, reads your code, makes the edits, and opens a pull request. All with live-streamed progress.

**Live demo:** [agent31.vercel.app](https://agent31.vercel.app)

---

## ✨ Features

- 🔐 **GitHub OAuth sign-in** — your repos, your tokens. Nothing is shared or stored in plaintext outside your session.
- 📦 **Isolated sandboxes** — every task runs in a fresh [Vercel Sandbox](https://vercel.com/docs/sandbox) that clones your repo. Your local machine and `main` branch are never touched directly.
- 🧠 **Repo-aware agent** — powered by an open-weights model (**DeepSeek V4.1 Flash** by default, swap it with `AGENT_MODEL`) through the Vercel AI SDK on OpenRouter, with a tool loop (`list_files` → `read_file` → `edit_file` → `create_pr`).
- 📡 **Live streaming UI** — logs, file listings, and real diffs are streamed over SSE as the agent works.
- 🚀 **Automatic pull requests** — changes are committed to a new branch, pushed, and a PR is opened on your behalf via the GitHub API.
- 🎯 **Exact-match editing** — the agent verifies file contents before editing, so diffs are precise and reviewable.

## 🏗️ Architecture

```
┌────────────┐     POST /api/jobs/stream      ┌──────────────────────┐
│  Browser   │ ─────────────────────────────► │   Next.js API Route  │
│  (React)   │ ◄────────────── SSE ────────── │   (SSE endpoint)      │
└────────────┘   log / file_list / file_diff  └──────────┬───────────┘
      │                 / pr_created / result            │
      │ sign in w/ GitHub                               ▼
      ▼                                          ┌──────────────────────┐
┌────────────┐   Better Auth   ┌────────────┐    │   codingAgent()      │
│  Better    │ ◄─────────────► │ Neon PG    │    │   utils/agent.ts     │
│  Auth      │   (sessions,   │ (Drizzle   │    │                      │
│  (GitHub)  │    accounts)   │  ORM)      │    │  AI SDK agent loop   │
└────────────┘                 └────────────┘    └──────────┬───────────┘
                                                                            │
                                                    tools execute in       ▼
                                                                            │
                                                 ┌──────────────────────────┐
                                                 │   Vercel Sandbox          │
                                                 │  - git clone (token-auth) │
                                                 │  - cat / ls / writeFiles  │
                                                 │  - git commit & push      │
                                                 │  - GitHub API → PR        │
                                                 └──────────────────────────┘
```

**Execution flow:**

1. User signs in with **GitHub OAuth** (Better Auth). Sessions and OAuth tokens live in **Neon PostgreSQL** via Drizzle ORM.
2. User selects a repo and describes a task → `POST /api/jobs/stream`.
3. The API resolves the user's GitHub token from the `account` table and starts `codingAgent()`.
4. On the first tool call, a **Vercel Sandbox** is created and the repo is cloned (using the user's token for private repos).
5. The agent loops (up to 30 steps) — listing files, reading code, and applying exact string-match edits.
6. The agent commits to a timestamped branch, pushes, and opens a PR via the GitHub REST API.
7. Every step streams back to the browser as **SSE events**, rendered as logs, file trees, unified diffs, and a PR link.

## 🧰 Tech Stack

| Layer         | Technology                                                                 |
|---------------|----------------------------------------------------------------------------|
| Framework     | [Next.js 15](https://nextjs.org) (App Router, Turbopack), React 19         |
| Styling       | Tailwind CSS v4, shadcn/ui + Radix primitives, lucide-react                 |
| Auth          | [Better Auth](https://better-auth.com) with GitHub OAuth                    |
| Database      | [Neon PostgreSQL](https://neon.tech) + [Drizzle ORM](https://orm.drizzle.team) |
| AI            | [Vercel AI SDK](https://sdk.vercel.ai) v6 (`generateText`, tool calling) · open-weights model via [OpenRouter](https://openrouter.ai) |
| Sandboxing    | [@vercel/sandbox](https://vercel.com/docs/sandbox) (Node 22 runtime)         |
| Streaming     | Server-Sent Events (native `ReadableStream`)                                |
| Analytics     | @vercel/analytics                                                          |

## 📁 Project Structure

```
.
├── app/
│   ├── api/
│   │   ├── auth/[...all]/route.ts        # Better Auth catch-all handler
│   │   ├── github/
│   │   │   ├── user/repos/route.ts       # List user's repos (token-scoped)
│   │   │   ├── repos/route.ts
│   │   │   └── status/route.ts
│   │   └── jobs/
│   │       └── stream/route.ts           # SSE endpoint — runs the agent
│   ├── layout.tsx                        # Root layout, fonts, analytics
│   └── page.tsx                          # Main UI (repo picker, task input, live progress)
├── components/ui/                        # shadcn/ui primitives
├── db/
│   ├── client.ts                         # Drizzle + Neon HTTP client
│   ├── schema.ts                         # Custom `users` table
│   ├── drizzle/schema.ts                 # Better Auth tables (user, session, account, verification)
│   └── users.ts                          # User queries (upsert, getGithubAccessToken)
├── lib/
│   ├── auth.ts                           # Better Auth server config
│   ├── auth-client.ts                    # Better Auth React client
│   └── utils.ts                          # cn() helper
├── utils/
│   ├── agent.ts                          # The agent: system prompt + tool loop
│   └── sandbox.ts                        # Sandbox ops: clone, read, edit, commit, PR
├── drizzle.config.ts
└── next.config.ts
```

## 🚀 Getting Started

### Prerequisites

- **Node.js 18.18+** (Node 20+ recommended)
- **[Bun](https://bun.sh)** — the Better Auth CLI scripts use `bunx`
- A **Neon PostgreSQL** database ([create one free](https://neon.tech))
- An **OpenRouter** API key ([get one here](https://openrouter.ai/keys))
- A **GitHub OAuth App** (see below)

### 1. Clone and install

```bash
git clone https://github.com/code-sharad/coding-agent.git
cd coding-agent
npm install
```

### 2. Create a GitHub OAuth App

1. Go to [GitHub Developer Settings → New OAuth App](https://github.com/settings/applications/new).
2. Configure it:

   | Field                   | Development                          | Production                              |
   |-------------------------|---------------------------------------|-----------------------------------------|
   | Homepage URL            | `http://localhost:3000`              | `https://agent31.vercel.app`            |
   | Authorization callback  | `http://localhost:3000/api/auth/callback/github` | `https://agent31.vercel.app/api/auth/callback/github` |

3. Copy the **Client ID** and generate a **Client Secret**.

### 3. Configure environment variables

```bash
cp .env.example .env.local
```

Then fill in the values:

```dotenv
# Neon PostgreSQL connection string
DATABASE_URL="postgresql://user:password@host/dbname?sslmode=require"

# GitHub OAuth App credentials
GITHUB_CLIENT_ID=""
GITHUB_CLIENT_SECRET=""

# Secret used to sign Better Auth sessions (generate with: openssl rand -base64 32)
BETTER_AUTH_SECRET=""

# OpenRouter API key (required)
OPENROUTER_API_KEY=""

# OpenRouter model slug. Must support tool calling.
# Default: deepseek/deepseek-v4.1-flash-1017
AGENT_MODEL=""

# Public URL of the app
NEXT_PUBLIC_APP_URL="http://localhost:3000"
```

### 4. Set up the database

```bash
npm run db:push        # Push the Drizzle schema to Neon
npm run auth:migrate   # Create Better Auth tables
```

### 5. Run it

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000), connect your GitHub, pick a repo, describe a task, and hit **Run agent**.

## 📜 Available Scripts

| Command              | Description                                    |
|----------------------|------------------------------------------------|
| `npm run dev`        | Start the dev server (Turbopack)                |
| `npm run build`      | Production build                               |
| `npm run start`      | Start the production server                    |
| `npm run lint`       | ESLint (`next/core-web-vitals`)                |
| `npm run db:generate`| Generate Drizzle migrations                     |
| `npm run db:push`     | Push schema directly to the database            |
| `npm run auth:generate` | Generate Better Auth types & schema          |
| `npm run auth:migrate`  | Run Better Auth migrations (uses `bunx`)     |

## 🔌 API Reference

| Endpoint                     | Method | Description                                                        |
|------------------------------|--------|--------------------------------------------------------------------|
| `/api/auth/[...all]`         | `*`    | Better Auth handler (sign-in, callback, session)                    |
| `/api/jobs/stream`           | `POST` | Runs the agent. Body: `{ repo, task }`. Returns an SSE stream.      |
| `/api/github/user/repos`     | `GET`  | Lists the signed-in user's repos using their OAuth token.          |

**SSE events emitted by `/api/jobs/stream`:**

| Event        | Payload                    | Meaning                                |
|--------------|----------------------------|----------------------------------------|
| `open`       | `"ok"`                     | Stream established                     |
| `log`        | string                     | Agent progress log line                |
| `file_list`  | `{ path, output }`         | Directory listing from the sandbox     |
| `file_diff`  | `{ path, before, after }`  | File edited — rendered as a unified diff |
| `pr_created` | `{ url, branch }`          | Pull request opened 🎉                  |
| `result`     | `{ response }`             | Agent's final text response            |
| `end`        | `"done"`                   | Stream complete                        |
| `error`      | string                     | Something went wrong                   |

## 🔒 Security Notes

- GitHub tokens are obtained per-user via OAuth and stored in the Better Auth `account` table — they're never hard-coded or shared between users.
- All agent operations run inside a **throwaway sandbox** that is stopped when the task completes.
- OAuth scopes are limited to `read:user`, `user:email`, `repo`, and `workflow`.
- Restricted paths (`.git`, `node_modules`) are blocked from agent listing.

## ☁️ Deployment

The easiest path is [Vercel](https://vercel.com/new) — sandboxes, analytics, and the Node runtime all work out of the box:

1. Import the repo into Vercel.
2. Add the environment variables from `.env.example` (set `NEXT_PUBLIC_APP_URL` to your production URL).
3. Deploy. Then update your GitHub OAuth App's callback URL to:
   `https://<your-domain>/api/auth/callback/github`

---

<div align="center">

**Designed and developed by [Sharad Bhadait](https://iamsharad.in)**

</div>
