# Apex — Build Plan

**For:** Claude Code
**Repo:** `melosmyl/apex` · **Host:** Vercel · **Backend:** Supabase (Postgres + Edge Functions + pgvector)
**Goal:** Get Apex to a complete, launchable product, then hand it to ~10 testers.

---

## Context you need before starting

**What Apex is:** an AI board of advisors for people starting a business. At signup the founder assembles a custom board (marketing director, CFO, legal advisor, etc.). The board holds structured meetings, genuinely debates questions, produces decisions, and delegates tasks.

**Core principle — "truth over harmony."** Advisors must disagree with each other and with the founder. Never soften an advisor into agreement to make output feel cohesive. If a change would make advisors converge more readily, it is the wrong change.

**Who this is for — read this carefully, it drives several decisions below.**
Not the technical SaaS founder. The target is a career-changer with some savings and no startup vocabulary: someone leaving a long career to start something, someone with an idea and a part-time job. They do not know what a cap table is. They often cannot formulate a well-posed strategic question — their real state is "I don't know what I don't know."

**Accessibility requirement.** A significant part of the audience (including the product owner) has ADHD. Two consequences that are not optional:
- Progress must produce immediate, visible feedback. Delayed reward is functionally no reward.
- Nothing may punish a gap in usage. No broken streaks, no progress that resets, no guilt-toned copy after an absence.

**Competitive position.** Rival products (SynthBoard, Pancake, AI Cofounders, Titanom, Polsia) have debate, multi-model routing, integrations and APIs. What they do **not** have: advisors that persist and accumulate judgment across months, accountability follow-up, and a path for a non-technical beginner. Do not chase their feature surface. Depth on continuity beats breadth on features.

---

## Phase 1 — Finish what's open

No new features. Close existing gaps so the app is coherent.

### 1.1 Complete the board memory system
- Finish the pgvector semantic-relevance retrieval so advisors surface *topically relevant* past decisions, not merely recent ones.
- Keep the memory instruction **mandatory**, not permissive — the permissive version produced 0/5 advisors citing recalled decisions; mandatory produced 5/5.
- Memory must change *judgment*, not just recall facts. An advisor referencing a past decision should reason differently because of it, not simply cite it.
- Keep the post-creation embedding approach. Do not move decision creation server-side.

### 1.2 Document branding
- `buildDocxReport.ts` and the other document builders still use the pre-redesign cream/tan palette and Calibri.
- Update to the current identity: Space Grotesk (headings), Inter (body), IBM Plex Mono (labels/data), paper-white background, near-black foreground, signal-amber accent, 6px base radius.

### 1.3 Resolve duplicate payment systems
- Stripe and a legacy Wix webhook both exist. **Keep Stripe. Remove the Wix webhook path entirely.**
- Verify no code path can still route a payment through Wix before deleting.

### 1.4 Trim document taxonomy
- 30+ document types in one enum is more than any founder will use. Reduce to the set that is actually reachable from the UI.

**Definition of done for Phase 1:** every feature visible in the UI works end to end. No dead buttons, no half-migrated paths.

---

## Phase 2 — The retention loop

This is the most important phase. It is what makes Apex a team rather than a tool, and it is the thing competitors structurally cannot copy, because their advisors do not persist between sessions.

### 2.1 Advisors acknowledge completed work
When a founder completes a task, the advisor who assigned it responds — **by name, in their own voice, referencing the specific task.**

- Not a toast notification. Not a badge. A short message from that advisor.
- Tie to the existing `source_meeting_id` linking between tasks and meetings.
- Tone: recognition of consequence ("that was the thing blocking the pricing work"), not praise for its own sake.

### 2.2 The chair opens meetings with what moved
Every board meeting begins with the chair summarising what changed since the last one: tasks completed, decisions acted on, commitments still outstanding.

### 2.3 Accountability follow-up
Advisors ask about past commitments that were never closed. Framing must be curious, not accusatory — "what happened with X?" not "you failed to do X."

