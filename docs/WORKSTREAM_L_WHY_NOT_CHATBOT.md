# Landing: "Why not just ask a chatbot?" (Workstream L)

Branch `workstream-l/why-not-chatbot` (from main at `98f1add`), built in the worktree
`~/Documents/apex-workspace`. Content and its sources are in `src/lib/whyNotChatbot.js`; the section
is `src/components/landing/WhyNotChatbot.jsx` (styles: `.versus` in `src/styles/landing.css`),
placed after the hero's mug ticker. It merges into main at the same quiet point as Teams S0–S2.

## BLOCKER: don't publish until the meeting is swapped

The Room column comes from petit m's meeting `f150cbfc` (16 October 2026), "Should petit m price the
dinner set at £45 or £65?". That meeting used two facts the owner made up for testing: the £11 Stoke
quote and the £58/£72 shop prices. Before this section is merged and published:

1. The owner re-runs the question with a full board (after the main session's missing-turns fix is
   live) and only real petit m facts.
2. With the owner's yes, read that meeting once, read-only, and swap the Room column to it: four
   Round 1 positions cut to under 20 words with "…" wherever words are left out, the Chair's verdict,
   confidence and reason, and one of its tasks. Drop "4 of 5 spoke" if every advisor spoke.
3. Then set `CLEARED_FOR_PUBLIC = true` in `src/lib/whyNotChatbot.js`.

Until then the section shows on development builds only; a production build renders nothing.

## Owner decisions (16 October 2026)

- The chatbot reply is ChatGPT's, verbatim, as the owner pasted it. Its comparison table (other
  brands' prices) is skipped with a "…"; when the columns stack it stops at the first "…".
- Sub-line: "Ask a chatbot and you get one long answer." Chatbot foot: "About 600 words · Asks what's in
  the set and what it costs" (ChatGPT did recommend £65, so the mock's "No decision" would be false).
- The three lines: "They disagree with each other. They remember your business. They write down what
  you decided, and hold you to it."
- The Room header says "disagreements", the Chair's own word (resolution field `disagreements`,
  results page "Where the room disagreed").
- The page shows petit m's pricing plan; the owner's call to make before publishing.
