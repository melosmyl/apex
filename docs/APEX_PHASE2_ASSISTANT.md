# Apex — Phase 2 addition: The Assistant

**Status:** to be built after Phase 3.2. Belongs to Phase 2 (the retention loop) because it does the same job — closing the gap between board meetings.

---

## Why this exists

Apex currently has a hole. The board meets, decisions get made, tasks get assigned — then nothing until the next meeting. That gap is where momentum dies, and it is the specific place an ADHD founder loses the thread.

Every competitor (SynthBoard, Pancake, AI Cofounders) is session-based and has nothing in this gap. An assistant living there is what turns discrete meetings into a continuous relationship — the continuity moat made tangible.

**She is not a notes app with a chat interface.** If she only stores and reminds, she is a commodity and not worth building. Her value is that she is the only assistant who knows what the board said.

---

## Her three jobs, in order of difficulty

### 1. Capture — must be frictionless

- One input, always reachable, no categorising, no choosing a destination, no required fields.
- Target: thought to captured in under three seconds.
- If capture takes longer than that, the thought is gone. This is the strict ADHD requirement and it governs the whole design.

### 2. Resurfacing — this is the actual product

A note the founder has to remember to go and read is worthless; it just moves the forgetting one step back.

- Notes must surface **when they become relevant**, not in a list the founder has to open.
- Example: founder captures "look into whether I need insurance." She raises it when the board next discusses hiring — not on a timer, not in a digest.
- **Mechanism: reuse the existing pgvector retrieval.** Same semantic-relevance approach already built for board memory, pointed at notes instead of decisions. Do not build a second retrieval system.

### 3. Routing — what stops her becoming a separate tool

- She recognises when something is bigger than a note: "That's not a to-do, that's a pricing question — want to put it to the board?"
- She then **opens a board meeting**. She is the interface *to* the board, not an alternative to it.

---

## Hard boundary — write this into her system prompt

**She does not answer strategic questions.**

The failure mode is specific and likely: one warm agreeable assistant is easier to talk to than five advisors who argue with you. If she gives good strategic advice, founders will drift to her and stop convening the board — at which point Apex has quietly become a general-purpose chat assistant with a name, and every differentiator is gone.

- Her competence is **organisational**, not advisory.
- When something strategic comes up, her response is to route it to the board.
- This must be an explicit constraint in the prompt, not an emergent hope.

---

## UI behaviour — persistent presence

She is persistent (visible on every screen), not a destination. Capture speed requires it. But persistence has to be earned:

- **Default state is collapsed and silent.** A small affordance in a corner. Tap to capture. No open panel, no greeting on page load, no unprompted suggestion when the founder arrives.
- **Fully suppressed during board meetings.** The boardroom is the product's centre of gravity. Nothing may split attention while a meeting is running.
- **Interjections are rare and earned.** She may surface a relevant note when context genuinely matches — that is the good version of persistence. Bar: **at most one interjection per session**, triggered only by real semantic relevance from pgvector retrieval. Never on a timer, never on a "haven't seen you in a while" trigger.
- Two mediocre interruptions and the founder stops reading her permanently. Under-trigger rather than over-trigger.

---

## What she also owns

Two items already in the plan move to her, because she is the right voice for both:

**Accountability follow-up (2.3).** "You committed to the pricing page — where did that land?" Curious, never accusatory.

**Gap recovery (2.4).** Returning after an absence produces "welcome back, here's where things were," from her. Never a dashboard showing a broken streak. Reward re-engagement; never penalise the gap.

---

## Instrumentation — build this from day one

The failure mode above is measurable. Track from launch:

- Board meetings per user per week
- Assistant messages per user per week

**If assistant usage rises while board meetings fall, she is cannibalising the product.** That signal is worthless if it isn't being recorded from the start, so add it with the feature, not after.

---

## Open decision (product owner)

Persona and gender have been unexamined so far — "her" was inherited by default. A female assistant supporting a board of advisors is a well-worn pattern. Worth a deliberate decision rather than a default, particularly given the target audience includes career-changing women.

---

## Design cautions

- **She should feel like a capable colleague, not a companion.** Users will include people working alone, some of them isolated. An assistant who knows you, remembers everything and is always present is a strong pull. She should push the founder toward the board and toward real people — never become the relationship.
- Cheap tier applies. Capture, tagging, and routing are Haiku-class work. Do not run them on a flagship model.
