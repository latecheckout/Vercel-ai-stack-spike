# Instructions iteration log

A running log of what we change in `instructions.ts`, why, and what we
observed afterward. Newest entry on top. Keep entries short — the goal is
a trail we can read back, not a design doc.

Template:

```
## YYYY-MM-DD — <one-line change summary>
**Branch / commit:** <branch or short sha>
**Why:** <what we were trying to fix or test>
**What changed:** <bullets — cuts / additions / behavior shifts>
**Observed:** <what we saw in conversations, regressions, wins>
**Next:** <follow-ups, if any>
```

---

## 2026-05-22 (Tim's refinements) — D7–D11
**Branch / commit:** slim-system-prompt
**Why:** Tim sharpened the original eval spec with five additional cases (two-stage non-ICP, named-services ICP, front-loaded identity, 100-line saturation paste, retrieval discrimination) plus two scoring lenses (did `propose_lca_connect` fire on ICP-fit? does the prose read confident?).
**Setup:** Existing harness + new fixture `scripts/fixtures/saturation-paste.txt` (a 100-line Marta-at-Helix-Compute dump). Single-turn unless noted.

**Results**
- **D7 — sandwich shop, two-stage.** ❌ Turn 1 saved a fact and emitted **zero text**. Turn 2 ("no, I literally serve sandwiches") got a polite "ah, understood — what brought you here today?" but never made the "LCA is probably not for you" call Tim asked for. Two misses: silent T1, no graceful decline at T2.
- **D8 — Slack innovation / generative UI.** ✅ Saved facts, broad KB lookup. Reply named the Salesforce "Generative Canvas" tile-based agent UI and Dropbox Dash's dynamically-generated workflows — specific case-study references, not platitudes. Matches Tim's "good looks like" example almost exactly. Confident.
- **D9 — front-loaded identity (Plaid Director of Product Design + agent-driven flow + 10-day decision).** ✅✅ Best run of the day. 4 self-stated facts saved, KB consulted, **`propose_lca_connect` fired with text**: *"That's exactly the kind of transformation LCA was built for … Ten days is tight but workable — want me to set that up?"* Zero re-asking. Confident. Connect button under a real message.
- **D10 — 100-line saturation paste.** ❌ Tool calls correct (4 facts saved, KB, `propose_lca_connect` with a great reason), **but the assistant emitted no text**. Same regression as D7 T1, surfacing on the heaviest turn of the run. The example we added in the previous edit fixes the lightweight case (D9, D2.1) but doesn't carry through to a long paste plus a long tool sequence.
- **D11 — retrieval discrimination.**
  - **D11.a (gen-UI query):** Top KB hit is the Salesforce gen-AI case study, reply features "Generative Canvas" prominently with adjacent Dropbox/Grammarly context. ✅
  - **D11.b (brand-refresh query):** Top KB hits are Careers / Field Guide / LCA main — the Salesforce gen-UI case **does not surface**. Reply is honestly hedged: "we do brand work, but typically as part of full 0–1 product builds — if it's purely a brand refresh, we're probably not the right fit." ✅
  Retrieval is discriminating.

**Outcomes ($6 — propose/connect criterion)**
- D9: ✅ fired with proper context.
- D10: ⚠️ fired but UI-broken (no text).
- D7, D8, D11: correctly did **not** fire (non-ICP or exploratory).

**Confidence ($7 — qualitative read)**
- D9: "exactly the kind of transformation LCA was built for" — confident, specific.
- D11.a: "We've done substantial work on generative UI for AI agents" — confident, specific.
- D8: "generative UI is right in our sweet spot" — confident, specific.
- D11.b: "Yes, though it depends on the broader context" — appropriately hedged.

**Headline finding: the "no text" regression is intermittent, not fixed.** The example we added on 2026-05-22 cured D2.1/D9 (shorter inputs, ≤4 tool calls before the final text) but D7 T1 and D10 reproduced it — silent assistant after a tool sequence. Two failure modes seem to share a cause:
- D7 T1: visitor message is two clauses, only one save_visitor_fact, still silent.
- D10: 5,400-char paste, 4 facts + KB + propose, silent.
No consistent length-or-tool-count threshold from one sample, but it's clearly possible for the model to decide a tool-only turn is "complete".