### 2.4 Progress that cannot go backwards
- Replace or rework the current "Time Saved" and "Momentum" widgets. They are too coarse to reward daily effort.
- Introduce a visible build state — the business becoming progressively more complete, module by module — derived from **real** data (decisions made, tasks closed, modules filled), never a cosmetic number.
- **Hard rules:** progress never resets; streaks survive missed days; returning after an absence triggers a "welcome back, here's where we were" state, never a penalty.

### 2.5 Preserve the commitment moment
`FounderDecisionControls` has an explicit "I commit to this" action. **Keep it.** Do not auto-create tasks from every board suggestion — that erodes founder agency and is the moment the founder takes ownership.

---

## Phase 3 — The beginner path

The segment nobody else serves. This is the strategic reason Apex exists rather than a better SynthBoard.

### 3.1 Branching signup
Two paths from the start:
- **Idea-stage / career-changer** — no business yet, no vocabulary
- **Early-traction** — existing business, some numbers

### 3.2 The board asks first
On the beginner path, the founder does **not** need to arrive with a formed question. The board opens by asking *them* — surfacing what they should be thinking about next.

This inverts the entire category. Every competitor waits for a well-posed strategic question. That design silently excludes the beginner.

### 3.3 Language check
No unexplained startup jargon anywhere on the beginner path. Test: would this make sense to someone who has never read a startup blog?

### 3.4 Presentation of disagreement
Debate remains the engine — advisors must still genuinely disagree. But for a beginner, five confident people contradicting each other reads as stress, not insight. Surface the synthesis and the decision prominently; keep the full debate available but not the default view.

Keep legible uncertainty (confidence levels, minority opinions, unresolved assumptions) — but present it as useful honesty, not as unresolved chaos.

---

## Phase 4 — Proof

Start during Phase 3; do not leave until the end.

### 4.1 Free first board meeting, no signup wall
One real question, one real board meeting, transcript and decision document to keep. No account, no card.

Honest scarcity if needed: one free meeting per person, because each costs real money to run.

