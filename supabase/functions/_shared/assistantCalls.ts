// Shared by every edge function that speaks as the Assistant (processNote,
// checkNoteRelevance, prepareAccountabilityChases) — one place for the
// routeAdvisorRequest call shape and the verify-then-ship advice-boundary
// check, so the highest-risk part of this feature (see
// buildAssistantSystemPrompt) is enforced identically everywhere she
// produces founder-facing text, not reimplemented per call site.
import { ASSISTANT_NAME, buildAssistantSystemPrompt } from './assistantPersona.ts';

export const ADVICE_CHECK_SCHEMA = {
  type: 'object',
  properties: { contains_advice: { type: 'boolean' } },
  required: ['contains_advice'],
};

export async function callAssistant(supabaseUrl, serviceKey, { user_question, output_schema, request_type, user_id, company_id }) {
  const res = await fetch(`${supabaseUrl}/functions/v1/routeAdvisorRequest`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${serviceKey}` },
    body: JSON.stringify({
      advisor_override: { name: ASSISTANT_NAME, role: 'Assistant', system_instructions: buildAssistantSystemPrompt() },
      company_id, user_id, user_question, previous_responses: [],
      output_schema, model_tier: 'cheap', temperature: 0.3, max_output_length: 400,
      request_type,
    }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || `routeAdvisorRequest failed (${res.status})`);
  return data.response;
}

// Verify-then-ship, reasoned from startBoardMeeting's buildChairOpening
// precedent: that mechanism checks a known literal string; this has no
// fixed string to check, so it needs a second cheap classification call
// instead. Fails closed — any error, or an ambiguous/missing result, is
// treated as unsafe, same as a positive detection.
export async function containsAdvice(supabaseUrl, serviceKey, { text, user_id, company_id }) {
  try {
    const result = await callAssistant(supabaseUrl, serviceKey, {
      user_question: `Does the following text give strategic advice, share an opinion, make a recommendation, or otherwise answer the substance of a strategic question — rather than simply, neutrally offering to route it to the board or noting something is relevant?\n\nText: "${text}"`,
      output_schema: ADVICE_CHECK_SCHEMA, request_type: 'assistant_advice_check', user_id, company_id,
    });
    return result?.contains_advice !== false;
  } catch {
    return true;
  }
}

// The shared per-user-per-day interjection budget (resurfacing +
// accountability chase + welcome-back, NOT routing prompts — those are a
// direct response to what the founder just typed, exempt by design). Checked
// server-side, before any LLM call, so a budget that's already spent for
// the day never costs anything to re-discover.
const INTERJECTION_EVENT_TYPES = ['interjection_shown', 'accountability_chase_shown', 'welcome_back_shown', 'tree_unlock_shown'];

export async function interjectionBudgetSpent(db, userId) {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { data } = await db.from('assistant_events')
    .select('id').eq('user_id', userId).in('event_type', INTERJECTION_EVENT_TYPES)
    .gt('created_at', since).limit(1);
  return !!data?.length;
}
