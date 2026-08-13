# Apex — Phase 4: Proof

**Status:** ready to build. Phases 1–3 shipped.
**Purpose:** give a stranger a reason to believe before they commit.

---

## Why this phase exists

Apex has no users other than the owner's own account. Competitors (Titanom, Polsia, SynthBoard) all lead with proof — a free audit with a keepable artifact, a public live feed, a free tier with no card. Apex currently has nothing a stranger can see or try.

**The strategic advantage here:** Apex's product and its proof are the same object. A real board meeting *is* the demonstration. Nobody has to trust a screenshot — they watch advisors disagree about their own problem.

**What Apex cannot prove yet, and should stop trying to:** outcomes. The target user is pre-revenue, so there will be no revenue-growth testimonials for six to twelve months. Do not build anything that implies otherwise. What *is* provable today is the **mechanism** — that the advisors genuinely disagree. That is falsifiable, instant, and unique.

---

## Build order

**4.2 first** (foundation — sharing must work before anything can be shown)
**4.1 second** (the free meeting — depends on 4.2)
**4.3 last** (testers — depends on both)

---

## 4.2 — Real sharing

### The current bug
The Share button on documents copies a link to `/company/{id}/documents` — the whole company's document list, not the specific item, and behind a login wall. Anyone without an account hits a login screen. It looks functional and does nothing useful.

### What to build

**Public read-only access at the individual item level**, for both documents and meeting transcripts.

- Unguessable share tokens, not sequential IDs.
- Sharing is **off by default**. The owner explicitly enables it per item.
- Owner can revoke a share link at any time; revocation takes effect immediately.
- Shared view is genuinely public — no account, no login prompt, no signup wall between the visitor and the content.
- Shared view must not leak anything not on that item: no other documents, no company settings, no other meetings, no founder email.
- Shared view is read-only. No editing, no commenting, no way for a visitor to trigger an LLM call.

### RLS
This is the first genuinely public read path in the app. Write the policy narrowly — public access to a single row via valid token only, never a broader company-scoped read.

---

## 4.1 — Free board meeting, no signup wall

### The offer
One real question. One real board meeting. Transcript and decision document to keep. **No account, no card, no email required before the meeting runs.**

This is the equivalent of Titanom's free audit, but at near-zero marginal cost and with no calendar constraint.

### What the visitor does
1. Types one real question they're stuck on
2. Answers the minimum needed to make the board useful — reuse the shortened 4-question onboarding shape, not more
3. Watches the board debate live (the existing live boardroom view)
4. Gets a result they can keep and share (via 4.2)

### Presentation — important
A full multi-round debate transcript is long. Follow the same decision made for the beginner path in 3.4:

- **Synthesis and recommendation prominent** — this is what the visitor came for
- **Full debate expandable underneath** — available, not the default view
- **Disagreement must remain visible**, not smoothed away. The point of the free meeting is demonstrating that advisors genuinely disagree. If the synthesis hides that, the proof asset proves nothing.
- Keep legible uncertainty — confidence levels, minority opinions, unresolved assumptions.

### Cost and abuse controls — decide before shipping, not after

An unauthenticated endpoint that runs a full multi-advisor debate is an open invitation. **All of the following are required, not optional:**

- **Hard daily spend ceiling.** When hit, the free meeting closes gracefully for the rest of the day with honest copy — not an error.
- **Per-IP rate limit.** One free meeting per person is the stated offer; enforce something close to it.
- **Bot protection** on the entry point.
- **Cheap tier where possible.** The debate itself needs quality models, but any summarising, tagging or classification around it runs on the cheap tier.
- **Reuse the existing provider health alerting** so a spike is visible immediately.

Honest scarcity is fine and matches the offer: one free meeting per person, because each one costs real money to run.

### Conversion
No signup wall *before* the meeting. After the result, the invitation to create an account is to **keep the board** — advisors that remember this conversation and carry it forward. That's the actual product and the only thing competitors can't offer.

Do not gate the result behind signup. The visitor keeps what they were promised either way.

---

## 4.3 — Ten testers

Once 4.1 and 4.2 work.

- Roughly ten people, hand-picked.
- In exchange for access, request: name, business, and an answer to **one specific question** —
  *"What did an advisor tell you that you didn't want to hear, and were they right?"*
- That question is deliberate. It produces testimonial evidence for **truth over harmony**, which is the differentiator, and it is available immediately rather than in twelve months.

### Prerequisites before testers arrive
- **Scope the provider-health banner to admin accounts only.** It currently renders on every authenticated page. A provider warning on a tester's dashboard is alarming and actionable by nobody but the owner.
- **Migrate the existing Base44 user** (the colouring studio) onto the Supabase app. This is its own piece of work, not a switch.

---

## Publishable transcripts (ongoing, once 4.2 lands)

Real board sessions where advisors visibly disagreed become the marketing asset. Format: one question, five advisors, real disagreement, chair's synthesis.

This costs nothing beyond running meetings that were going to happen anyway, and it is the single most credible thing Apex can put in front of a stranger.

---

## Out of scope for this phase

- Outcome/results testimonials (the user base is pre-revenue — there are none yet, and manufacturing them would be obvious)
- Public profiles, social features, or a community
- Anything that lets an unauthenticated visitor trigger unbounded LLM spend
