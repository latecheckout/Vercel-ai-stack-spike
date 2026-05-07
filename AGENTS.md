# AGENTS.md — LCA Chatbot Spike

This file tells AI coding agents (Claude Code, Cursor, Copilot, Vercel Agent) how
to work with this repo. Read it before touching any code.

## Project

**What it is:** Standalone spike to validate the Vercel AI Stack (Gateway, AI SDK v6,
Workflow DevKit) on a real-feeling agent problem — a two-way learning chatbot
for LCA (Late Checkout), an AI engineering studio. Vercel Sandbox was evaluated
for the `research_visitor` tool and removed — see `pros-and-cons.md`.

**What it is not:** Production. Not embedded in lca.agency. No auth. No analytics.
This is a time-boxed learning exercise.

## Stack

| Layer       | Technology                                      |
|-------------|--------------------------------------------------|
| Framework   | Next.js 16 (App Router), TypeScript strict mode  |
| UI          | Tailwind v4 + custom shadcn-compatible components|
| Agent       | AI SDK v6 `DurableAgent` + Workflow DevKit       |
| Model       | Anthropic Claude via Vercel AI Gateway           |
| Database    | Supabase (Postgres + pgvector + RLS)             |
| State       | React Query (`@tanstack/react-query` v5)         |

## Conventions

- **Filenames:** kebab-case everywhere (`chat-interface.tsx`, not `ChatInterface.tsx`)
- **Components:** Server Components by default. Add `'use client'` only where required
  (event handlers, hooks, browser APIs).
