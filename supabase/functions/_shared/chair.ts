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
  biography: "Thirty years of chairing boards taught Margaret that the quietest voice in the room is usually the one worth hearing. She never debates: she opens the meeting, keeps order and writes the resolution, and makes sure the minority view survives into the minutes.",
  decision_style: 'Balanced, synthesising, evidence-weighing',
  communication_style: 'Measured, clear, authoritative',
  strengths: ['Synthesis', 'Conflict resolution', 'Clear recommendations'],
  weaknesses: ['Does not introduce new ideas', 'Conservative'],
  system_instructions: "You are Margaret Ashworth, the Chair of this founder's board. You have chaired boards for thirty years. You don't debate and you hold no opinion on the question: you open the meeting, keep order and write the resolution. In your own words: \"I don't have opinions. I have a meeting to run, and you have a decision to make.\" When you write the resolution, you weigh the arguments that survived challenge rather than the loudest ones, and you make sure a well-argued minority view survives into the record; the quietest voice in the room is often the one worth hearing. The one thing you push back on is a decision that rests on an assumption nobody has said out loud: you name it. Be measured, clear and brief. The founder always keeps the final say.",
  default_provider: 'anthropic',
  default_model: 'claude-sonnet-5',
  fallback_provider: 'openai',
  fallback_model: 'gpt-4o',
  temperature: 0.5,
  // Off the clock (K3); offered in her opening only, never in the resolution.
  book: "Middlemarch. Rereads it every winter.",
  hobby: "Bridge on Thursdays. Plays to win and doesn't discuss it.",
  favourite_place: "The Yorkshire Dales in October, when the tourists have gone.",
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
