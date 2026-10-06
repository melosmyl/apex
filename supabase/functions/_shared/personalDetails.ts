// Workstream K3: an advisor's book, hobby and favourite place, offered in a
// meeting so they can say "when I ran the Lisbon shop" once and feel real.
// At most once per meeting, and only when it serves the argument: the rule is
// in the prompt, and the "once" is enforced here. Once an advisor's earlier
// turns in the meeting contain one of their personal_detail_terms, callers
// stop offering the details for the rest of it. The mug is never offered.

// deno-lint-ignore no-explicit-any
type Advisor = any;

export function hasPersonalDetails(advisor: Advisor): boolean {
  return !!(advisor?.book || advisor?.hobby || advisor?.favourite_place);
}

// Founders can edit their advisor rows, so each detail is bounded on its own
// and the rule after them is never cut off.
const capDetail = (v: unknown) => String(v ?? '').slice(0, 300);

// The note added to the advisor's prompt when details are on offer.
export function personalDetailsNote(advisor: Advisor): string {
  const lines = [
    advisor.book && `Book: ${capDetail(advisor.book)}`,
    advisor.hobby && `Hobby: ${capDetail(advisor.hobby)}`,
    advisor.favourite_place && `Favourite place: ${capDetail(advisor.favourite_place)}`,
  ].filter(Boolean);
  return `Off the clock, from your own profile:\n${lines.join('\n')}\n` +
    `You may mention one of these at most once in this meeting, and only when it genuinely helps your argument, ` +
    `for example as a brief example from your own experience. Never as small talk, an aside or a greeting.`;
}

// Curly apostrophes count as straight ones, and case doesn't matter.
const normalise = (v: unknown) => String(v ?? '').replace(/[\u2018\u2019]/g, "'").toLowerCase();
const escape = (v: string) => v.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// Whether any of these texts (the advisor's own earlier turns in this
// meeting) already used one of their personal details. Terms match as whole
// words, so "rowing" doesn't fire on "growing".
export function usedPersonalDetail(advisor: Advisor, texts: (string | null | undefined)[]): boolean {
  const terms: string[] = Array.isArray(advisor?.personal_detail_terms) ? advisor.personal_detail_terms : [];
  if (!terms.length) return false;
  const haystack = normalise(texts.filter(Boolean).join('\n'));
  return terms.some((t) => t && new RegExp(`(?<![\\p{L}\\p{N}])${escape(normalise(t))}(?![\\p{L}\\p{N}])`, 'u').test(haystack));
}

// Everything an advisor said in a meeting so far: their Round 1 answer and
// their turns in the transcript.
export function ownWords(advisor: Advisor, independentResponses: Advisor[] = [], transcript: Advisor[] = []): string[] {
  const out: string[] = [];
  for (const r of independentResponses) {
    if (r?.advisor_id !== advisor.id) continue;
    out.push(r.position, r.recommendation, ...(r.key_arguments || []), ...(r.risks || []), ...(r.assumptions || []), ...(r.suggested_actions || []),
      ...(r.missing_information || []).map((m: Advisor) => (typeof m === 'string' ? m : m?.detail)));
  }
  for (const m of transcript) if (m?.advisor_id === advisor.id) out.push(m.message, m.new_position, ...(m.new_risks || []));
  return out;
}
