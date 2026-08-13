# Landing page — revision

The structure and copy are right. The problem is **rhythm**: the page runs on one background from top to bottom, so it reads flat and thin despite good typography. Everything below is about contrast and scale, not adding content.

Do not add sections. Do not add copy. This is a treatment pass.

---

## 1. Alternate the section backgrounds — the single biggest fix

Currently every section sits on the same cream. The interior photograph is the only dark moment on the page, and after it there are four consecutive cream sections.

Give the page a rhythm:

| Section | Background |
|---|---|
| 1. Hero | Cream (as now) |
| 2. The room | Full-bleed photograph |
| 3. AI that disagrees with you | **Near-black, cream text** |
| 4. Transcript | Cream |
| 5. For you / not for you | **Near-black, cream text** |
| 6. Founder note | Cream |
| 7. Take a seat | **Near-black, cream text** |

Full-bleed on every section — no gaps, no rounded containers, no padding gutters between them. Sections should butt directly against each other so the colour changes read as hard cuts.

The exact alternation can be adjusted, but the principle holds: **no more than two consecutive sections may share a background.**

---

## 2. Scale up the hero

The hero type currently sits politely in a narrow centred column with wide empty margins. It should fill the viewport width — that's where the sense of confidence and width comes from.

- Increase the display size substantially at desktop widths; let it approach the full content width.
- Keep it centred, but the margins should be tight, not generous.
- Mobile stays as it is — this is a desktop-scale problem.

---

## 3. Darken the body copy

Supporting copy is currently light grey against near-black headings. The gap is too wide and makes the body text read as an afterthought.

- Bring body copy much closer to the heading colour — dark warm grey, not mid grey.
- Increase body size slightly at desktop.
- Same on dark sections: cream body text, only marginally lighter than the headings.

---

## 4. Replace the mustard accent with deep indigo

The mustard reads cheap against the interior photography and the warm greys.

- Replace with a deep indigo at the token level so it propagates across the app, not just this page.
- On dark sections, the CTA should be indigo with cream text.
- On cream sections, indigo with cream text.
- Check contrast in both light and dark mode before committing.

---

## 5. Tighten the vertical spacing

Several sections have very large empty runs — particularly around the founder note and below the transcript placeholder. Generous space is right; *empty* space reads as unfinished.

Reduce vertical padding where a section has little content, so each section feels deliberately sized rather than stretched.

---

## What not to change

- The copy. All of it stays as written.
- The structure and section order.
- The serif identity, the mono labels, the sentence-case discipline.
- The rule against fake advisor imagery.
- Mobile-first behaviour — verify nothing regresses at ~380px after these changes.

---

## Verification

- Scroll the whole page at desktop width: does it have rhythm, or does it still read as one continuous field?
- Are there any three consecutive sections sharing a background?
- Does the hero fill the width, or still sit in a narrow column?
- Is body copy legible and confident rather than faint?
- Re-check at 380px: no horizontal scroll, no cramped sections, no oversized display type.