- **Agent code (load-bearing):** `'use workflow'` lives **inside the function body**
  of `runChatWorkflow` (not at the top of the file — that's the WDK v3 pattern).
  The route handler invokes it via `start(runChatWorkflow, [args])` from `workflow/api`.
- **Step functions live in `chat-workflow.ts`.** Every `'use step'` function — durable
  retryable units like `fetchVisitorSite`, `persistVisitorFact`, `persistAssistantMessage`
  — is declared as a *named async function* in `chat-workflow.ts` itself. Tool wrappers
  (`makeResearchVisitorTool`, `makeSaveVisitorFactTool`) live in the same file and
  reference those step functions from their `execute`. **Do not move step functions
  into separate files.** When we tried that, the WDK builder picked them up in the
  workflow flow chunk but Turbopack failed to include them in the step-worker bundle,
  so the workflow knew step IDs to call but the worker had no implementation —
  manifesting as empty `FatalError` payloads and step-not-registered errors.
- **`'use step'` directive must be the first statement of a named async function.**
  Anonymous arrow functions assigned to `tool({ execute: async () => { 'use step'; … } })`
  are silently skipped by the SWC transform — no `registerStepFunction` call, no error.
- **DB queries:** All Supabase calls go through `src/lib/db/queries/*.ts`. No raw
  Supabase calls in components or API routes. Pick by caller context:
  - `@/lib/supabase/server` — anon SSR client (uses `cookies()`). Use from API
    routes, Server Components, Server Actions, and `'use step'` step functions
    (which run on the step-worker route handler, so a request scope is present).
  - `@/lib/supabase/admin` — service-role client; admin/seed routes only.
  - **The workflow flow worker is a stripped-down runtime — no `fetch`, no
    `AbortSignal`, no `WebSocket`.** Tool `execute` bodies run there inline,
    so they cannot perform I/O directly. The framework even rejects raw
    `fetch` with `"Global 'fetch' is unavailable in workflow functions."`
    Wrap any I/O (DB reads, HTTP requests) in a named `'use step'` function
    declared in `chat-workflow.ts`, then call it from the tool's `execute`.
    Inside step functions, all globals (`fetch`, `AbortSignal`, `cookies()`)
    are available — the step worker is a normal Next.js route handler.
    For DB reads from steps, prefer raw `fetch` against PostgREST over
    `@supabase/supabase-js` — the latter pulls in a Realtime client that
    can re-introduce the WebSocket dependency unnecessarily.
- **Schema:** Declarative — one file per table in `supabase/schemas/<NNN>-name.sql`.
  Migrations are **generated** via `supabase db diff -f <name>`; never hand-written.
  After any schema change run `pnpm db:gen-types` to refresh `src/lib/database.types.ts`.
- **RLS:** Always 4 separate policies per table (select / insert / update / delete) with
  `to anon, authenticated`. Never use `for all`.
- **Knowledge base:** The agent may ONLY state facts about LCA that it retrieves via
  `retrieve_lca_knowledge`. Curated content lives in the `public.lca_knowledge` table
  and is searched via Postgres full-text search (`search_lca_knowledge(q, k)` SQL
  function). Seed/refresh by scraping latecheckout.agency: `pnpm db:seed-knowledge`
  (requires `SUPABASE_SERVICE_ROLE_KEY` in `.env.local`). To change the page list
  edit `scripts/seed-lca-knowledge.ts`.

## Key files

```
src/
  app/
    api/chat/route.ts          ← DurableAgent endpoint ('use workflow')
    api/sessions/route.ts      ← session init
    api/visitor-facts/[id]/    ← facts CRUD
  lib/
    agent/
      instructions.ts          ← system prompt (guard carefully)
      chat-workflow.ts         ← workflow + ALL 'use step' functions + ALL tool wrappers
    supabase/
      client.ts                ← @supabase/ssr browser client (Client Components)
      server.ts                ← @supabase/ssr server client — anon, RLS-enforced
      admin.ts                 ← service-role client (admin routes only)
    db/queries/                ← all Supabase access (imports lib/supabase/server)
    database.types.ts          ← generated; run `pnpm db:gen-types` after schema change
  types/database.ts            ← thin re-export of generated helpers
  components/
    chat-interface.tsx         ← root client component, WorkflowChatTransport
    visitor-facts-panel.tsx    ← the "What LCA knows" panel
supabase/
  config.toml                  ← supabase CLI config (schema_paths → ./schemas/*.sql)
  schemas/<NNN>-<name>.sql     ← declarative schema; one file per table + extensions
  migrations/                  ← generated by `supabase db diff` (committed)
scripts/
  seed-lca-knowledge.ts        ← scrapes latecheckout.agency → lca_knowledge (service role)
```

## Schema change loop

```bash
# 1. Edit supabase/schemas/<NNN>-<name>.sql declaratively
# 2. Generate the migration (compares schemas/ against the live local DB):
supabase db diff -f <descriptive_name>
# 3. Apply migrations + (eventual) seed:
supabase db reset
# 4. Refresh generated types:
pnpm db:gen-types
# 5. Commit both supabase/schemas/ and supabase/migrations/
```

## Adding a new durable tool

1. Add a named async function to `chat-workflow.ts` with `'use step'` as the first
   statement of its body. This is your durable, retryable unit.
2. Add (or extend) a `make<Name>Tool()` factory in the same file that returns
   `tool({ description, inputSchema, execute })` and references the step function
   from `execute`. For closure-bound state (e.g. `sessionId`), use an arrow adapter:
   `execute: async (input) => mySte(closureArg, input.x)`.
3. Wire it into `runChatWorkflow`'s `tools: { … }` map.
4. After `pnpm build`, sanity-check the step ID is registered in the step worker
   bundle — see the snippet in `Verifying step registration` below.

## Verifying step registration

After a build, the step worker route at `.next/server/app/.well-known/workflow/v1/step/route.js`
imports a fixed list of chunks. Every `'use step'` function should appear as a
`registerStepFunction("step//./src/lib/agent/chat-workflow//<funcName>", …)` call in
one of those chunks. To check:

```bash
# bash
grep -oE "step//\\./src/lib/agent[a-zA-Z0-9_./-]+" .next/server/chunks/*.js | sort -u
```

If a step function is missing from this output, the workflow will call it and fail
with an empty `FatalError` (`{"fatal":true,"name":"FatalError"}`) at runtime —
that's the signature of `step-not-registered`.

## Pre-PR checklist

```bash
pnpm typecheck          # zero errors required
pnpm build              # must pass (catches route/export issues)
```

## Do not

- Add auth, multi-tenant logic, or CRM write-backs — explicitly out of scope.
- Embed this in lca.agency — standalone only.
- Let the agent invent LCA facts — it must call `retrieve_lca_knowledge`.
- Commit `.env.local` or any real API keys.
- Use `any` in TypeScript without a comment explaining why.

## Environment variables

Copy `.env.local.example` to `.env.local` and fill in:
- `AI_GATEWAY_API_KEY` — Vercel AI Gateway API key
- `NEXT_PUBLIC_SUPABASE_URL` + `NEXT_PUBLIC_SUPABASE_ANON_KEY` + `SUPABASE_SERVICE_ROLE_KEY`
- For Workflow DevKit local dev: the Next dev server runs the executor in-process
  via the `withWorkflow()` SWC plugin; no separate `npx workflow dev` needed.
