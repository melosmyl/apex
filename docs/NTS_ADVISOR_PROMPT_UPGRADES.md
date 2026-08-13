# Advisor prompt upgrades — specificity, question-rejection, honest uncertainty

**Three additions to existing prompts. No new architecture, no schema changes beyond one optional field.**

These close gaps found by reviewing the current prompts. The debate principles and memory principle are already strong — these fill what's missing rather than replacing anything.

---

## 1. Specificity enforcement (highest value, lowest cost)

**Problem:** nothing currently forces a concrete recommendation. "Be direct, specific, and substantive" is an adjective a model can satisfy with "you should validate demand before scaling." Generic advice — not poor reasoning — is the real failure mode.

**Where:** add to `DISCUSSION_PRINCIPLES` in `runBoardDiscussion/index.ts`, and to `CHAIR_INSTRUCTIONS` in `runChairSynthesis/index.ts`.

**Text to add:**

```
SPECIFICITY — this is a hard requirement:
- Every recommendation must name something the founder could actually do
  this week. Who to call. What to write. Which number to look up. Which
  customer to ask.
- "Validate demand", "consider your positioning", "think about pricing"
  are not recommendations. They are categories of recommendation. Name the
  specific action inside the category.
- If you genuinely cannot name a concrete next action, say so and explain
  what information would make one possible. That is a useful contribution.
  A vague recommendation is not.
- Prefer the smallest real action over the most impressive-sounding one.
  "Call the six people who enquired last month and ask what stopped them"
  beats "conduct customer discovery research."
```

---

## 2. Permission to reject the question

**Problem:** the debate block offers seven things an advisor may do, and all seven presume the question is the right one. "Challenge the founder's premise" is close but a premise is not a question. The most valuable thing a real board does is say *you're asking the wrong thing* — advisors structurally cannot do this today.

**Where:** add to the mid-round `YOUR TASK` list in `buildDiscussionContext`, and mirror in `DISCUSSION_PRINCIPLES`.

**Text to add to the YOUR TASK list:**

```
- Say the question itself is wrong, and name the question that should be
  asked instead
```

**Text to add to `DISCUSSION_PRINCIPLES`:**

```
QUESTION QUALITY:
- Sometimes the most useful thing a board can do is tell the founder they
  are asking the wrong question. If the question hides a more important
  unresolved decision, say so directly and name the better question.
- Do not do this to avoid answering. Only when the original question
  genuinely cannot be answered well until something upstream is resolved.
- If you reframe the question, still address the original as best you can
  — the founder asked it for a reason.
```

---

## 3. Honest uncertainty — "I don't know" as a valid position

**Problem:** uncertainty is expressible only as `confidence_score` 0–100. There is no path for "this cannot be answered without X." A confidence score of 30 still ships a recommendation, and a low-confidence recommendation is more dangerous than an honest gap because it still looks like an answer.

**Where:** add to `DISCUSSION_PRINCIPLES`.

**Text to add:**

```
HONEST UNCERTAINTY:
- "I don't know, and here is what would tell us" is a legitimate and
  valuable position. Take it when it is true.
- Do not manufacture a recommendation to appear useful. If the honest
  answer is that there is not enough information, say that, name the
  specific missing information, and say how the founder could get it.
- A low confidence score is not a substitute for saying this plainly. If
  you would not act on your own recommendation, say so.
```

**Optional schema addition (only if it can stay flat):** an `answerable` boolean on the advisor response, so "not answerable yet" can be surfaced in the UI rather than buried in prose. Do not add this if it requires nesting — the codebase has two confirmed failures from nested schemas.

---

## 4. Fix Amara Vance's register (separate, smaller)

**Problem:** her prompt says "think in decades, not quarters", "category-defining companies", "three exits". That is venture-startup vocabulary aimed at a buyer this product deliberately does not target. For a career-changer opening a studio or a consultancy, this register produces advice that is unusable and slightly alienating.

**Change:** keep the expansive thinking, drop the unicorn framing. She should ask "what could this become if it worked?" in terms a first-time founder recognises — a bigger version of *their* business, not a category-defining company. Rewrite her prompt in plain language with no reference to exits, decades, or category creation.

**Check the rest of `advisorLibrary.js` for the same problem.** Any advisor whose persona assumes venture scale, funding rounds, or an existing team is mis-targeted for this product's actual buyer.

---

## Verification

Run the same real question through a board before and after, with a deliberately vague business:

1. Do recommendations now name specific actions rather than categories?
2. Does at least one advisor reject or reframe the question when the question is genuinely bad? (Test with something like "should I do Instagram or TikTok?" when the business has no customers yet — the right answer is that neither matters yet.)
3. Does an advisor say "not enough information" when asked something genuinely unanswerable — e.g. "should I hire someone?" with no revenue data on file?
4. Does Amara's advice now make sense for a one-person business with no funding?

Watch for over-correction: if advisors start rejecting reasonable questions or claiming uncertainty on answerable ones, the instructions are too strong. The bar for both is "genuinely true", not "available as an option."