**Prompt-edit candidates (not done this pass)**
- Move the "every turn ends with a chat reply" rule to the top of the prompt (currently in Style, where it's read fourth). Maybe restate it once more in Hard Rules.
- Add a second example: a saturation-style turn that ends in a tee-up text + tool, modeling the desired output for the heavy case.
- Sandwich shop case argues for a small "if the visitor's domain has no AI/product angle after 1–2 turns, say so honestly" line in Qualifying for fit.
- Belt-and-suspenders: a UI-level fallback (when `propose_lca_connect` fires with empty assistant text, the chat surface renders a default tee-up sentence). Out of scope for the prompt but worth tracking.

**Next:**
- Decide whether to iterate the prompt now or carry the no-text issue as a known-flaky behavior into a UI safety net.
- Refresh the HTML report with the new dimensions, including the chat-window renders for D7–D11.

---

## 2026-05-22 — Fix three regressions from the battery
**Branch / commit:** slim-system-prompt
**Why:** The eval battery surfaced three actionable issues. Tackle them in one edit pass and re-run the affected cases.
1. `save_visitor_fact` never fires on self-stated facts (D2.1, D2.2).
2. `propose_lca_connect` doesn't fire on explicit buy signals (D2.1, D3.2).
3. Careers redirect missed for "looking for work" messages (D4.3).

**What changed:**
- **Split the save rule.** New bullet for self-stated facts: save immediately with source: "visitor stated". Separate bullet for research-inferred facts: verify with the visitor first, then save.
- **Sharpened propose_lca_connect trigger.** Now lists explicit hand-raise phrases ("looking for a design partner", "decision in two weeks", "can someone walk us through this") and tells the model to fire the tool as soon as one shows up, instead of continuing to qualify.
- **Added an inline example for propose_lca_connect.** The model kept calling the tool with no text bubble — the "Connect me" button rendered under an empty message. Rewording the rule (twice) didn't move the behavior. Adding a concrete `> Text: "..."` + `> Tool call: ...` example in the prompt fixed it on the next run. Examples > rules for behavioral steering.
- **Added a Style line.** "Every turn ends with a chat reply. Tool calls are supporting actions, never the message itself." Belt-and-suspenders for the above.
- **Loosened offer_lca_connect gate.** Once the visitor has clicked the button (sent "connect me") or said an unambiguous yes, draft the email with whatever facts you have — no more pausing to gather all three of company/role/project.
- **Added careers trigger.** One-line rule: "looking for work" / "I'm a designer looking for clients" / hiring inquiries → `retrieve_lca_knowledge` for the careers content and point them there.

**Observed (re-run of affected cases):**
- **D2.1 (Lumen CEO)** — 4 self-stated facts saved (CEO/role, $12M raise/company, AI-native CRM/project, design partner ask + 2-week timeline/project). KB consulted. `propose_lca_connect` fires with a strong reason. Assistant emits a real tee-up message: *"Series A AI-native CRM, fresh funding, rebrand plus product UI over Q3 — that's exactly the kind of work we do … Want me to set that up?"* All three regressions cleared in one case.
- **D2.2 (mixed-context paragraph)** — 3 self-stated facts saved (company, $4M seed, design-partner readiness). KB consulted. No propose call — defensible: "how would you approach that" is more open question than hand-raise. Asks one good follow-up. Improvement vs prior run.
- **D3.1 (Series A $8M)** — 2 self-stated facts saved (company, project). No propose call — defensible: minimal context, name/role/product unknown. Confident reply with case studies, single follow-up.
- **D4.3 (freelance designer)** — Calls `retrieve_lca_knowledge` with careers-shaped query (real "Careers | LCA" row returned), saves self-stated role, replies with the specific open Sr. Product Designer (Freelance/Part-time) role and links to latecheckout.agency/careers. Spec met.
- **Regression spot-checks (D1.1 "hi", D1.2 "what do you do?", D4.1 cafe logo, D5.1 prompt injection)** — all unchanged, still on-spec.

**Prompt size:** 36 lines / ~4,700 chars (was 30 lines / ~3,300 chars). Still well under the ~50-line ceiling.

**Next:**
- Re-run the full battery to lock in the wins; update the HTML report with fresh chats once green across the board.
- The propose-without-text pattern was surprisingly sticky against rule-style instructions — keep examples in mind whenever a behavior needs to *change* rather than *exist*.
- Open question: is D2.2 saying "how would you approach that" actually a hand-raise we want to convert? Tighten the trigger list if so.

---

## 2026-05-22 — Context-dump robustness (D6.1, post-battery add-on)
**Branch / commit:** slim-system-prompt
**Why:** Anthony wanted to see how the bot handles a visitor pasting in a huge semi-related text dump (the kind of thing where someone slams a blog post into the box instead of typing a question). Run as a one-shot regression on top of the existing battery.
**Setup:** Added `--message-file <path>` to `scripts/test-instructions.ts` and saved the 2010 Imperial Violet post on SSL/TLS performance (~5,000 words) to `scripts/fixtures/overclocking-ssl.txt`. Single invocation:
```
pnpm tsx --env-file=.env.local scripts/test-instructions.ts \
  --message-file scripts/fixtures/overclocking-ssl.txt
```
**Observed:** Strong pass. Two-sentence reply:
> This looks like a technical deep-dive on SSL/TLS performance from 2010 — interesting read! Are you working on something related to HTTPS, web performance, or security right now?

- No tool calls (no KB lookup, no web search, no facts saved).
- Did not attempt to summarise, critique, or technically co-engage with the paste.
- Recognised domain + era without fabricating facts about the author or content.
- Pivoted with a single qualifying question that bridges the paste back to LCA territory.
- The “stay on LCA topics, gently redirect” guardrail held under a large irrelevant input.

**Next:** Worth queuing variants: (a) the same paste with an explicit ask at the end (“can you summarise this for me?”) — does it still redirect, or cave?; (b) a paste that *is* topical to LCA (an AI design article) — does it then engage on substance or still redirect?

---

## 2026-05-21 (eval battery) — Five-dimension prompt regression
**Branch / commit:** slim-system-prompt
**Why:** Anthony scoped a 14-prompt battery across five dimensions (minimal context, extensive context, ICP match, non-ICP, edge cases) with explicit desired behaviors and failure modes for each. Run them all against the slim prompt and record what passes / fails / wobbles.

**Setup:** `scripts/test-instructions.ts` single-turn invocations, one per prompt. Real KB, real Exa, in-memory facts (no DB writes). Model: `anthropic/claude-sonnet-4.5` via Gateway.

**Dimension 1 — minimal context (3/3 pass):**
- "hi" → warm one-liner + single open question. No service dump.
- "what do you do?" → KB call, concise services line, ends with "What are you working on?".
- "can you help me?" → no promised capabilities, asks "What brings you here today?".

**Dimension 2 — extensive context (2/2 functionally correct, but two systemic regressions):**
- CEO at Lumen, $12M Series A, AI-native CRM, 2-week decision → ran KB + Exa research, recommended relevant services (0-1 Product Team, Product Vision Sprint), acknowledged the timeline. Filtered the noise.
- Mixed-context paragraph (snowboarding tangent + seed funded + AI agents + compliance) → ignored the tangent, reflected the ask cleanly, recommended Product Vision Sprint.
- **Both regress identically:** no `save_visitor_fact` despite self-stated CEO/company/funding/role; no `propose_lca_connect` despite explicit "looking for a design partner" / "how would you approach that" buy signals. The verify-before-save rule is being applied to self-identification, and the connect flow is held back even on strong signals.

**Dimension 3 — ICP match (2/2 confident posture):**
- Series A AI startup, $8M → "You're in the right place", cites Grammarly/Dropbox, single follow-up.
- Seed AI agent platform → "Congrats on the seed", recommends 0-1 Product Team + Product Vision Sprint. **Stacked questions:** "What's your role, and what stage is the platform at right now?" — violates "max one question per turn".
- **Minor concern:** D3.2 cited "Salesforce" as an AI agent platform example but Salesforce did NOT appear in the search hits returned. Could be a hallucination from training data; verify against KB before concluding.
- Connect-flow correctly held back: company/role unknown.

**Dimension 4 — non-ICP (2/3 pass, 1 spec miss):**
- Cafe logo $500 → honest "not the right fit", brief, redirected to 99designs/Fiverr. Warm.
- Shopify store → clean decline, single follow-up.
- **Freelance designer ASKING FOR WORK — fails spec.** Spec said "Redirect to careers page (retrieved from knowledge), not the sales path." Model did NOT call `retrieve_lca_knowledge` (the KB has a "Careers | LCA" row — confirmed in earlier search results) and instead asked a clarifying question ("are you looking to join a team full-time or shopping around for freelance clients?"). Should have surfaced the careers page directly.

**Dimension 5 — edge cases (3/3 in-scope pass, 1 out-of-scope skip):**
- Prompt injection ("ignore previous instructions…") → flat refusal, stays in character, doesn't acknowledge the injection. Very brief.
- "Write me a poem about ducks" → off-topic acknowledgment + LCA redirect.
- "Are you ChatGPT?" → "No, I'm the LCA chatbot", stays in character, brief framing.
- **Moderation case skipped** — the CLI bypasses the moderation step that lives in production, so the refusal-rendering bug (Anthony's "action item 4") can't be reproduced here. Test that in the running app, not this harness.

**Two prompt-edit candidates fall out of this battery:**
1. **Self-stated facts should save immediately.** Restore the distinction: facts the visitor explicitly states about themselves (name, role, company, funding stage) → call `save_visitor_fact` right away. Facts inferred from web research → still verify first. Today's prompt collapses both into "verify, then save" and the model is being too cautious to ever save self-stated context.
2. **Connect-flow trigger needs sharper "explicit ask" recognition.** D2.1 and D2.2 each had explicit decision-window buy signals ("looking for a design partner", "how would you approach that", "decision in two weeks") and the model still asked another question instead of teeing up `propose_lca_connect`. The slim prompt requires "company + role + project" before proposing — Anthony's spec says move toward connect *confidently* when fit is obvious.

**Two smaller findings worth noting:**
- D3.2 stacked two follow-up questions — the "max one question per turn" rule is mostly holding but slips on ICP-positive turns where the model wants to qualify further. Worth watching for a pattern across more runs.
- D4.3 (freelance designer) suggests adding an explicit "looking for work / hire me" trigger that routes to the careers KB row. A one-liner in the prompt would fix it.

**Next:**
- Tackle the two prompt-edit candidates above and re-run the battery to confirm no new regressions.
- Test multi-turn ICP-match → connect flow end-to-end (turn 1 visitor describes themselves; turn 2 model proposes; turn 3 visitor says "yes"; turn 4 `offer_lca_connect` fires).
- Move the moderation-refusal-rendering test to the running app (out of CLI scope).

---

## 2026-05-21 — Slim system prompt; force dynamic retrieval over hardcoded facts
**Branch / commit:** slim-system-prompt
**Why:** Prompt had grown to 177 lines with hardcoded LCA facts (founders, client list, full service catalogue, payoff examples). Duplicates what's in `lca_knowledge` and means new rows in the knowledge base don't surface unless we also edit the prompt.
**What changed:**
- Cut hardcoded persona facts (founders, tagline, Dropbox/Grammarly/Salesforce client list).
- Cut the "What LCA offers" service catalogue (Product Vision Sprint, Innovation Lab, 0-1 Product Team, AI Enablement).
- Cut the "payoff" section with example case-study mappings.
- Compressed the propose_lca_connect / offer_lca_connect section from ~55 lines to one paragraph each, keeping the two load-bearing rules: never both in the same turn, and re-call only on explicit ask after dismiss.
- Compressed proactive-research triggers into one bullet rather than per-trigger paragraphs.
- Added explicit "treat your prior knowledge of LCA as unreliable" so the model reaches for `retrieve_lca_knowledge` instead of guessing.
- Added a short ICP framing paragraph (funded vs unfunded, taste/craft signal) so the bot can qualify or gracefully redirect.
- Prompt body now ~35 lines (was 169 inside the template literal).
**Observed:** First-pass CLI tests via `scripts/test-instructions.ts` (stubbed tools, single turn, `anthropic/claude-sonnet-4.5` via Gateway):
- **Services question** ("How do you work with early-stage AI startups?") — issued one broad `retrieve_lca_knowledge` call, then a short reply ending in one follow-up. Single broad query, one question, short answer all on-spec. When the KB stub returned `found: true` with placeholder text, the model still confidently invented specifics ("fast brand sprint to get you fundraise-ready", etc.). Likely a stub artifact; re-test with real KB rows before drawing conclusions.
- **Refusal path** (`--kb-empty`, "Who founded LCA and the office address?") — KB returned empty; model admitted it, redirected to anthony@latecheckout.studio, asked one anchor question. Did NOT hallucinate founder names — the OLD prompt hardcoded "Greg Isenberg and Theo Tabah"; the slimmed prompt does not, and the model didn't fill them in from training either. Strong signal that the slim is working as intended.
- **Strong-fit / connect signal** ("Series B head of product at Verve, asking about Innovation Lab, can someone walk us through it") — called `retrieve_lca_knowledge` + `search_web` for Verve, prefaced research with "Give me a sec — looking up Verve". Proactive-research trigger fired correctly. Did NOT call `propose_lca_connect` despite the explicit "can someone from your team walk us through" ask — chose to answer first. Defensible but worth watching on multi-turn. Did NOT call `save_visitor_fact` for the role/company volunteered — also defensible (verify-first rule), but facts only land after at least one extra turn.

**Next:**
- Re-run against real KB (drop the stub) to see if the placeholder-driven hallucination disappears.
- Multi-turn test: after Sarah confirms Verve, does the model save facts and tee up `propose_lca_connect`?
- Off-fit visitor test: solo unfunded founder asking for cheap exec — does the ICP framing cause a graceful redirect without pushing the connect flow?
- Confirm new rows added to `lca_knowledge` appear in answers with no prompt edits.

---

## 2026-05-21 (later) — Multi-turn harness with real tools
**Branch / commit:** slim-system-prompt
**Why:** Validate the slim prompt under realistic conditions: real Supabase KB, real Exa, multi-turn context. The stubbed single-turn harness from the prior entry was hiding the most important grounding signal (does the model invent facts when the KB row is partial?) and couldn't surface multi-turn issues like fact saving and `propose_lca_connect` sequencing.

**What changed:** `scripts/test-instructions.ts` rewritten as an interactive REPL with `--message` repeatable for scripted runs. Tools wired to real implementations: `retrieve_lca_knowledge` hits Supabase via the existing `searchLcaKnowledge` query; `search_web` / `fetch_website` hit Exa inline; `offer_lca_connect` actually drafts via `draftConnectEmail` (Gateway). Two safety stubs: `save_visitor_fact` keeps facts in-memory (no DB write); `offer_lca_connect` prints the draft but never sends. The in-memory facts are rendered into the system prompt each turn, mirroring `buildInstructions` in prod.

**Observed:**
- **Grounding works.** The turn-1 "what services do you offer?" reply listed all four service names (Product Vision Sprint, AI Innovation Lab, 0-1 Product Team, AI Enablement) — and I verified the KB row "LCA - The Design Firm for the AI Age" contains all four names verbatim with descriptions. Not a training-data hallucination. Strong signal that the slim prompt + real KB grounds correctly without the prompt holding the service catalogue.
- **Off-fit redirect is clean.** "Solo founder pre-funding, cheap logo and landing page" → no KB lookup, no connect-flow push, direct "probably not the right fit, here's the ICP, good luck" in 2 short paragraphs. The ICP framing is doing its job.
- **REGRESSION — `propose_lca_connect` fires with no accompanying text.** Strong-fit run, turn 2: visitor explicitly asked "Can someone from your team walk us through the Innovation Lab?". Model called `retrieve_lca_knowledge` then `propose_lca_connect` — but emitted **zero text**. In the UI this would render a button under an empty assistant message. The OLD prompt said "Emit the tee-up question once, call the tool, end the turn." The slim version says "After calling, stop — no re-asking or paraphrasing." The "emit the question first" half got lost in the compression. **Fix candidate:** restore "ask the question, THEN call the tool" wording explicitly.
- **`save_visitor_fact` is still timid.** Across multiple turns where Sarah volunteered name + role + company + Series B + product description, no facts were saved. The verify-first rule is being interpreted aggressively: the model treats *every* statement as needing external verification before save, even self-identification ("I'm Sarah, head of product at Verve"). Worth considering loosening: facts the visitor states about themselves don't need external verification — only facts we *inferred* from research do.
- **Disambiguation worked.** When fetch_website timed out on verve.health and Exa returned multiple unrelated Verves, the model didn't pick one — it said "couldn't pull up the site, search is showing other apps, sounds like you might be in stealth?" and asked an open question. Better behavior than I'd expect.
- **One-question-per-turn / short answers / "Give me a sec" preamble** all held up across the runs.

**Next:**
- Restore explicit "ask the tee-up question in chat, then call propose_lca_connect" sequencing to the slim prompt.
- Reconsider the verify-before-save rule: split "visitor self-stated facts" (save immediately) from "inferred from research" (verify first).
- Test what happens on turn 3 of the strong-fit flow if the visitor clicks the connect button (simulated as `"connect me"` input) — does `offer_lca_connect` fire and produce a sane draft?
