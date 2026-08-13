# Nobody Told Sandra — Landing page rebuild

**Scope:** full visual redesign of the public landing page. New identity, new structure.

**Read `/mnt/skills/public/frontend-design/SKILL.md` before starting. Investigate what the landing page currently is before rebuilding it.**

---

## Who this page is for

A career-changer with some savings and no startup vocabulary. Someone leaving a long career to start something of their own, or working part-time while working out what's next. They do not know what a cap table is. They are not impressed by startup language — it makes them feel excluded.

Every line on this page must make sense to that person. If a sentence would make them feel stupid, it's the wrong sentence.

---

## Visual direction

- **A high-contrast serif carries the identity** — editorial, Didone-adjacent. Thin hairlines, dramatic thick-thin. This is the single biggest brand decision on the page: one typeface doing the work, not a logo.
- **Body copy** in the existing sans. **Monospace, letter-spaced** for small labels and CTAs.
- **Generous white space.** One idea per screen. Nothing competing. If a section has two messages, it's two sections.
- **Warm, not cold.** The register is a well-lit room with books and chairs — somewhere you'd want to sit and think. Not an empty office, not a dark dashboard, not chrome.
- **Near-greyscale imagery with one accent colour**, used sparingly.
- **Short lines.** Almost nothing on this page should be a paragraph.

---

## Structure, top to bottom

### 1. Hero
> **Nobody told you either.**
>
> A board of advisors who argue about your business.
> Not one confident answer. Five people who disagree.

CTA: *Sit in on one*

### 2. The room
Full-width image (supplied). Minimal or no copy over it. Let it breathe — this section's job is atmosphere, not argument.

### 3. The differentiator
> **AI that disagrees with you.**
>
> Everything else tells you your idea is great.
> Your board tells you when it isn't.

### 4. A real transcript — the most important section on the page

Embed a **genuine board meeting** where advisors visibly disagree, ending with the chair's synthesis.

Not a screenshot. Not a mockup. Not illustrative copy. Use the existing public-share mechanism from Phase 4.2 rather than building anything new.

This is the only evidence on the page. Everything else is a claim. Give it room.

### 5. Who this is for / not for

Two short panels side by side.

The **"not for you if"** panel matters as much as the positive one — it filters, it signals confidence, and it pre-empts the wrong expectations. Write it honestly.

### 6. Founder note
Short, first person, with a photo (supplied). The story is: I couldn't find advisors, so I built my own. Keep it to a few lines.

### 7. Close
> **Take a seat.**
>
> Real boards cost £50,000 a year.
> Yours starts free, tonight.

Straight into the free board meeting — no signup wall, no card.

---

## Hard rules

- **No AI-generated or stock portraits of fake advisors.** Anywhere, including loading and placeholder states. If the board needs representing visually, use objects — name cards, chairs, a seating plan.
- **No unexplained startup jargon.** Test every line against someone who has never read a startup blog.
- **Mobile first.** Most visitors will be on a phone. Design for ~380px and let desktop expand, not the reverse.
- **Fast.** No heavy image payloads, no animation delaying first paint.
- **Link privacy and terms** in the footer, as now.

---

## Verification

- Read the whole page on a phone. Is any section cramped or requiring horizontal scroll?
- Could someone with no business vocabulary explain what this product does after one scroll?
- Is the transcript genuinely from a real meeting, with real disagreement visible?
- Does anything on the page imply the advisors are real people?
