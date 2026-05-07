# Vercel AI Stack — Pros and Cons

Comparison of building this chatbot **with** the Vercel AI Stack vs. building the
same thing **without it** — same Next.js 16, same Supabase, same Anthropic
Claude model, just stripping out the four Vercel pieces below.

## What this spike actually uses

| Vercel piece          | Where it shows up in this repo                                              |
|-----------------------|------------------------------------------------------------------------------|
| **AI SDK v6** (`ai`, `@ai-sdk/react`) | `useChat` + `WorkflowChatTransport` in `src/components/chat-interface.tsx`; `tool()` + `convertToModelMessages` in `src/app/api/chat/route.ts` and `src/lib/agent/chat-workflow.ts` |
| **Workflow DevKit** (`workflow`, `@workflow/ai`, `@workflow/next`) | `'use workflow'` + `'use step'` + `DurableAgent` in `src/lib/agent/chat-workflow.ts`; `start()` in `src/app/api/chat/route.ts`; resumable stream at `src/app/api/chat/[runId]/stream/route.ts` |
| **AI Gateway** (`@ai-sdk/gateway`)    | Implicit — passing `'anthropic/claude-sonnet-4.5'` as a model string in `chat-workflow.ts` auto-routes through Gateway |
| **Vercel Sandbox** (`@vercel/sandbox`)| **Evaluated then removed.** `fetchVisitorSite` originally ran inside a Firecracker microVM; we replaced it with a direct `fetch()` plus an SSRF allow-list (`validateVisitorUrl`) in the same step. See section 4 below for why. |

---

## Layer-by-layer: with vs. without

### 1. Chat UI + streaming (AI SDK v6 / `useChat`)

| | With AI SDK | Without |
|---|---|---|
| Wire format | `useChat` + `WorkflowChatTransport` parse the v6 UI-message stream and drive React state | We own an SSE/`ReadableStream` parser, message-part state machine, tool-call rendering, and reconnection logic |
| Tool definitions | `tool({ inputSchema: z.object(…), execute })` — Zod schemas → JSON Schema for free | Hand-write JSON Schema, dispatch tool calls ourselves, validate inputs ourselves |
| Provider message shape | `convertToModelMessages(uiMessages)` normalises UI parts → Anthropic Messages | Map `parts[]` → Anthropic `content` blocks ourselves (text vs. tool_use vs. tool_result) |
| Net | Maybe 300–500 LOC and a class of "subtle streaming bug" disappears | Total control, but we own a small protocol implementation forever |

**Verdict:** Strong win. `useChat` + `tool()` are the least controversial pieces of the stack — small surface area, large savings, easy to back out of.

### 2. Durable agent loop (Workflow DevKit + `DurableAgent`)

| | With WDK | Without |
|---|---|---|
| Crash/redeploy mid-stream | Workflow resumes from the event log, `WorkflowChatTransport` reconnects via `/api/chat/[runId]/stream`. User sees no interruption. | The response is gone. Either the user re-sends, or we build our own Redis-backed token buffer + reconnect endpoint. |
| Tool retries | Each `'use step'` is automatically retried on transient failure with idempotency via `getStepMetadata().stepId` | We write retry/backoff/idempotency by hand, per tool |
| Multi-minute / human-in-the-loop work | `sleep()` and `Hook` wait for hours-to-months without holding a function open | Need a queue (Inngest / Trigger.dev / Temporal) or cron + DB polling |
| Observability | Free per-step traces, token usage, errors in the Workflow dashboard | Wire up our own logging/tracing |
| **Cost we now pay** | Determinism rules: workflow body runs in a sandbox (no `Date.now()`, no `Math.random()`, no I/O outside steps); steps must be **colocated in the same file** as the workflow (see `AGENTS.md` — `chat-workflow.ts` packs the workflow + every step + every tool wrapper in one file because separating them silently broke step registration); failures look like an empty `FatalError` payload until you `grep` the build for `step//…` registrations | None of these constraints exist |

**Verdict:** Real value if we genuinely need durability (long agents, background jobs, human approvals). For a request/response chatbot that finishes in <30s, it's mostly insurance with a non-trivial mental-model tax. The colocation-in-one-file rule and the silent step-registration failure mode are the biggest footguns we'd inherit if we adopted this elsewhere.

### 3. Model routing (AI Gateway)

| | With Gateway | Without |
|---|---|---|
| API surface | One env var (`AI_GATEWAY_API_KEY`), one slug (`anthropic/claude-sonnet-4.5`) | One SDK + one key per provider (`@anthropic-ai/sdk`, `openai`, etc.) |
| Failover across providers | `providerOptions.gateway.models: [...]` for cross-model fallback | We write the fallback ladder |
| Spend / TTFT / token telemetry | Built in dashboard | Build it on top of provider responses |
| Cost | Zero markup (BYOK or pooled credits) | Direct provider cost — same |
| **Cost we now pay** | One more vendor in the request path; opaque routing | None |

