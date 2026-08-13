# Nobody Told Sandra — The Progression Tree

**Status:** queued. Build after the Assistant, alongside or after the debate-mechanic upgrades.
**Purpose:** solve the delayed-reward problem by making the next real capability visible.

---

## The problem this solves

Starting a business has no reward system. The payoff is years away and there is no signal in between. For anyone this is demotivating; for an ADHD founder, delayed reward is functionally no reward at all.

Conventional gamification (points, XP, levels, streaks, leaderboards) is the wrong answer here. It is extrinsic, it wears off in weeks, and it trivialises something the person is taking seriously — someone spending their savings on a first business does not want to feel like they are playing a language app.

**The insight this feature is built on:** the reward is not a badge. The reward is a *real capability that appears*.

> Register the company → you get a VAT number → you can open trade accounts with suppliers → you can order samples at trade prices → you can price properly.

That is motivating because it is true. The founder wants the next node because they can see what it gives them.

## The second thing it solves

The target user does not know what she does not know. She has no idea that registering unlocks supplier accounts, or that a business bank account is what lets her take card payments.

**Showing the unlock teaches the map at the same time as it motivates.** The beginner path and the reward system turn out to be the same feature. This is the strongest argument for building it.

---

## Core design principles

### 1. Label the unlock, not the task

Every node is named for what it *gives you*, not what it *is*.

- Not: "Register your company"
- But: "Register your company → VAT number, trade accounts, proper invoicing"

The unlock is the label. This is the entire motivational mechanism — do not bury it in a description.

### 2. Nothing is actually gated

Visible, not enforced. Showing what is ahead is the motivation; blocking someone from acting out of order would be patronising and frequently wrong — real businesses do these things in whatever order circumstances demand.

The tree shows the path. It never prevents anything.

### 3. Map, not manual

**This is the accuracy boundary and it matters.**

The value is: *"you didn't know a VAT number gets you trade accounts."* That is genuinely useful and hard to get wrong.

The risk is: *"here's how to file your F-skatt application."* That is where confident wrongness has real consequences — a missed tax registration deadline because the tree was subtly wrong about the procedure.

So:
- Nodes describe **what a step unlocks**, not **how to complete it**
- Each node links to the **official source** (Bolagsverket, Skatteverket, Companies House, HMRC) rather than explaining the procedure
- Never state deadlines, thresholds, or filing requirements as fact without pointing to the authority

### 4. Country-aware from the start

Almost every practical step depends on jurisdiction: registration, VAT thresholds, what a business bank account requires, tax registration, employment rules. Without country, the tree is either generic and useless or actively wrong.

**Add country to the shortened onboarding form.** It is now a fifth question, and it earns its place — unlike the twelve questions removed in Phase 3.1, this one changes what the product can do.

Do **not** ask "do you have a VAT number?" at signup. That is jargon aimed at someone who may not know what VAT is, and it is exactly the moment the target user decides this product is not for her. Country is enough; the board asks the rest in context via the existing 3.2 missing-information mechanism.

**Scope honestly.** If only one or two jurisdictions are well-supported at first, say so plainly in the UI rather than generating a plausible-looking tree for a country the model knows less well.

---

## Structure

### Universal spine

A small set of nodes nearly every business shares. Examples (exact set to be worked out during build):

- Decide what you're selling
- First customer conversation
- Register the business
- Business bank account
- First sale
- First repeat customer

### Generated branches

Beyond the spine, the tree is **generated per founder** from what the board already knows — business type, country, stage, and accumulated decisions.

A colouring studio, a product business and a consultancy unlock genuinely different things. This is a real use of the memory system, not a static checklist, and it is the part competitors cannot copy.

### Completion is derived, never self-reported

Same rule as the Phase 2.4 build state: nodes complete from **real facts in the database** (a decision recorded, a task closed, a document generated, a milestone the board confirmed), never from a checkbox the founder ticks.

Where completion genuinely cannot be derived — "registered the company" happens outside the product — the **assistant asks** rather than the UI presenting a checklist. That keeps capture conversational and fits her existing role.

---

## Interaction with existing systems

- **Build state (2.4):** the tree likely supersedes or absorbs the milestone build-state work. Do not run two overlapping progress systems — reconcile them during build.
- **The assistant:** owns asking about steps that happen outside the product, and can surface "you're one step from X" as an interjection — subject to the existing one-per-day budget.
- **The board:** advisors should be able to reference tree position in their reasoning ("you haven't registered yet, so this pricing question is premature").
- **MilestoneTracker:** the existing journey-stage tracker overlaps conceptually. Decide during build whether the tree replaces it or sits alongside it.

---

## Constraints

- **Flat schemas.** Tree generation is exactly the kind of large nested-object output that has failed twice in this codebase (document specs, onboarding plans). Generate the tree in **several small calls** — spine first, then branches, then per-node unlock text — never one large nested structure.
- **Cheap tier** for node text generation and classification.
- **Never punish.** No node ever expires, greys out, or expresses disappointment. Absence is never penalised. Progress never resets. Same accessibility rule as everywhere else.
- **Beginner language.** No unexplained jargon anywhere in the tree. If a node mentions VAT, it explains what VAT is in one plain sentence.

---

## Explicitly not this

- Points, XP, levels, badges, leaderboards
- Streaks that break
- Anything rewarding *opening the app* rather than *making progress*
- Step-by-step procedural instructions for legal or tax filings
- Any hard gate preventing the founder from doing something out of order

---

## Verification

- Generate trees for three genuinely different businesses in two different countries; check the branches actually differ and are not generic.
- Confirm every node names a capability, not a task.
- Confirm official-source links are present on every regulatory node.
- Check with someone who has no startup vocabulary: does each node make sense without further explanation?
- Confirm no node can be marked complete by self-report where a real database fact exists to derive it.
