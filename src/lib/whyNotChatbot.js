// The landing page's "Why not just ask a chatbot?" side-by-side (Workstream L).
// One real question from petit m (the owner's own company), asked in a Sit in
// meeting on 16 October 2026 (meeting f150cbfc), and the same question put to
// ChatGPT by the owner. Nothing here is written for the page:
//   - the chatbot's reply is verbatim, cut only where the column runs out,
//     with "…" at each cut;
//   - each advisor line is that advisor's own Round 1 position, cut to under
//     20 words, with "…" wherever words are left out;
//   - the Chair's recommendation, confidence and the task are the meeting's own.
//
// While anything here is waiting for its source (`source: null`), the section
// shows in development only, never in a production build.

import { getAdvisorByKey } from "@/lib/advisorLibrary";

export const QUESTION = {
  text: "Should petit m price the dinner set at £45 or £65?",
  who: "petit m · children’s dinner sets · 16 October 2026",
};

// ChatGPT's reply, as the owner pasted it on 16 October 2026 (613 words as
// pasted, table cells included). The comparison table that follows the first
// part names other brands' prices, so the cut skips it; `wide` parts are left
// out when the columns stack, where the reply stops at the first cut.
export const CHATBOT = {
  source: "ChatGPT, asked by the owner, 16 October 2026",
  length: "About 600 words",
  recommendation: { label: "My recommendation", value: "£65", caption: "Preferred launch price" },
  parts: [
    { text: "I would position petit m as a premium children’s tableware brand, rather than an expensive alternative to conventional children’s dinner sets." },
    { text: "The combination of blue-and-white botanical design, real ceramics and British manufacturing gives you a credible premium proposition. At £45, I worry you would be underselling that positioning." },
    { text: "There is one important qualification: I’m assuming your set includes three pieces (plate, bowl and cup), is beautifully finished and comes in attractive gift-ready packaging." },
    { heading: "What the market tells us" },
    { text: "There are two quite different markets here: functional children’s tableware and premium, design-led gifts." },
    { cut: true },
    { wide: true, text: "But I don’t think your core competition is necessarily other children’s plates. It’s the £50–£80 gifts that parents, grandparents and godparents buy for birthdays, christenings and special occasions." },
    { wide: true, heading: "Why I favour £65" },
    { wide: true, text: "Brand perception: £65 signals something distinctive, made to be kept rather than replaced. £45 risks making the product feel more ordinary." },
    { wide: true, text: "Gift purchasing: A beautiful £65 set can be a convincing special-occasion gift. The purchaser may care more about aesthetics, provenance and presentation than a £20 difference." },
    { wide: true, text: "Economics: UK-made ceramics, breakage, packaging, shipping and customer acquisition could make a £45 price difficult to sustain." },
    { wide: true, cut: true },
  ],
  // The reply's last question, which the foot sums up.
  endsBy: "Asks what’s in the set and what it costs",
};

// The Room, from meeting f150cbfc. Julian Rhodes was unavailable in Round 1,
// so four of the five spoke (owner, 16 October: show it as "4 of 5 spoke",
// and swap in a full board once the main session's missing-turns fix is live
// and the owner has asked the question again). The Chair recorded three
// disagreements (its own word) and created three tasks.
export const ROOM = {
  spoke: 4,
  seated: 5,
  disagreements: 3,
  tasks: 3,
  positions: [
    { key: "supply_chain", text: "Price at £65 for the test, with £55 as your floor. £45 is too thin…", source: "f150cbfc Round 1, Rafael Duarte" },
    { key: "creative_director", text: "Lead with £65, not £45. Test £45 only as a fallback if strangers refuse £65 with a real deposit.", source: "f150cbfc Round 1, Sofia Marchetti" },
    { key: "contrarian", text: "Open at £65, not £45. …parents said ‘price’, but that comment came before they had seen the object…", source: "f150cbfc Round 1, Victor Hale" },
    { key: "marketing_director", text: "…Put both on price cards this week, start from £65 as your working hypothesis, and let stranger deposits decide…", source: "f150cbfc Round 1, Priya Nair" },
  ],
  chair: {
    key: "chair",
    verdict:
      "Go with £65, shown as one delivered price, and test it with real £10 refundable deposits from grandparent gift buyers; £45 is out, and £58 is the fallback if strangers refuse.",
    confidence: 57,
    // The reason opens "All five advisors converged on £65, so…", but Julian
    // didn't speak in Round 1, so it starts after that clause.
    reason: "…the agreement has not been stress-tested. It rests on two shops’ asking prices, an uncosted cradle and no stranger deposits yet.",
    source: "meeting f150cbfc, board_resolution",
  },
  task: {
    key: "supply_chain",
    title: "Work out the margin per set at £65 delivered, with the gift box and Etsy fees on postage included",
    type: "Calculate",
    source: "meeting f150cbfc, task assigned to Rafael Duarte",
  },
};

export const CLOSING_LINES = [
  "They disagree with each other.",
  "They remember your business.",
  "They write down what you decided, and hold you to it.",
];

// BLOCKER (owner, 16 October 2026): meeting f150cbfc used two facts the owner
// made up for testing (the £11 Stoke quote and the £58/£72 shop prices).
// Before this section is merged and published, the owner re-runs the question
// with a full board and only real petit m facts, and the Room column is
// swapped to that meeting. Only then set this to true.
const CLEARED_FOR_PUBLIC = false;

const sourced = (x) => Boolean(x && x.source);
const known = (key) => Boolean(key && getAdvisorByKey(key));
export const READY =
  CLEARED_FOR_PUBLIC &&
  sourced(CHATBOT) &&
  sourced(ROOM.chair) && known(ROOM.chair.key) &&
  sourced(ROOM.task) && known(ROOM.task.key) &&
  ROOM.positions.every((p) => sourced(p) && known(p.key) && p.text);
