# LCA Chatbot — Vercel AI Stack Spike

A standalone two-way learning chatbot for [LCA (Late Checkout)](https://lca.agency),
built to validate the Vercel AI Stack — **AI SDK v6**, **Workflow DevKit**, and
**AI Gateway** — on a real-feeling agent problem.

The bot has two jobs: answer questions about LCA (grounded in a curated
knowledge base) and learn about the visitor (anchor questions → optional
website research → personalised follow-ups).

> **Status:** time-boxed learning spike. Not production. No auth, no
> analytics, not embedded in the marketing site.

---

## Companion docs

- [`AGENTS.md`](./AGENTS.md) — conventions and load-bearing rules for AI
  coding agents working in this repo. Read before editing.
- [`wdk-mental-model.md`](./wdk-mental-model.md) — long-form explanation of
  the Workflow DevKit abstractions (`'use workflow'`, `'use step'`,
  `DurableAgent`), how they compose here, and why the silent step-registration
  failure mode bit us.
- [`pros-and-cons.md`](./pros-and-cons.md) — layer-by-layer comparison of
  building this with vs. without the Vercel AI Stack.

---

## Stack

| Layer       | Technology                                              |
|-------------|---------------------------------------------------------|
| Framework   | Next.js 16 (App Router), TypeScript strict mode         |
| UI          | Tailwind v4 + shadcn-compatible components              |
| Agent       | AI SDK v6 `DurableAgent` + Workflow DevKit              |
| Model       | Anthropic Claude (`claude-sonnet-4.5`) via AI Gateway   |
| Database    | Supabase (Postgres + RLS), declarative schemas          |
| State       | React Query (`@tanstack/react-query` v5)                |

---

## Prerequisites

You'll need:

- **Node.js 22+** and **pnpm 9+** (`corepack enable && corepack prepare pnpm@latest --activate`)
- **Docker Desktop** — required by the Supabase CLI to run a local Postgres
- **Supabase CLI** ≥ 1.200 — `npm i -g supabase` or `brew install supabase/tap/supabase`
- **Vercel CLI** — `npm i -g vercel` (used to pull the Gateway API key)
- A **Vercel account** linked to the project (for `vercel env pull`)

You do **not** need: a hosted Supabase project, a separate workflow daemon, or
any Anthropic/OpenAI keys directly — Gateway routes everything.

---

## Quick start

```bash
# 1. Install
pnpm install

# 2. Auth + pull env (writes .env.local with the Gateway API key)
vercel login
vercel link        # link this directory to the Vercel project
vercel env pull    # writes AI_GATEWAY_API_KEY, etc.

# 3. Start local Supabase (Postgres + Studio + auth at :54321/:54322/:54323)
supabase start

# 4. Apply schema migrations + (eventual) seed
supabase db reset

# 5. Generate TypeScript types from the local DB
pnpm db:gen-types

# 6. Run the dev server
pnpm dev
# → http://localhost:3000
```

Open the app, send a message, and watch the agent stream a reply. If you give
it a URL, the `research_visitor` step fetches the page directly (with SSRF
guards) and feeds the stripped text back to the model.

---

## Environment variables

`vercel env pull` populates most of these. You only need to set them by hand
if you're not using `vercel link`. See [`.env.local.example`](./.env.local.example)
for the full template.

| Variable                        | Source                                            | Used for                          |
|---------------------------------|---------------------------------------------------|-----------------------------------|
| `AI_GATEWAY_API_KEY`            | Vercel Dashboard → AI Gateway → API Keys          | All LLM calls (routed via Gateway)|
| `NEXT_PUBLIC_SUPABASE_URL`      | `supabase status` → API URL (`http://127.0.0.1:54321`) | Browser + server Supabase clients |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | `supabase status` → anon key                      | RLS-enforced reads/writes         |
| `SUPABASE_SERVICE_ROLE_KEY`     | `supabase status` → service_role key              | Admin client (no admin routes yet)|

---

## Database workflow

The schema is **declarative** — one file per table under `supabase/schemas/`.
Migrations are *generated* by `supabase db diff`, never hand-written.

```bash
# 1. Edit the schema declaratively
$EDITOR supabase/schemas/003-visitor-facts.sql

# 2. Generate the migration (diffs schemas/ against the live local DB)
supabase db diff -f add_some_column

# 3. Apply migrations + seed
supabase db reset

# 4. Refresh generated TypeScript types
pnpm db:gen-types

# 5. Commit BOTH supabase/schemas/ and supabase/migrations/
```

RLS is on for every table with 4 separate policies (select / insert / update /
delete) targeting `to anon, authenticated`. Never use `for all`.

Supabase Studio runs at <http://localhost:54323> — useful for inspecting
sessions, messages, and visitor facts as the bot writes them.

---

## Project layout

```
src/
  app/
    api/chat/route.ts                ← starts the durable workflow
    api/chat/[runId]/stream/route.ts ← resumable-stream reconnect endpoint
    api/sessions/route.ts            ← session init
  lib/
    agent/
      instructions.ts                ← system prompt
      chat/
        index.ts                     ← runChatWorkflow + tool wrappers
        steps.ts                     ← all 'use step' functions (durable units)
      tools/retrieve-lca-knowledge.ts← keyword search (no 'use step', in-memory)
    knowledge/lca-content.ts         ← curated LCA content (source of truth)
    supabase/
      client.ts                      ← @supabase/ssr browser client
      server.ts                      ← @supabase/ssr server client (anon, RLS)
      admin.ts                       ← service-role (admin routes only)
    db/queries/                      ← all Supabase access goes through here
  components/
    chat-interface.tsx               ← root client component, WorkflowChatTransport
    visitor-facts-panel.tsx         ← "What LCA knows about you" sidebar
supabase/
  schemas/<NNN>-<name>.sql           ← declarative schema (one file per table)
  migrations/                        ← generated by `supabase db diff` (committed)
```

If you need to add a new durable tool or step, follow the recipe in
[`AGENTS.md`](./AGENTS.md#adding-a-new-durable-tool). The main silent
failure mode is that `'use step'` only works on *named* async functions —
anonymous arrows passed to `tool({ execute })` are skipped by the SWC
transform with no error. Steps themselves can live in any module reachable
from the workflow's import graph (`chat/index.ts` → `chat/steps.ts` here),
which matches the [official SDK guidance](https://workflow-sdk.dev/docs/foundations/workflows-and-steps).

---

## Scripts

```bash
pnpm dev          # Next.js dev server (workflow runs in-process via SWC plugin)
pnpm build        # production build (also catches step-registration issues)
pnpm typecheck    # tsc --noEmit, must pass with zero errors
pnpm db:gen-types # regenerate src/lib/database.types.ts from local Supabase
pnpm lint         # next lint
```

There is **no separate workflow daemon to run** — `withWorkflow()` in
[`next.config.ts`](./next.config.ts) injects the WDK SWC transform and runs
the executor in-process during `next dev`.

### Verifying step registration

After a build, every `'use step'` function should appear in the step worker
chunks. To check:

```bash
grep -oE "step//\\./src/lib/agent[a-zA-Z0-9_./-]+" .next/server/chunks/*.js | sort -u
```

If a step is missing from this output, the workflow will fail at runtime with
an opaque empty `FatalError` payload. See
[`wdk-mental-model.md`](./wdk-mental-model.md#4-why-the-previous-setup-failed-the-load-bearing-footgun)
for the why.

---

## Troubleshooting

| Symptom                                                      | Likely cause / fix |
|--------------------------------------------------------------|--------------------|
| `{"fatal":true,"name":"FatalError"}` in the workflow stream  | Step not registered. Run the grep above and confirm every `'use step'` function appears. Most common cause: the function isn't *named* (anonymous arrows are silently skipped), or its module is no longer reachable from `chat/index.ts`'s import graph. |
| `research_visitor` rejects a URL with "Private or reserved IP" / "Loopback" / "Only http/https" | The URL hit the SSRF guard in `validateVisitorUrl`. Expected for internal/loopback targets — ask the visitor for a public https URL instead. |
| `supabase db reset` fails with port already in use           | Stop another local Supabase: `supabase stop`, or change ports in `supabase/config.toml`. |
| `pnpm db:gen-types` produces an empty file                   | Local Supabase isn't running. Run `supabase start` first. |
| Chat stream just hangs after sending a message               | Check the dev terminal — the workflow chunk likely threw before the first chunk reached the client. AI Gateway 401 (missing/invalid `AI_GATEWAY_API_KEY`) is the usual culprit. |
| TypeScript can't find `'@/lib/supabase/server'`              | Run `pnpm db:gen-types` and restart the TS server. |

---

## What's deliberately out of scope

- **Auth.** No login, no per-user data isolation. Sessions are anonymous and
  identified by a client-generated UUID held in `localStorage`.
- **CRM write-back.** The bot saves visitor facts to Supabase only. No HubSpot,
  no Slack notifications, no enrichment beyond visitor-provided URLs.
- **Embedding-based retrieval.** `retrieve_lca_knowledge` is keyword search
  for now. Production would swap in pgvector + `openai/text-embedding-3-small`
  through the same Gateway.
- **Multi-page UI.** Single chat surface. No history view, no admin panel.

See [`pros-and-cons.md`](./pros-and-cons.md) for the honest assessment of what
each layer of the Vercel AI Stack actually buys you here.
