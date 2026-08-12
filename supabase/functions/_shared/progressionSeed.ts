// The Progression Tree's spine — the small set of nodes every company gets,
// regardless of country or industry. Hardcoded, not LLM-generated: this is
// the part of the tree that must feel identical across founders anyway, and
// sidesteps the flat-schema failure mode entirely for it (see
// generateOnboardingPlan's dated comment on 100% failure with nested
// schemas — no LLM call here at all).
//
// The first five nodes are BuildStateWidget's five tests, verbatim — the
// Progression Tree replaces that widget, so the facts it showed founders
// don't disappear, they become spine nodes with unlock framing instead of
// a computed-badge framing. The sixth is the one genuinely non-derivable
// spine node ("assistant_asked"), demonstrating the ask-conversationally
// mechanism for the single most universal non-DB fact: is the business
// actually registered.
//
// derivation_rule is never LLM-authored anywhere in this feature — this
// file is the closed vocabulary evaluateNodeCompletion (Phase C) reads
// against.
export const SPINE_VERSION = '1';

// Branch generation (Phase D) seeds from the same per-stage milestone
// content as src/lib/companyJourney.js's COMPANY_JOURNEYS — the owner's
// explicit condition on replacing MilestoneTracker was that its knowledge of
// what a business needs at each stage survives as real input, not thrown
// away. Duplicated here (not imported) because companyJourney.js pulls in
// ADVISOR_LIBRARY via a path alias Deno can't resolve — only the milestone
// strings are needed on this side.
const MILESTONES_BY_STAGE = {
  idea_validation: ["Company foundation completed", "Executive board assembled", "Customer defined", "Core problem validated", "First market research completed", "Business model approved"],
  pre_launch: ["Executive board assembled", "Business model approved", "Minimum viable product scoped", "Pricing decision made", "Launch plan approved", "First board meeting completed"],
  early_revenue: ["First customer acquired", "Pricing validated", "Unit economics confirmed", "First decision outcome reviewed", "Growth channel identified"],
  growth: ["First team member hired", "Growth channel scaled", "Operational systems built", "Second growth channel tested", "First decision outcome reviewed"],
  fundraising: ["Investor narrative approved", "Financial model completed", "Due diligence prepared", "Term sheet reviewed", "First board meeting completed"],
  product_launch: ["Launch plan approved", "Positioning finalised", "Launch metrics defined", "Launch executed", "First customer acquired"],
  market_expansion: ["New market identified", "Market research completed", "Expansion plan approved", "First expansion customer acquired", "First decision outcome reviewed"],
  turnaround: ["Situation assessed", "Critical risks identified", "Stabilisation plan approved", "Cash flow secured", "First decision outcome reviewed"],
};

export function getStageMilestones(stage) {
  return MILESTONES_BY_STAGE[stage] || MILESTONES_BY_STAGE.idea_validation;
}

// UK-only at launch (owner's decision, 2026-08-13) — the only country whose
// branch nodes get real official-source links. official_source_url is never
// LLM-generated (a confidently-wrong link is worse than none): the model
// picks a name from this table's keys, this file resolves the URL. No match
// → the node ships with official_source_url null, a visible gap rather than
// a guess.
export const OFFICIAL_SOURCE_LOOKUP = {
  "United Kingdom": {
    "Companies House": "https://www.gov.uk/government/organisations/companies-house",
    "HMRC": "https://www.gov.uk/government/organisations/hm-revenue-customs",
    "GOV.UK": "https://www.gov.uk/browse/business",
    "ICO": "https://ico.org.uk/",
    "FCA": "https://www.fca.org.uk/",
  },
};

export function resolveOfficialSourceUrl(country, sourceName) {
  return OFFICIAL_SOURCE_LOOKUP[country]?.[sourceName] || null;
}

export const SPINE_NODES = [
  {
    spine_key: 'board_assembled',
    order_index: 0,
    label: 'A board that can actually debate with you',
    unlock_description: 'Three AI advisors, briefed on your business and ready to challenge your thinking — not just agree with it.',
    derivation_type: 'db_fact',
    derivation_rule: { fact: 'board_assembled' },
  },
  {
    spine_key: 'first_debate',
    order_index: 1,
    label: 'Your first real board debate',
    unlock_description: 'Your board debates a question you bring them — arguing, challenging each other, and changing their minds where the evidence says so.',
    derivation_type: 'db_fact',
    derivation_rule: { fact: 'first_debate' },
  },
  {
    spine_key: 'first_decision',
    order_index: 2,
    label: 'A decision you can actually act on',
    unlock_description: 'A board debate turned into a clear recommendation, logged where you can find it again.',
    derivation_type: 'db_fact',
    derivation_rule: { fact: 'first_decision' },
  },
  {
    spine_key: 'first_document',
    order_index: 3,
    label: 'A real deliverable, not just advice',
    unlock_description: 'A one-pager, financial model, or deck generated from a board meeting — something you can actually send to someone.',
    derivation_type: 'db_fact',
    derivation_rule: { fact: 'first_document' },
  },
  {
    spine_key: 'first_commitment_closed',
    order_index: 4,
    label: 'Proof you follow through',
    unlock_description: 'A task that came out of a board meeting, actually finished — the loop between talking and doing, closed once.',
    derivation_type: 'db_fact',
    derivation_rule: { fact: 'first_commitment_closed' },
  },
  {
    spine_key: 'business_registered',
    order_index: 5,
    label: 'A business that legally exists',
    unlock_description: 'Registered with the right authority for your country — the point where this stops being an idea and starts being a company.',
    derivation_type: 'assistant_asked',
    derivation_rule: null,
  },
];
