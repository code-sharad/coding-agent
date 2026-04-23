# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is an AI-powered coding agent that clones GitHub repos into a Vercel sandbox, accepts natural language tasks, uses GPT-4.1 (via OpenRouter) to make code changes, and can create PRs. Built with Next.js 15 (App Router), Drizzle ORM, Better Auth with GitHub OAuth, and the Vercel AI SDK.

## Build Commands

```bash
npm run dev          # Dev server with Turbopack (http://localhost:3000)
npm run build        # Production build
npm run lint         # ESLint (next/core-web-vitals, next/typescript)
npm run db:generate   # Generate Drizzle migrations
npm run db:push       # Push schema to database
npm run auth:generate # Generate Better Auth types
npm run auth:migrate  # Run Better Auth migrations
```

## Architecture

### Authentication Flow
Users sign in via GitHub OAuth (Better Auth). Sessions are stored in Neon PostgreSQL. The GitHub access token is retrieved from the `account` table via `getGithubAccessToken()` in `db/users.ts` to make API calls on behalf of the user.

### Agent Execution Flow (SSE Streaming)
1. User selects a repo and enters a task → POST `/api/jobs/stream`
2. `utils/agent.ts` runs the AI agent using Vercel AI SDK with GPT-4.1 via OpenRouter
3. The agent has tools: `read_file`, `list_files`, `edit_file`, `create_pr`
4. Each tool call triggers sandbox operations via `utils/sandbox.ts` (clones repo, runs shell commands)
5. Progress streams back to the UI via Server-Sent Events (SSE)

### Key Modules
| Module | Purpose |
|--------|---------|
| `utils/agent.ts` | Core AI agent with tool definitions |
| `utils/sandbox.ts` | Vercel sandbox operations (git clone, file read/write) |
| `lib/auth.ts` | Better Auth server configuration |
| `lib/auth-client.ts` | Better Auth client for session management |
| `db/users.ts` | User queries (upsert, getGithubAccessToken) |
| `app/api/jobs/stream/route.ts` | SSE streaming endpoint |

### Database
Neon PostgreSQL with Drizzle ORM. Schema files:
- `db/drizzle/schema.ts` - Better Auth tables (user, session, account, verification)
- `db/schema.ts` - Custom user schema with githubId field

## Environment Variables

```
DATABASE_URL           # Neon PostgreSQL connection string
GITHUB_CLIENT_ID       # GitHub OAuth App client ID
GITHUB_CLIENT_SECRET   # GitHub OAuth App client secret
OPENROUTER_API_KEY     # OpenRouter API key for GPT-4.1
NEXT_PUBLIC_APP_URL    # App URL (e.g., http://localhost:3000)
GITHUB_TOKEN           # Personal access token (optional, for non-OAuth operations)
```
