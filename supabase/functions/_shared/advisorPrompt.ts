// The advisor prompt, shared by routeAdvisorRequest (every product call) and
// testAdvisor (the admin "Test advisor" button), which used to keep its own
// copy that had drifted: no length caps, no meeting context. The answer
// shape isn't part of it: llmCall either enforces it natively or appends it.

import { hasPersonalDetails, personalDetailsNote } from './personalDetails.ts';

// deno-lint-ignore no-explicit-any
type Advisor = any;

// Advisor rows are founder-editable, so their text goes into every call
// bounded: no one can make each call carry a book's worth of input.
const cap = (v: unknown, n: number) => String(v ?? '').slice(0, n);
const capList = (list: unknown) => (Array.isArray(list) ? list : []).slice(0, 12).map((x) => cap(x, 200));

export function buildSystemPrompt(advisor: Advisor, customInstructions: string | null | undefined,
  companyContext: string | null | undefined, meetingContext: string | null | undefined, offerPersonalDetails = false) {
  const instructions = cap(customInstructions || advisor.system_instructions || advisor.biography || `You are ${advisor.name}, a ${advisor.role}.`, 6000);
  let prompt = `You are ${cap(advisor.name, 100)}, ${cap(advisor.role, 100)}.\n\n${instructions}\n\nDecision style: ${cap(advisor.decision_style || 'Analytical', 300)}.\nCommunication style: ${cap(advisor.communication_style || 'Direct and professional', 300)}.\nStrengths: ${capList(advisor.strengths).join(', ')}.\nBlind spots: ${capList(advisor.blind_spots || advisor.weaknesses).join(', ')}.\n\n`;
  // Backstops, well above what any caller builds today.
  if (companyContext) prompt += `Company Context:\n${cap(companyContext, 40000)}\n\n`;
  if (meetingContext) prompt += `Meeting Context:\n${cap(meetingContext, 150000)}\n\n`;
  if (offerPersonalDetails && hasPersonalDetails(advisor)) prompt += `${cap(personalDetailsNote(advisor), 1500)}\n\n`;
  prompt += `You must respond with ONLY valid JSON. Do not include any text outside the JSON object.`;
  return prompt;
}

type Previous = { advisor?: string; position?: string; recommendation?: string; revised_position?: string };

export function buildUserPrompt(question: string, previousResponses?: Previous[] | null) {
  // A backstop: callers already bound what founders type, but nothing should
  // reach a model unbounded. Generous enough for the longest internal prompts.
  let prompt = `The founder asks the board: "${cap(question, 20000)}"\n\n`;
  if (previousResponses?.length) {
    prompt += `Other advisors have responded:\n`;
    previousResponses.forEach((r) => {
      if (r.position) prompt += `- ${r.advisor}: ${r.position}${r.recommendation ? ` (Recommends: ${r.recommendation})` : ''}\n`;
      else if (r.revised_position) prompt += `- ${r.advisor} (challenge): ${r.revised_position}\n`;
    });
    prompt += '\n';
  }
  prompt += `Provide your response as a JSON object.`;
  return prompt;
}
