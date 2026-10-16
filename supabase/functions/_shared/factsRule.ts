// Facts about the business, in every meeting (owner, 16 October 2026):
// they come only from the record or the founder's own words; anything else
// becomes a question, never a premise. One wording, given to every call in a
// meeting that sees the company record (the Chair's opening, Round 1, each
// discussion round, the founder's follow-ups, the Chair's resolution and its
// repair), right after the record it refers to.

const ASK = `- Anything else about the business is a question for the founder, never a premise. Don't assume it and don't build advice on it. If knowing it would change your advice, ask it (in missing_information where your answer has that field, otherwise in plain words) and say what you'd advise either way; if it wouldn't, leave it out.`;
// The Chair's opening asks nothing; she leaves out what isn't known.
const LEAVE_OUT = `- Anything else about the business you don't mention: never state it, assume it or guess at it.`;

const rule = (unknowns: string) => `=== FACTS ABOUT THIS BUSINESS ===
- Facts about this business (its customers, numbers, prices, money, people, suppliers, products, plans, history, what it has or hasn't done) come ONLY from the company record above or from the founder's own words: their question, their notes and replies in this meeting, and what they told the board before. Where it matters, say which ("you told us...", "your profile says...").
${unknowns}
- Another advisor's claim about the business counts only if the record or the founder says so; otherwise it's their guess, and you treat it as one.
- The board's earlier advice is not something the founder did, and the onboarding plan's suggestions are not the founder's words.
- General knowledge (how a market, a law or a channel usually works) is fine, said as general knowledge, never as a fact about this business.`;
export const FACTS_RULE = rule(ASK);

// The record, with the rule straight after it. Nothing to add it to, nothing
// added. `asks: false` for a call that doesn't put questions to the founder.
export function withFactsRule(record: string | null | undefined, { asks = true }: { asks?: boolean } = {}) {
  const r = String(record ?? '').trim();
  return r ? `${r}\n\n${asks ? FACTS_RULE : rule(LEAVE_OUT)}` : null;
}
