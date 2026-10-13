// What the founder has told us about their company, for every stage of a
// meeting (Round 1, the discussion rounds, follow-ups and the Chair's
// results). Without it, later stages listed as "unknown" things the founder
// had already stated, such as what their product is made of.
// deno-lint-ignore-file no-explicit-any

const STAGES: Record<string, string> = {
  idea_validation: 'validating the idea', pre_launch: 'getting ready to launch', early_revenue: 'early revenue',
  growth: 'growing', fundraising: 'raising money', product_launch: 'launching a product',
  market_expansion: 'expanding into new markets', turnaround: 'turning the business around',
};

// Profile fields the founder writes (onboarding answers, Settings, answers
// to the board), in the order a reader would want them. Not company_type,
// the tagline or the priorities: onboarding's model generates those.
const FIELDS: { key: string; label: string }[] = [
  { key: 'description', label: 'What it is' },
  { key: 'industry', label: 'Industry' },
  { key: 'stage', label: 'Stage' },
  { key: 'business_model', label: 'How it makes money' },
  { key: 'target_customer', label: 'Customers' },
  { key: 'primary_market', label: 'Market' },
  { key: 'country', label: 'Country' },
  { key: 'solo_founder', label: 'Alone or with a team' },
  { key: 'team_size', label: 'Team size' },
  { key: 'available_capital', label: 'Money available' },
  { key: 'available_time', label: 'Time available' },
  { key: 'existing_assets', label: 'What they already have' },
  { key: 'current_challenges', label: 'Current challenges' },
  { key: 'immediate_goal', label: 'Immediate goal' },
  { key: 'confidence_gaps', label: 'Where they lack confidence' },
  { key: 'deadlines', label: 'Deadlines' },
];

const text = (v: unknown, max = 600) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

export function profileFacts(company: any): string[] {
  const c = company || {};
  return FIELDS.flatMap(({ key, label }) => {
    const raw = key === 'stage' ? STAGES[c.stage] || text(c.stage) : text(c[key]);
    return raw ? [`${label}: ${raw}`] : [];
  });
}

// The block every meeting call gets. Empty when nothing has been filled in.
export function companyProfile(company: any): string {
  const facts = profileFacts(company);
  const name = text(company?.name, 200);
  if (!facts.length) return name ? `Company: ${name}\n` : '';
  return `WHAT THE FOUNDER HAS TOLD US about ${name || 'their company'} (facts they stated: use them, and don't list them as missing or ask for them again. If one is too vague to act on, or the founder now says otherwise, ask about that specifically):\n${facts.map((f) => `- ${f}`).join('\n')}\n`;
}
