import { ADVISOR_LIBRARY, ADVISOR_PROVIDER_CONFIG, characterFields } from "@/lib/advisorLibrary";

// Stage-based company journeys — each guides without becoming a rigid checklist.
export const COMPANY_JOURNEYS = [
  {
    key: "idea_validation",
    label: "Idea Validation",
    description: "Test whether the problem is real and the solution is wanted.",
    milestones: [
      "Company foundation completed",
      "Executive board assembled",
      "Customer defined",
      "Core problem validated",
      "First market research completed",
      "Business model approved"
    ],
  },
  {
    key: "pre_launch",
    label: "Pre-Launch Startup",
    description: "Build the foundation before going to market.",
    milestones: [
      "Executive board assembled",
      "Business model approved",
      "Minimum viable product scoped",
      "Pricing decision made",
      "Launch plan approved",
      "First board meeting completed"
    ],
  },
  {
    key: "early_revenue",
    label: "Early Revenue",
    description: "Turn first customers into a repeatable engine.",
    milestones: [
      "First customer acquired",
      "Pricing validated",
      "Unit economics confirmed",
      "First decision outcome reviewed",
      "Growth channel identified"
    ],
  },
  {
    key: "growth",
    label: "Growth Company",
    description: "Scale what works without breaking what got you here.",
    milestones: [
      "First team member hired",
      "Growth channel scaled",
      "Operational systems built",
      "Second growth channel tested",
      "First decision outcome reviewed"
    ],
  },
  {
    key: "fundraising",
    label: "Fundraising",
    description: "Raise the right capital on the right terms.",
    milestones: [
      "Investor narrative approved",
      "Financial model completed",
      "Due diligence prepared",
      "Term sheet reviewed",
      "First board meeting completed"
    ],
  },
  {
    key: "product_launch",
    label: "Product Launch",
    description: "Launch with clarity, momentum and a plan to learn fast.",
    milestones: [
      "Launch plan approved",
      "Positioning finalised",
      "Launch metrics defined",
      "Launch executed",
      "First customer acquired"
    ],
  },
  {
    key: "market_expansion",
    label: "Market Expansion",
    description: "Expand into new markets, segments or geographies.",
    milestones: [
      "New market identified",
      "Market research completed",
      "Expansion plan approved",
      "First expansion customer acquired",
      "First decision outcome reviewed"
    ],
  },
  {
    key: "turnaround",
    label: "Turnaround",
    description: "Stabilise, refocus and rebuild momentum.",
    milestones: [
      "Situation assessed",
      "Critical risks identified",
      "Stabilisation plan approved",
      "Cash flow secured",
      "First decision outcome reviewed"
    ],
  }
];

export const STAGE_LABELS = {
  idea_validation: "Idea Validation",
  pre_launch: "Pre-Launch",
  early_revenue: "Early Revenue",
  growth: "Growth",
  fundraising: "Fundraising",
  product_launch: "Product Launch",
  market_expansion: "Market Expansion",
  turnaround: "Turnaround"
};

export const STAGE_OPTIONS = [
  { value: "idea_validation", label: "Idea stage" },
  { value: "pre_launch", label: "Pre-launch" },
  { value: "early_revenue", label: "Early revenue" },
  { value: "growth", label: "Growth" },
  { value: "fundraising", label: "Fundraising" },
  { value: "product_launch", label: "Product launch" },
  { value: "market_expansion", label: "Market expansion" },
  { value: "turnaround", label: "Turnaround" }
];

export function getJourney(key) {
  return COMPANY_JOURNEYS.find((j) => j.key === key) || COMPANY_JOURNEYS[0];
}

// Every new board starts with the same six (owner's decision, B3): the
// Chair and the five the landing page introduces. The onboarding AI writes
// a personal reason for each; without one, the advisor's own stance is the
// reason. Founders can still change the board in the review step.
export const STARTING_BOARD_KEYS = ["chair", "visionary", "marketing_director", "product_strategist", "ai_expert", "customer_advocate"];

function plainReason(lib) {
  if (lib.key === "chair") return "Runs every meeting and writes up the resolution.";
  const stance = (lib.argues_for || "").trim();
  return stance ? `Argues for ${stance.charAt(0).toLowerCase()}${stance.slice(1)}` : `${lib.role}.`;
}

export function startingBoard(reasons = {}) {
  return STARTING_BOARD_KEYS.map((key) => {
    const lib = ADVISOR_LIBRARY.find((a) => a.key === key);
    const reason = typeof reasons[key] === "string" && reasons[key].trim() ? reasons[key].trim() : plainReason(lib);
    return { key: lib.key, name: lib.name, role: lib.role, reason };
  });
}

// Build the full advisor record from a library key for entity creation.
export function buildAdvisorRecord(key, companyId) {
  const lib = ADVISOR_LIBRARY.find((a) => a.key === key);
  if (!lib) return null;
  const config = ADVISOR_PROVIDER_CONFIG[key] || {};
  return {
    company_id: companyId,
    library_key: key,
    name: lib.name,
    role: lib.role,
    short_bio: lib.biography,
    biography: lib.biography,
    expertise: lib.expertise,
    communication_style: lib.communication_style,
    decision_style: lib.decision_style,
    strengths: lib.strengths,
    weaknesses: lib.weaknesses || [],
    blind_spots: lib.weaknesses || [],
    personality_traits: lib.personality_traits,
    ...characterFields(lib),
    system_instructions: config.system_instructions || "",
    // Portraits are found by library key (src/lib/portraits.js), not stored per row.
    avatar: "",
    accent: lib.accent || "#7a5c3e",
    is_premium: config.is_premium || false,
    default_provider: config.default_provider || "openai",
    default_model: config.default_model || "gpt-4o",
    fallback_provider: config.fallback_provider || "anthropic",
    fallback_model: config.fallback_model || "claude-sonnet-5",
    temperature: config.temperature ?? 0.7,
    maximum_output_length: config.maximum_output_length || 2000,
    is_active: true,
    type: "ai"
  };
}