**Deliverability risk flagged 2026-08-12, before this gets real traffic.** Real-inbox testing (not Mailinator, which can't reveal this) confirmed the confirmation email lands in spam on both Gmail and Outlook — cold-start sender reputation on a brand-new domain, not a config bug (SPF/DKIM/DMARC all correctly set up via Resend + a monitor-only DMARC record). For the 10 known testers (4.3) this is solved with a one-line heads-up, since they're being messaged personally. **That fix doesn't work here** — free-meeting visitors are strangers who convert via "Keep this board" with no reason to think to check spam, so a cold domain silently loses them at the exact moment they'd have become a real account. Revisit domain reputation (organic warming should already be underway from 4.3 traffic, but verify) before spending anything on driving real volume into the free-meeting funnel.

**Self-serve account deletion — same threshold, flagged 2026-08-12.** The Privacy Policy (shipped 2026-08-12, `/privacy`) promises deletion on request, but today that's a manual process — email in, delete by hand. Fine for 10 people you're messaging personally (4.3); not fine once strangers are arriving through the free-meeting funnel at any real volume, both operationally (manual deletion doesn't scale) and as a trust signal (a real product lets you delete your own data). Build before this funnel gets real traffic, not before the ten testers.

### 4.2 Publishable transcripts
Make real board sessions exportable and shareable — specifically ones where advisors visibly disagree. This is the proof asset; the product and the demonstration are the same object.

### 4.3 Ten testers
Hand to ~10 people once Phases 1–3 are done. From each, request: name, business, and an answer to one specific question — *what did an advisor tell you that you didn't want to hear, and were they right?*

---

## Queued — core debate mechanic upgrades (after the Assistant)

Captured 2026-08-12. Not urgent, not started — both strengthen the core debate mechanic, which is the product's differentiator. Finish the Assistant first; take these up after.

### Advisors as pressures, not roles
Currently each advisor answers within their specialism, which produces a chorus of parallel opinions rather than genuine conflict. Instead, each advisor should be responsible for protecting something specific:

- Finance protects runway and economic coherence
- Marketing protects attention and market legibility
- Product protects user value and product integrity
- Operations protects executability
- Strategy protects direction
- The founder protects intent

The point: disagreement becomes structural rather than prompted. Two advisors conflict because their mandates genuinely conflict on this specific question, not because the prompt told them to be contrarian. This is a change to how advisor system prompts are written in `advisorLibrary.js`, not new architecture.

Keep it beginner-legible — the mandate should be expressed in plain language, not MBA vocabulary. This is for someone who's never read a startup blog (see "Who this is for" above).

### Epistemic states instead of a single confidence number
The Chair's synthesis currently produces one confidence score. Replace or supplement with a discrete state:

- **consensus** — strong convergence
- **recommendation** — majority position, with objections named
- **split decision** — legitimate competing paths, no winner
- **insufficient evidence** — don't pretend we know

"The board does not agree" must be a valid, well-presented outcome rather than a synthesis failure. This fits the existing legible-uncertainty work (3.4) and is more honest than a percentage.

Schema constraint: keep it flat — a single enum field alongside the existing text fields, not a nested object. Large/nested-object schemas have a confirmed, reproducible failure mode in this codebase independent of provider (see `generateOnboardingPlan`'s history) — this is a hard constraint on the implementation, not a style preference.

---

## Queued — infrastructure, not before the tester round

**Second Supabase project for non-prod.** Right now local dev and production point at the same hosted Supabase project (`bqqcobaspbkyofupmhfe`) — same Auth backend, same edge functions, same secrets. That was fine while it was just the founder building, but it means there is no environment where a dev/test value (a Turnstile test key, a throwaway secret, seed data) can exist without it being live for real users too. Surfaced concretely during the free-meeting Turnstile bypass work: dev-only bot-protection keys are not safely achievable without this, so that work shipped as a frontend-only site-key swap instead, with the backend/secret side deliberately left untouched.

Do this once there's a real tester round to protect, not before. Involves:
- A second Supabase project (own dashboard, own Auth config, own captcha settings)
- Migrations replayed onto it (same `supabase/migrations/` history)
- Seed data for local/test use, kept separate from real user data
- Separate secrets (Turnstile test keys, any provider keys) provisioned on the new project, live keys staying only on the real one
- Env plumbing so local dev points at the new project by default, without disturbing how the deployed app finds the production one

---

## Phase 5 — Only after people return

Do not start these until there is evidence testers come back unprompted.

- **Advisor calibration** — log advisor predictions, grade them against outcomes, surface per-advisor accuracy. Genuinely unclaimed by every competitor; compounds with age; cannot be shipped overnight by a rival.
- **Dissent rate as a visible metric** — a meeting where every advisor agreed should look suspicious, not reassuring.
- **Multi-model routing by advisor type** — stronger reasoning models for hard strategic questions, cheaper/faster for routine tasks. Currently everything defaults to one model.
- **Founder-pattern memory** — memory about the *person* ("you've abandoned two projects at month two"), not only the business.
- **Perk partnerships** — milestone-unlocked startup-programme credits (hosting, bookkeeping, domains). Zero cost, real value. Only worth pursuing once there are users to offer a partner.

---

## Explicitly out of scope

Do not build these. They are competitor surface area aimed at a different buyer, and each is permanent maintenance cost:

- Voice mode
- 20+ advisor personas (ten well-drawn advisors beat twenty-four thin ones)
- Multiple "session modes"
- Public REST API / MCP server
- Large third-party integration catalogues (HubSpot, Stripe-as-data-source, etc.) — the target user has no CRM and no revenue data to connect

---

## Standing constraints

- **Supabase Edge Functions:** "Enforce JWT Verification" must be **OFF** for any function performing its own manual auth check, or the platform rejects the request before function code runs. Exception: `adminApi` keeps it **ON** deliberately.
- **Schema changes** go through `supabase/migrations/`.
- **Testing** uses synthetic seed data that is deleted afterwards — keep the database clean of fabricated history.
- **Available time is ~15–20 hrs/week.** Prefer the smaller change that ships.

---

## Working order

1. Phase 1 in full — the app must be whole before anything is layered on it.
2. Phase 2 — the retention loop.
3. Phase 3 — the beginner path, with Phase 4 proof work running alongside.
4. Phase 5 only once testers return unprompted.
