# AGENTS.md — LCA Chatbot Spike

This file tells AI coding agents (Claude Code, Cursor, Copilot, Vercel Agent) how
to work with this repo. Read it before touching any code.

## Project

**What it is:** Standalone spike to validate the Vercel AI Stack (Gateway, AI SDK v6,
Workflow DevKit, Sandbox) on a real-feeling agent problem — a two-way learning chatbot
for LCA (Late Checkout), an AI engineering studio.

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
| Sandbox     | Vercel Sandbox (Firecracker) for URL research    |
| State       | React Query (`@tanstack/react-query` v5)         |

## Conventions

- **Filenames:** kebab-case everywhere (`chat-interface.tsx`, not `ChatInterface.tsx`)
- **Components:** Server Components by default. Add `'use client'` only where required
  (event handlers, hooks, browser APIs).
- **Agent code:** `'use workflow'` on the chat route; `'use step'` inside tool execute
  functions that do network/DB I/O.
- **DB queries:** All Supabase calls go through `src/lib/db/queries/*.ts`. No raw
  Supabase calls in components or API routes.
- **Knowledge base:** The agent may ONLY state facts about LCA that it retrieves via
  `retrieve_lca_knowledge`. Curated content lives in `src/lib/knowledge/lca-content.ts`.
  Do not add content without review.

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
      tools/
        retrieve-lca-knowledge.ts  ← keyword search over lca-content.ts
        research-visitor.ts        ← Sandbox fetch ('use step')
        save-visitor-fact.ts       ← Supabase insert ('use step')
    knowledge/lca-content.ts   ← curated LCA content (source of truth)
    db/queries/                ← all Supabase access
  components/
    chat-interface.tsx         ← root client component, WorkflowChatTransport
    visitor-facts-panel.tsx    ← the "What LCA knows" panel
supabase/schema.sql            ← declarative schema + RLS
```

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
- For local Sandbox: `vercel link && vercel env pull`
- For Workflow DevKit local dev: run `npx workflow dev` in a separate terminal
