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

// The note added to the advisor's prompt when details are on offer.
export function personalDetailsNote(advisor: Advisor): string {
  const lines = [
    advisor.book && `Book: ${advisor.book}`,
    advisor.hobby && `Hobby: ${advisor.hobby}`,
    advisor.favourite_place && `Favourite place: ${advisor.favourite_place}`,
  ].filter(Boolean);
  return `Off the clock, from your own profile:\n${lines.join('\n')}\n` +
    `You may mention one of these at most once in this meeting, and only when it genuinely helps your argument, ` +
    `for example as a brief example from your own experience. Never as small talk, an aside or a greeting.`;
}

// Whether any of these texts (the advisor's own earlier turns in this
// meeting) already used one of their personal details.
export function usedPersonalDetail(advisor: Advisor, texts: (string | null | undefined)[]): boolean {
  const terms: string[] = Array.isArray(advisor?.personal_detail_terms) ? advisor.personal_detail_terms : [];
  if (!terms.length) return false;
  const haystack = texts.filter(Boolean).join('\n').toLowerCase();
  return terms.some((t) => t && haystack.includes(String(t).toLowerCase()));
}

// Everything an advisor said in a meeting so far: their Round 1 answer and
// their turns in the transcript.
export function ownWords(advisor: Advisor, independentResponses: Advisor[] = [], transcript: Advisor[] = []): string[] {
  const out: string[] = [];
  for (const r of independentResponses) {
    if (r?.advisor_id !== advisor.id) continue;
    out.push(r.position, r.recommendation, ...(r.key_arguments || []), ...(r.risks || []), ...(r.assumptions || []), ...(r.suggested_actions || []));
  }
  for (const m of transcript) if (m?.advisor_id === advisor.id) out.push(m.message, m.new_position);
  return out;
}
