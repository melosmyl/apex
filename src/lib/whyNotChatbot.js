// The landing page's "Why not just ask a chatbot?" side-by-side (Workstream L).
// One real question from petit m (the owner's own company), asked of the full
// board on 22 October 2026 (meeting 2c796462), and the same question put to
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
  who: "petit m · children’s dinner sets · 22 October 2026",
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

// The Room, from meeting 2c796462 (22 October 2026): the owner asked the
// question again with the full board, after withdrawing two facts made up
// for testing (the £11 Stoke quote and the £58/£72 shop prices). All five
// advisors spoke in Round 1; these are the four most different positions,
// none resting on the withdrawn facts. The Chair recorded three
// disagreements (its own word) and created three tasks.
export const ROOM = {
  spoke: 5,
  seated: 5,
  disagreements: 3,
  tasks: 3,
  positions: [
    { key: "supply_chain", text: "Don’t lock in either price today, because the cost of the set is unknown.", source: "2c796462 Round 1, Rafael Duarte" },
    { key: "creative_director", text: "Lean £65, but as a hypothesis to test, not a decision.", source: "2c796462 Round 1, Sofia Marchetti" },
    { key: "legal_advisor", text: "Legally, neither £45 nor £65 is safe to publish yet…", source: "2c796462 Round 1, Julian Rhodes" },
    { key: "contrarian", text: "…My case against the room is that ruling £45 out in advance is as unsupported as choosing it.", source: "2c796462 Round 1, Victor Hale" },
  ],
  chair: {
    key: "chair",
    verdict:
      "Neither £45 nor £65 can be chosen yet because the set’s real cost is unknown; get a written landed cost first, and until then treat £65 delivered as the only price worth showing strangers, with no deposits taken.",
    confidence: 52,
    reason: "The board broadly converged on ‘get the cost first, £65 if you must test’, which may share a blind spot, and nobody has any cost, sample or buyer evidence to test it against.",
    source: "meeting 2c796462, board_resolution",
  },
  task: {
    key: "supply_chain",
    title: "Write down your maximum landed cost per set at £45 and at £65, before asking anyone for a quote",
    type: "Calculate",
    source: "meeting 2c796462, task assigned to Rafael Duarte",
  },
};

export const CLOSING_LINES = [
  "They disagree with each other.",
  "They remember your business.",
  "They write down what you decided, and hold you to it.",
];

// The blocker of 16 October (meeting f150cbfc used two made-up test facts)
// is lifted: the Room column is now the owner's full-board re-run of
// 22 October (2c796462), which uses none of them.
const CLEARED_FOR_PUBLIC = true;

const sourced = (x) => Boolean(x && x.source);
const known = (key) => Boolean(key && getAdvisorByKey(key));
export const READY =
  CLEARED_FOR_PUBLIC &&
  sourced(CHATBOT) &&
  sourced(ROOM.chair) && known(ROOM.chair.key) &&
  sourced(ROOM.task) && known(ROOM.task.key) &&
  ROOM.positions.every((p) => sourced(p) && known(p.key) && p.text);
