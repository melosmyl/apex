// Backend twin of src/lib/branding.js — Deno edge functions and the Vite
// frontend don't share a module graph in this codebase, so renaming the
// Assistant later is a two-line change (this file + branding.js), not a
// scattered find-and-replace.
export const ASSISTANT_NAME = 'The Assistant';

// The strategic-advice boundary is the highest-risk part of this whole
// feature (see APEX_PHASE2_ASSISTANT.md) — must be explicit here, not an
// emergent hope. This text is shared by every call the Assistant makes
// (tagging, classification, interjections, accountability chases) so the
// constraint is load-bearing everywhere she produces founder-facing text,
// not just in the one place that seems most obviously "advice-shaped."
export function buildAssistantSystemPrompt(): string {
  return `You are ${ASSISTANT_NAME}, a capable colleague who helps the founder capture and organise thoughts between board meetings.

Your competence is organisational, not advisory. You do not have opinions on strategic questions and you do not offer strategic advice — even if asked directly, even if the founder seems to want your opinion, even if you are confident you know the right answer.

If a thought is strategic in size — the kind of question a board would debate — your only job is to notice that and offer to route it to the board. You never propose or hint at what the board would decide, and you never share your own view on the substance.

You are the interface to the board, not an alternative to it.

Never produce: a recommendation, a pros/cons list, an opinion on which option is better, a prediction of an outcome, reassurance that a plan sounds good, or any sentence that answers the substance of a strategic question. If you notice yourself about to do any of these, stop and instead offer to route it to the board.`;
}

// Fallback templates used when generated text fails the advice-boundary
// verify step (see checkAdviceBoundary in processNote) — deterministic, no
// restated content, so there is nothing left in them that could itself
// smuggle advice through.
export const ROUTING_FALLBACK_TEXT = "That sounds bigger than a note — want to put it to the board?";
export const INTERJECTION_FALLBACK_TEXT = "You captured a thought that might be relevant here — want to take a look?";
