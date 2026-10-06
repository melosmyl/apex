// The Chair: who she is on a board, and the built-in Chair for boards that
// don't have one. She opens every meeting and writes the resolution; she
// never debates. src/lib/chair.js is the browser's copy of findChair.

// deno-lint-ignore no-explicit-any
type Advisor = any;

// Oldest first, then by id: the same Chair every time, whatever order the
// database returns rows in.
function stableOrder(advisors: Advisor[]) {
  return [...advisors].sort((a, b) =>
    String(a.created_at ?? '').localeCompare(String(b.created_at ?? '')) || String(a.id ?? '').localeCompare(String(b.id ?? '')));
}

// The board's Chair: an AI advisor, the library Chair first, then one whose
// role names the chair. Never a human, whatever their title.
export function findChair(advisors: Advisor[] | null | undefined): Advisor | null {
  const ai = stableOrder((advisors || []).filter((a) => a && a.type !== 'human'));
  return ai.find((a) => a.library_key === 'chair') ?? ai.find((a) => String(a.role || '').toLowerCase().includes('chair')) ?? null;
}

// Everyone but the Chair: the advisors who debate.
export function withoutChair<T extends { id?: unknown }>(advisors: T[], chair: Advisor | null): T[] {
  return chair ? advisors.filter((a) => a.id !== chair.id) : advisors;
}

// For boards without a Chair: the library Chair (src/lib/advisorLibrary.js,
// key "chair"), on Claude with GPT-4o as backup. Sent to routeAdvisorRequest
// as an advisor_override; library_key picks up the Chair's model defaults.
export const BUILT_IN_CHAIR = {
  library_key: 'chair',
  name: 'Margaret Ashworth',
  role: 'The Chair',
  biography: 'Veteran board chair who has guided hundreds of boards through their most difficult decisions. Margaret synthesises without bias.',
  decision_style: 'Balanced, synthesising, evidence-weighing',
  communication_style: 'Measured, clear, authoritative',
  strengths: ['Synthesis', 'Conflict resolution', 'Clear recommendations'],
  weaknesses: ['Does not introduce new ideas', 'Conservative'],
  system_instructions: "You are Margaret Ashworth, a veteran board chair who has guided hundreds of boards through their most difficult decisions. You do not introduce your own opinions — your role is to synthesise the advisors' arguments accurately and fairly. Do not introduce unsupported opinions. Accurately synthesise the advisors' arguments, identify areas of genuine agreement and real disagreement, weigh evidence not rhetoric, preserve minority opinions (the dissenting voice may be right) and create a clear, actionable recommendation. You are not swayed by charisma or confidence — you are swayed by evidence and logic. The founder always retains final authority; your job is to give them the clearest possible picture to decide from.",
  default_provider: 'anthropic',
  default_model: 'claude-sonnet-5',
  fallback_provider: 'openai',
  fallback_model: 'gpt-4o',
  temperature: 0.5,
};

// What a routeAdvisorRequest call needs to speak as the Chair: her row, or
// the built-in Chair when the board has none.
export function chairCallFields(chair: Advisor | null) {
  return chair
    ? { advisor_id: chair.id, system_instructions: chair.system_instructions }
    : { advisor_override: BUILT_IN_CHAIR, system_instructions: BUILT_IN_CHAIR.system_instructions };
}

export function chairName(chair: Advisor | null): string {
  return chair?.name || BUILT_IN_CHAIR.name;
}
