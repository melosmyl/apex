# Apex — Product & Code Audit

*Written from direct review of the codebase, not general impressions. Where I'm inferring rather than having confirmed something directly, I've said so.*

---

## 1. The Boardroom experience — this is where "horrible" is coming from

I read the actual flow end to end: `ModeSelector.jsx` → `BoardDebate.jsx` → the `runBoardDiscussion` backend. Three specific, fixable problems:

**A. Six modes to choose from before you can even ask a question.**
Quick Ask, Working Session, Board Debate, Task Request, Review, Live Conversation — presented as a grid of cards, with an *optional* AI "suggest a mode" button sitting on top of that. A founder has to either read six descriptions and pick one, or type their question, wait for an AI recommendation, then click again to actually start. That's real friction stacked on top of the thing that should be the most immediate: talking to your board.

**B. The debate itself is a black box.**
Once you start, the entire multi-round discussion — independent responses, challenge round, chair synthesis — happens entirely server-side. The UI shows one static line ("The board is in executive discussion") with a pulsing icon, for however long the whole thing takes, then dumps the complete result at once. For a product whose whole pitch is *watching your board debate*, there's currently no debate to watch — just a wait, then a wall of text. This is very likely the core of what feels bad.

**C. You re-pick your board every single time.**
`BoardDebate.jsx` requires re-selecting at least 3 advisors from scratch on every new question, with no memory of "my usual board for this kind of question."

**What I'd actually build, when we get to it:** collapse the mode choice into a single input with the AI silently routing to the right mode behind the scenes (only surface mode choice as an optional override, not a mandatory first step) — and stream each advisor's response into view as it completes, so the founder watches the debate build in something closer to real time, rather than waiting on a spinner. This is a genuine product decision, not just a coat of paint, so worth deciding together before I build it rather than me just picking.

---

## 2. Document generation — better than I expected, but disconnected from your new brand

I read the actual generation prompts (`generate-deliverable/entry.ts`) expecting to find the weak point, and honestly the architecture is solid: it generates a real structured spec via LLM first, explicitly asks for 300+ word executive summaries, 200+ word analysis sections, real metrics tables, and — genuinely good practice — instructs the model to **only cite real sources and state explicitly when none exist**, rather than let it invent citations. That's not "basic" prompting.

Two real issues I did find:

**A. The generated Word documents are still visually stuck in the old design.**
`buildDocxReport.ts` hardcodes color `7A5C3E` (a warm tan/brown) and `E8E2D8` (light cream) as its accent palette, and sets every font to `Calibri`. That's the *old* cream-and-gold identity we replaced on the website — the documents your advisors hand you still look like the version of Apex from before the redesign, with a completely generic Office font on top. This is a concrete, fixable mismatch between your brand and what founders actually walk away with.

**B. Context depth is shallow.**
Document generation pulls only the last 5 decisions, 5 projects, and 5 knowledge documents into context — and nothing from actual board meeting transcripts. So a generated strategy document doesn't actually "know" what your board argued about last month, only a one-line summary of what was decided. That's a real gap between "the board wrote this" and "the board actually remembers the reasoning behind it."

---

## 3. "Making the agents the best" — concrete, not vague

What's already genuinely good, confirmed by reading the code: the discussion engine explicitly instructs advisors to challenge each other and change positions when persuaded (the "truth over harmony" principle), there's real retry-then-fallback logic across two providers, and structured-output validation with repair. That's a stronger foundation than most AI-advisor products ship with.

What would move this from "good" to "best," in order of impact:

1. **Give advisors real memory, not just a company blurb.** Right now every call rebuilds context from scratch — a short company description plus the current question. An advisor never references "what we decided about pricing in March" unless you happen to paste that in. This is the single biggest lever, and it's also the exact feature — a relationship that deepens over time — you described as core to the original vision back when we first scoped this idea. It's still not built.
2. **Route by task difficulty, not one model for everything.** Every advisor currently defaults to `gpt-4o` regardless of whether the question is "draft a quick email" or "should we raise a Series A." Using a stronger reasoning model for genuinely hard strategic questions, and a cheaper/faster one for routine tasks, would improve quality where it matters and cut cost where it doesn't.
3. **Let founders correct advisors, and have that stick.** No mechanism currently exists for "actually, we're not doing that" to change how an advisor reasons going forward — every meeting starts from the same static persona.

---

## 4. Smaller things worth knowing about, lower priority

- **Gamification is thin relative to the pitch.** The dashboard's "Time Saved" and "Momentum" widgets are a number and a streak counter — reasonable as far as they go, but a long way from the richer reward system in your original vision.
- **Two payment systems still coexist** (Stripe fully wired in, plus a Wix payments webhook) — flagged earlier in this project and still unresolved. Worth deciding which one is actually live before real money moves through this.
- **The enterprise contact email is still your personal iCloud address**, per your own earlier call to leave it since there's no traffic yet — just noting it's still there for whenever that changes.
- **Document taxonomy is large** — 30+ document types in one enum. Not urgent, but likely more categories than any single founder will ever use, and could be trimmed later for a cleaner document library.

---

## Suggested order, given everything above

1. Finish the functional migration (`runBoardDiscussion`, `runChairSynthesis`, deliverable generation) — the plumbing has to exist before UX changes have anything to attach to.
2. Redesign the Boardroom flow (mode-collapse + live/streaming debate view) — do this *as part of* porting `runBoardDiscussion`, since it touches the same backend and frontend together.
3. Fix the document visual identity (new fonts/colors in `buildDocxReport.ts` and the other builders) — small, contained, high visible impact.
4. Add board memory (advisors referencing real past decisions/discussions) — the biggest single upgrade to agent quality, and the thing that makes this feel like an actual ongoing relationship rather than a fresh stranger every time.
5. Everything else on this list, roughly in the order listed above.
