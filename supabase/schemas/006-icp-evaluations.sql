-- ICP (Ideal Customer Profile) evaluations the agent has produced for a
-- session. One row per evaluation pass; the latest row per session is what
-- the UI surfaces. Keeping history (rather than a single column on
-- `sessions`) lets us see how a visitor's fit shifted as they shared more
-- — useful both for debugging the eval prompt and for future analytics.
--
-- The evaluator runs in the workflow's `onFinish` step after each turn, so
-- one row per assistant reply is the natural cadence. There is no FK to
-- messages.id because the eval may straddle multiple messages and is
-- driven by the *cumulative* state of facts + transcript.
create table public.icp_evaluations (
  id              uuid        primary key default gen_random_uuid(),
  session_id      uuid        not null references public.sessions (id) on delete cascade,
  -- 0-100 overall fit score. 100 = textbook ICP, 0 = clear no-fit.
  score           int         not null check (score between 0 and 100),
  -- Coarse bucket for the UI badge. Computed by the evaluator alongside the
  -- numeric score so the prompt can override the cutoff on edge cases.
  tier            text        not null check (tier in ('high', 'medium', 'low', 'unclear')),
  -- 1-3 sentence prose summary of the reasoning. Shown in the UI under the
  -- score.
  rationale       text        not null default '',
  -- Structured per-signal breakdown — kept as jsonb so we can extend the
  -- evaluator's signal set without a schema change. Expected shape:
  --   {
  --     "funding_status": "funded" | "unfunded" | "unknown",
  --     "company_stage":  "enterprise" | "venture_backed" | "growth" |
  --                       "smb" | "individual" | "unknown",
  --     "ambition":       "high" | "medium" | "low" | "unclear",
  --     "engagement_fit": "high" | "medium" | "low" | "unclear",
  --     "anti_signals":   string[]
  --   }
  signals         jsonb       not null default '{}'::jsonb,
  -- One-line suggestion for what LCA should do with this visitor next
  -- (e.g. "Offer a connect to a partner", "Keep nurturing", "Politely
  -- decline"). Shown as a small hint under the rationale.
  recommendation  text        not null default '',
  created_at      timestamptz not null default now()
);

comment on table public.icp_evaluations is 'Per-turn ICP fit evaluations. Latest row per session is what the UI shows.';

-- Latest-per-session lookup hits this index (desc on created_at).
create index icp_evaluations_session_id_idx
  on public.icp_evaluations (session_id, created_at desc);

alter table public.icp_evaluations enable row level security;

-- Spike RLS — same pattern as the other tables: open to anon + authenticated
-- with four explicit policies. The workflow step worker runs without the
-- visitor's auth cookies, so insert needs to pass without a session
-- predicate.
create policy "anyone can read icp_evaluations"
  on public.icp_evaluations
  for select
  to anon, authenticated
  using (true);

create policy "anyone can insert icp_evaluations"
  on public.icp_evaluations
  for insert
  to anon, authenticated
  with check (true);

create policy "anyone can update icp_evaluations"
  on public.icp_evaluations
  for update
  to anon, authenticated
  using (true)
  with check (true);

create policy "anyone can delete icp_evaluations"
  on public.icp_evaluations
  for delete
  to anon, authenticated
  using (true);