**Verdict:** Cheap win for multi-provider apps. For a single-model spike like this one it's a wash — we're using it because it costs nothing to leave on, not because we needed it.

### 4. Sandboxed code execution (Vercel Sandbox) — removed

We started with `Sandbox.create({ runtime: 'node24', … })` inside `fetchVisitorSite`, then took it back out. Recording both shapes for posterity:

| | With Sandbox (initial) | Without (current) |
|---|---|---|
| Use case here | Fetch a public URL the visitor pasted, strip HTML, return text | Same |
| Implementation | Spin up Firecracker microVM, write `/tmp/fetch.mjs`, exec, stream logs, dispose (~80 LOC + ~$0.128/CPU-hr + Vercel-only region `iad1`) | `await fetch(url, …)` + the same regex strip, in-process (~30 LOC, free) |
| SSRF protection | The microVM's network namespace is isolated from the function's | A small `validateVisitorUrl` allow-list (http/https only, blocks loopback / RFC1918 / link-local / IPv6 ULA + link-local) |
| When it pays off | Running **LLM-emitted** code, untrusted user scripts, agent-driven shell commands | Doesn't apply — none of those here |

**Verdict:** Overkill for this spike's actual workload. The sandbox was buying network isolation against SSRF on visitor-supplied URLs; for a Vercel function (no VPC, no metadata service exposed) a literal-IP allow-list gets you most of that benefit at a fraction of the cost and complexity. Removed. Reach back for `@vercel/sandbox` the moment the agent starts executing code (LLM-emitted scripts, agent-driven shell commands) — that's the workload it was built for.

---

## Net pros (what the stack actually saved us)

1. **Streaming + tool-call plumbing** — `useChat`, `WorkflowChatTransport`, `tool()`, `convertToModelMessages` collapse what would be hundreds of lines of bespoke protocol code into config.
2. **Resumable streams for free** — refresh-mid-response just works. Hard to replicate without owning a state store + reconnect endpoint.
3. **Per-tool retries with idempotency** — `'use step'` gives you a retry budget per side-effect without a queue/worker stack.
4. **Multi-provider routing as one env var** — Gateway means swapping Claude for GPT later is a string change.
5. **Tight Vercel integration** — the same `vercel link` / `vercel env pull` flow gives us Gateway auth and Workflow's managed observability without setting up separate accounts.

## Net cons (new abstractions and footguns we now own)

1. **Workflow determinism is load-bearing** — the workflow body can't do I/O, can't use `Math.random()`/`Date.now()` freely, and any side effect must be wrapped in a `'use step'` named function. Forgetting this fails silently or replays incorrectly.
2. **Step colocation rule** — `'use step'` functions **must** live in the same file as their `'use workflow'`, and the directive **must** be the first statement of a *named* async function. Anonymous arrows inside `tool({ execute })` are silently skipped by the SWC transform. We learned this the hard way (see `AGENTS.md`); the failure mode is a runtime empty `FatalError` payload with no stack pointing at the cause.
3. **Verifying "did my step actually register?"** is a `grep` against `.next/server/chunks/*.js` for `step//…` strings. Not great DX.
4. **Vercel lock-in tightens** — Workflow's managed runtime and Gateway routing compose well *on Vercel* and badly elsewhere. Self-hosting WDK is possible but loses the dashboard.
5. **Versioning churn** — AI SDK v6 broke the v5 API in many small ways (`convertToCoreMessages` → `convertToModelMessages` and now async, `generateObject` deprecated, default `stopWhen` jumped from 1 to 20, OpenAI `strict` defaults to `true`). DurableAgent lags ToolLoopAgent in feature parity. Expect to re-learn surface area each major.
6. **Two new pricing meters** — Workflow steps and Gateway credits. Still cheap at spike scale, worth a budget pass before going to production.

---

## Recommendation

- **Adopt now, by default:** AI SDK v6 (`useChat`, `tool()`, `convertToModelMessages`). High value, low lock-in, easy to back out.
- **Adopt when warranted:** AI Gateway. One env var, zero markup — turn it on, leave it on.
- **Adopt deliberately:** Workflow DevKit. Real wins for durability, but it changes how you write functions and adds a debugging layer. Reach for it when the use case is genuinely durable (long agents, scheduled work, human-in-the-loop). Do **not** introduce it just for "free retries" on a 5-second request.
- **Adopt narrowly:** Vercel Sandbox. We tried it for URL fetching and removed it (see section 4). Reach for it the moment we let an agent execute code; otherwise prefer in-process `fetch()` with an SSRF allow-list.

The stack is a real accelerant for AI-feature work — the pieces fit together cleanly and the savings on streaming/tooling alone justify the AI SDK. The risk we're taking on is mostly with WDK: the directive-based programming model is powerful but its silent failure modes and tight Vercel coupling mean we should adopt it project-by-project, not as a default.
