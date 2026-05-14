# AGENTS.md — LCA Chatbot Spike

This file tells AI coding agents (Claude Code, Cursor, Copilot, Vercel Agent) how
to work with this repo. Read it before touching any code.

## Project

**What it is:** Standalone spike to validate the Vercel AI Stack (Gateway, AI SDK v6,
Workflow DevKit) on a real-feeling agent problem — a two-way learning chatbot
for LCA (Late Checkout), an AI engineering studio. Vercel Sandbox was evaluated
for visitor-site research and removed — see `pros-and-cons.md`. Both proactive
web search (`search_web`) and page fetch (`fetch_website`) run through Exa
(single `fetch` from a `'use step'` function); Exa handles crawling and
HTML-to-text server-side.

**What it is not:** Production. Not embedded in lca.agency. No analytics.
This is a time-boxed learning exercise.

**Auth model:** Every visitor is signed in via Supabase **anonymous auth**
(`supabase.auth.signInAnonymously()`) on first page load — that gives them a
real `auth.users` row with `is_anonymous = true`. The chat session id (used
by WorkflowChatTransport, `sessions.id`, and the FK on `messages` /
`visitor_facts` / `email_captures`) is the auth user id. RLS is still open
to anon + authenticated for the spike — see "Conventions" below.

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
- **Workflow + steps split across two files in `src/lib/agent/chat/`.** Per the
  [official SDK structure guidance](https://workflow-sdk.dev/docs/foundations/workflows-and-steps),
  each workflow lives in its own directory:
  - `chat/index.ts` — `runChatWorkflow` + tool wrappers (`makeFetchWebsiteTool`,
    `makeSaveVisitorFactTool`, etc.).
  - `chat/steps.ts` — every `'use step'` function (`fetchPublicWebsite`,
    `searchWeb`, `persistVisitorFact`, `persistAssistantMessage`, …) as a
    *named exported async function*. Tool `execute` bodies in `index.ts`
    import and call these.
  Earlier docs in this repo claimed steps had to be colocated with the
  workflow; that was true on a much older WDK version and was empirically
  retested on `workflow@4.2.4` (see `Verifying step registration` below).
  If steps stop registering after a refactor, that's the failure mode to
  look for, but with the import graph reaching `chat/steps.ts` from
  `chat/index.ts`, the SDK bundler discovers and registers all step IDs.
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
    declared in `chat/steps.ts`, then call it from the tool's `execute`.
    Inside step functions, all globals (`fetch`, `AbortSignal`, `cookies()`)
    are available — the step worker is a normal Next.js route handler.
    For DB reads from steps, prefer raw `fetch` against PostgREST over
    `@supabase/supabase-js` — the latter pulls in a Realtime client that
    can re-introduce the WebSocket dependency unnecessarily.
- **Schema:** Declarative — one file per table in `supabase/schemas/<NNN>-name.sql`.
  Migrations are **generated** via `supabase db diff -f <name>`; never hand-written.
  After any schema change run `pnpm db:gen-types` to refresh `src/lib/database.types.ts`.
- **RLS:** Always 4 separate policies per table (select / insert / update / delete) with
  `to anon, authenticated`. Never use `for all`. The spike currently uses
  permissive `using (true)` predicates so the workflow step worker — which
  runs without the visitor's auth cookies — can still read/write. When we
  tighten this we'll need to thread a server-trusted user id into every step
  call rather than relying on `auth.uid()`.
- **Auth (anonymous):** `useChatSession` (`src/hooks/use-chat-session.ts`)
  calls `supabase.auth.signInAnonymously()` on mount and returns
  `auth.user.id` as the chat session id. `src/proxy.ts` (Next.js 16's
  middleware-equivalent) calls `getUser()` on every request to refresh the
  auth cookie. Anonymous sign-ins must be enabled in
  `supabase/config.toml` (`enable_anonymous_sign_ins = true`) and in the
  Supabase dashboard for any deployed environment.
- **Email capture:** After ~5 minutes of chat inactivity (and at least one
  back-and-forth), `chat-interface.tsx` renders an inline
  `<EmailCaptureCard>` styled like an assistant bubble. Submit posts to
  `/api/email-capture`, which loads the transcript, summarises it via
  `generateText` against the AI Gateway, and writes a row to
  `email_captures`. The CTA link is intentionally a placeholder
  (latecheckout.agency) — swap it for the real sign-up URL once one exists.
- **Knowledge base:** The agent may ONLY state facts about LCA that it retrieves via
  `retrieve_lca_knowledge`. Curated content lives in the `public.lca_knowledge` table
  and is searched via Postgres full-text search (`search_lca_knowledge(q, k)` SQL
  function). Seed/refresh by scraping latecheckout.agency: `pnpm db:seed-knowledge`
  (requires `SUPABASE_SERVICE_ROLE_KEY` in `.env.local`). To change the page list
  edit `scripts/seed-lca-knowledge.ts`.

## Key files

```
src/
  proxy.ts                     ← Next.js 16 proxy (refreshes Supabase auth cookie)
  app/
    api/chat/route.ts          ← DurableAgent endpoint ('use workflow')
    api/sessions/route.ts      ← session init (writes user_id from auth)
    api/email-capture/route.ts ← idle-timeout email capture + LLM-summary
    api/visitor-facts/[id]/    ← facts CRUD
  lib/
    agent/
      instructions.ts          ← system prompt (guard carefully)
      chat/
        index.ts               ← runChatWorkflow + tool wrappers
        steps.ts               ← all 'use step' functions (durable units)
    supabase/
      client.ts                ← @supabase/ssr browser client (Client Components)
      server.ts                ← @supabase/ssr server client — anon, RLS-enforced
      admin.ts                 ← service-role client (admin routes only)
      proxy.ts                 ← cookie-refresh helper used by src/proxy.ts
    db/queries/                ← all Supabase access (imports lib/supabase/server)
    database.types.ts          ← generated; run `pnpm db:gen-types` after schema change
  hooks/
    use-chat-session.ts        ← anonymous sign-in + session-id source of truth
  types/database.ts            ← thin re-export of generated helpers
  components/
    chat-interface.tsx         ← root client component, WorkflowChatTransport
    email-capture-card.tsx     ← end-of-conversation email capture + sign-up CTA
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

1. Add a named exported async function to `src/lib/agent/chat/steps.ts` with
   `'use step'` as the first statement of its body. This is your durable,
   retryable unit.
2. In `src/lib/agent/chat/index.ts`, add (or extend) a `make<Name>Tool()`
   factory that returns `tool({ description, inputSchema, execute })` and
   imports the step function from `./steps`. For closure-bound state (e.g.
   `sessionId`), use an arrow adapter:
   `execute: async (input) => myStep(closureArg, input.x)`.
3. Wire it into `runChatWorkflow`'s `tools: { … }` map.
4. After `pnpm build`, sanity-check the step ID is registered — see
   `Verifying step registration` below.

## Verifying step registration

After a build, every `'use step'` function should appear as a
`registerStepFunction("step//./src/lib/agent/chat/steps//<funcName>", …)` call
somewhere in `.next/server/chunks/*.js`. To check:

```bash
# bash
grep -oE 'step//\./src/lib/agent[a-zA-Z0-9_./-]+' .next/server/chunks/*.js | sort -u
```

You should see one entry per step plus framework-internal steps from
`@workflow/ai` and `workflow`. If one of your steps is missing here, the
workflow will call it and fail with an empty `FatalError`
(`{"fatal":true,"name":"FatalError"}`) at runtime — that's the signature of
`step-not-registered`. The usual cause is a non-named function (arrow
assigned to a variable) or a function that no module reachable from
`chat/index.ts` actually imports.

## Pre-PR checklist

```bash
pnpm typecheck          # zero errors required
pnpm build              # must pass (catches route/export issues)
```

## Do not

- Add multi-tenant logic or CRM write-backs — explicitly out of scope.
  (Auth was added — anonymous-only; do not promote to email/OAuth here.)
- Embed this in lca.agency — standalone only.
- Let the agent invent LCA facts — it must call `retrieve_lca_knowledge`.
- Commit `.env.local` or any real API keys.
- Use `any` in TypeScript without a comment explaining why.

## Environment variables

Copy `.env.local.example` to `.env.local` and fill in:
- `AI_GATEWAY_API_KEY` — Vercel AI Gateway API key
- `NEXT_PUBLIC_SUPABASE_URL` + `NEXT_PUBLIC_SUPABASE_ANON_KEY` + `SUPABASE_SERVICE_ROLE_KEY`
- `EXA_API_KEY` (optional) — powers both `search_web` (Exa `/search`) and
  `fetch_website` (Exa `/contents`). When unset both tools return an
  `"unavailable"` error instead of throwing, so the agent keeps working
  without proactive research.
- `RESEND_API_KEY` (optional) + `RESEND_FROM_EMAIL` — when unset, the
  email-capture endpoint logs a warning and skips the send so local dev
  works without a Resend account. The full LCA Resend pipeline (PGMQ →
  cron → edge function) is **not** mirrored here on purpose: this spike
  calls Resend directly via `fetch` from `/api/email-capture` with the
  key in the server-only env. Don't replicate that direct-fetch pattern
  in the LCA monorepo.
- For Workflow DevKit local dev: the Next dev server runs the executor in-process
  via the `withWorkflow()` SWC plugin; no separate `npx workflow dev` needed.
