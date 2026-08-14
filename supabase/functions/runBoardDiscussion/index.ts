import { createClient } from 'jsr:@supabase/supabase-js@2';
import { embedText, cosineSimilarity } from '../_shared/embeddings.ts';

// Round 1 runs every advisor independently and in parallel (see
// startBoardMeeting) — nothing stops two advisors reaching for the same
// generic-but-plausible answer there. This is the check for that: embed
// each advisor's round-1 recommendation and flag pairs whose recommendations
// are near-identical, so round 2 can ask them to address it directly rather
// than silently restating the same thing past each other for the rest of
// the discussion.
const CONVERGENCE_THRESHOLD = 0.90;

async function detectConvergence(independentResponses) {
  const withText = independentResponses.filter(r => (r.recommendation || '').trim());
  if (withText.length < 2) return [];

  let embeddings;
  try {
    embeddings = await Promise.all(withText.map(r => embedText(r.recommendation)));
  } catch (e) {
    console.error('Convergence detection skipped (embedding failed):', e.message);
    return [];
  }

  const pairs = [];
  for (let i = 0; i < withText.length; i++) {
    for (let j = i + 1; j < withText.length; j++) {
      const sim = cosineSimilarity(embeddings[i], embeddings[j]);
      if (sim >= CONVERGENCE_THRESHOLD) {
        pairs.push({ names: [withText[i].advisor_name, withText[j].advisor_name], similarity: sim });
      }
    }
  }
  return pairs;
}

// A candidate pair (flagged from round-1 similarity) survives to the final
// "converged" list unless one of them actually differentiated during
// discussion — a challenge/rebuttal aimed at the other, or a changed
// opinion with a genuinely new position. No differentiation found across
// the whole discussion means they really did just say the same thing in
// parallel, which is the case worth presenting once, not twice.
function stillConverged(pair, transcript) {
  const [nameA, nameB] = pair.names;
  const laterMessages = transcript.filter(m => m.round > 1 && (m.advisor_name === nameA || m.advisor_name === nameB));
  const differentiated = laterMessages.some(m => {
    const other = m.advisor_name === nameA ? nameB : nameA;
    const addressedOther = m.reply_to_advisor === other;
    const isDistinguishing = ['challenge', 'rebuttal'].includes(m.message_type) || (m.changed_opinion && m.new_position);
    return addressedOther && isDistinguishing;
  });
  return !differentiated;
}

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const DISCUSSION_PRINCIPLES = `DISCUSSION PRINCIPLES:
- Prioritise truth over harmony. The board exists to find the best decision, not to make everyone feel good.
- If you believe another advisor is wrong, say so clearly and explain why.
- If you believe the founder's premise has a flaw, raise it respectfully.
- Challenge every assumption. Ask: "What evidence supports this?" "What would make you completely change your opinion?" "Have we considered the opportunity cost?" "What is the strongest argument against your position?"
- If someone challenges you, do NOT automatically change your opinion. Defend it, clarify it, strengthen it — or admit you were wrong. Changing your mind is intelligent, not weak.
- Do NOT be agreeable. If everyone agrees too quickly, the discussion was not deep enough. Healthy disagreement is encouraged.
- Do NOT generate filler. Every message must add value: introduce evidence, challenge reasoning, clarify assumptions, offer alternatives, identify blind spots, or resolve disagreements.

SPECIFICITY — this is a hard requirement:
- Every recommendation must name something the founder could actually do this week. Who to call. What to write. Which number to look up. Which customer to ask.
- "Validate demand", "consider your positioning", "think about pricing" are not recommendations. They are categories of recommendation. Name the specific action inside the category.
- If you genuinely cannot name a concrete next action, say so and explain what information would make one possible. That is a useful contribution. A vague recommendation is not.
- Prefer the smallest real action over the most impressive-sounding one. "Call the six people who enquired last month and ask what stopped them" beats "conduct customer discovery research."

QUESTION QUALITY:
- Sometimes the most useful thing a board can do is tell the founder they are asking the wrong question. If the question hides a more important unresolved decision, say so directly and name the better question.
- Do not do this to avoid answering. Only when the original question genuinely cannot be answered well until something upstream is resolved.
- If you reframe the question, still address the original as best you can — the founder asked it for a reason.

HONEST UNCERTAINTY:
- "I don't know, and here is what would tell us" is a legitimate and valuable position. Take it when it is true.
- Do not manufacture a recommendation to appear useful. If the honest answer is that there is not enough information, say that, name the specific missing information, and say how the founder could get it.
- A low confidence score is not a substitute for saying this plainly. If you would not act on your own recommendation, say so.`;

function formatTranscript(transcript, currentAdvisorId) {
  const byRound = {};
  transcript.forEach(msg => {
    if (!byRound[msg.round]) byRound[msg.round] = [];
    byRound[msg.round].push(msg);
  });
  let text = '';
  for (const round of Object.keys(byRound).sort((a, b) => Number(a) - Number(b))) {
    const roundNum = Number(round);
    const msgs = byRound[round];
    text += `--- Round ${roundNum}${roundNum === 1 ? ' (Independent Positions)' : ' (Discussion)'} ---\n`;
    msgs.forEach(msg => {
      const isYou = msg.advisor_id === currentAdvisorId;
      const youMarker = isYou ? ' [YOU]' : '';
      const reply = msg.reply_to_advisor ? ` (replying to ${msg.reply_to_advisor})` : '';
      const changed = msg.changed_opinion ? ' [OPINION CHANGED]' : '';
      text += `${msg.advisor_name} (${msg.role})${youMarker}${reply}${changed}: ${msg.message}\n`;
      if (msg.changed_opinion && msg.new_position) text += `  -> New position: ${msg.new_position}\n`;
      if (msg.new_risks?.length) text += `  -> New risks: ${msg.new_risks.join('; ')}\n`;
    });
    text += '\n';
  }
  return text;
}

function buildDiscussionContext(advisor, transcript, round, maxRounds, isLastRound, convergencePairs) {
  const ownInitial = transcript.find(m => m.advisor_id === advisor.id && m.round === 1);
  let context = `=== EXECUTIVE BOARD DISCUSSION ===\n`;
  context += `You are in Round ${round} of ${maxRounds} of a structured board discussion.\n\n`;
  context += DISCUSSION_PRINCIPLES + '\n\n';
  if (ownInitial) {
    context += `YOUR INITIAL POSITION (from Round 1):\n${ownInitial.message}\nConfidence: ${ownInitial.confidence_score}%\n\n`;
  }
  const priorTranscript = transcript.filter(m => m.round < round);
  if (priorTranscript.length) {
    context += `DISCUSSION SO FAR:\n${formatTranscript(priorTranscript, advisor.id)}\n`;
  }
  // Raised only in round 2, once, right when it's actionable — round 1 is
  // deliberately independent (see startBoardMeeting) so this can't be known
  // any earlier, and repeating it every round would just be noise once
  // it's been addressed.
  const ownPair = round === 2 ? (convergencePairs || []).find(p => p.names.includes(advisor.name)) : null;
  if (ownPair) {
    const other = ownPair.names.find(n => n !== advisor.name);
    context += `NOTE: your independent recommendation landed very close to ${other}'s. Do exactly one of two things about this — do not do both, and do not invent a difference that isn't real:\n`;
    context += `- If you genuinely agree and have nothing to add beyond their reasoning, say so plainly and set agrees_with to "${other}". Real agreement is a legitimate, valuable outcome — it is not a failure to have a distinct opinion.\n`;
    context += `- If you actually see it differently — different risk tolerance, sequencing, cost, or what you'd do first — say so concretely, addressed to ${other} by name. A manufactured distinction to look independent is worse than honest agreement.\n\n`;
  }
  if (isLastRound) {
    context += `THIS IS THE FINAL ROUND. Provide your final statement: summarise your position after the full discussion, note whether your opinion has changed and why, and state your confidence level. If you are now in agreement with another advisor, say so explicitly and set agrees_with to their name.\n`;
  } else {
    context += `YOUR TASK: Contribute to the discussion. You may:\n`;
    context += `- Question another advisor's reasoning or ask for evidence\n- Challenge an assumption or identify a weakness\n- Defend your position against criticism\n- Change your opinion if persuaded (explain why)\n- Support another advisor's argument\n- Identify a risk nobody has mentioned\n- Introduce new information or evidence\n- Say the question itself is wrong, and name the question that should be asked instead\n\n`;
    context += `Be direct, specific, and substantive. If replying to a specific advisor, name them. Do not repeat what others have already said. Every message must add value.\n`;
  }
  return context;
}

async function callAdvisor(supabaseUrl, serviceKey, payload) {
  const res = await fetch(`${supabaseUrl}/functions/v1/routeAdvisorRequest`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${serviceKey}` },
    body: JSON.stringify(payload),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || `routeAdvisorRequest failed (${res.status})`);
  return data;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const authClient = createClient(
      Deno.env.get('SUPABASE_URL'),
      Deno.env.get('SUPABASE_ANON_KEY'),
      { global: { headers: { Authorization: req.headers.get('Authorization') } } }
    );
    const { data: { user }, error: authErr } = await authClient.auth.getUser();
    if (authErr || !user) return Response.json({ error: 'Unauthorized' }, { status: 401, headers: corsHeaders });

    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    const db = createClient(supabaseUrl, serviceKey);

    const { meeting_id } = await req.json();
    if (!meeting_id) return Response.json({ error: 'meeting_id is required' }, { status: 400, headers: corsHeaders });

    const { data: meeting } = await db.from('board_meetings').select('*').eq('id', meeting_id).single();
    if (!meeting) return Response.json({ error: 'Meeting not found' }, { status: 404, headers: corsHeaders });

    const independentResponses = meeting.independent_responses || [];
    if (!independentResponses.length)
      return Response.json({ error: 'No independent responses found' }, { status: 400, headers: corsHeaders });

    const { data: advisors } = await db.from('advisors').select('*').eq('company_id', meeting.company_id).limit(100);
    const meetingAdvisors = (advisors || []).filter(a =>
      independentResponses.some(r => r.advisor_id === a.id) && a.type !== 'human'
    );
    if (!meetingAdvisors.length)
      return Response.json({ error: 'No AI advisors available for discussion' }, { status: 400, headers: corsHeaders });

    const { data: limitsList } = await db.from('system_limits').select('*').order('created_at', { ascending: false }).limit(1);
    const limits = limitsList?.[0] || {};
    const maxRounds = limits.max_discussion_rounds || 3;

    let transcript = independentResponses.map(r => ({
      round: 1, advisor_id: r.advisor_id, advisor_name: r.advisor_name, role: r.role,
      message: r.position || r.recommendation || '', message_type: 'initial',
      reply_to_advisor: null, changed_opinion: false, new_position: null,
      new_risks: r.risks || [], confidence_score: r.confidence_score || 0,
      provider_used: r.provider_used, model_used: r.model_used,
      unavailable: r.unavailable || false,
    }));

    const discussionSchema = {
      type: 'object',
      properties: {
        message: { type: 'string', description: 'Your contribution to the board discussion. Be specific, critical, and substantive. Speak naturally as you would in a real board room.' },
        message_type: { type: 'string', enum: ['question', 'challenge', 'defense', 'rebuttal', 'support', 'new_information', 'risk_identified', 'opinion_changed', 'final_statement'], description: 'The primary nature of your contribution' },
        reply_to_advisor: { type: 'string', description: 'Name of the advisor you are primarily responding to. Leave empty if addressing the board generally.' },
        changed_opinion: { type: 'boolean', description: 'Whether this discussion has changed your position from your initial independent response' },
        new_position: { type: 'string', description: 'If you changed your opinion, state your new position. Leave empty if unchanged.' },
        new_risks: { type: 'array', items: { type: 'string' }, description: 'Any new risks or blind spots you have identified that have not been mentioned yet' },
        confidence_score: { type: 'number', description: 'Your current confidence in your recommendation, 0-100' },
        answerable: { type: 'boolean', description: 'false if the question genuinely cannot be answered well without missing information — see HONEST UNCERTAINTY. true otherwise (the default).' },
        agrees_with: { type: 'string', description: 'Name of another advisor whose position you now fully agree with and have nothing to add to. Leave empty if you have your own distinct view — do not fill this in just to seem cooperative.' },
      },
      required: ['message', 'message_type', 'confidence_score'],
    };

    const convergencePairs = await detectConvergence(independentResponses);

    for (let round = 2; round <= maxRounds; round++) {
      const isLastRound = round === maxRounds;

      const roundResults = await Promise.all(meetingAdvisors.map(advisor => {
        const meetingContext = buildDiscussionContext(advisor, transcript, round, maxRounds, isLastRound, convergencePairs);
        return callAdvisor(supabaseUrl, serviceKey, {
          advisor_id: advisor.id, company_id: meeting.company_id, meeting_id: meeting.id, user_id: user.id,
          system_instructions: null, company_context: null, meeting_context: meetingContext,
          user_question: meeting.question, previous_responses: [], output_schema: discussionSchema,
          temperature: advisor.temperature, max_output_length: advisor.maximum_output_length,
          request_type: `discussion_round_${round}`,
        }).then(data => ({ advisor, data })).catch(err => ({ advisor, error: err.message }));
      }));

      const roundMessages = roundResults.map(r => {
        if (r.error || !r.data?.response) return null;
        const resp = r.data.response;
        return {
          round, advisor_id: r.advisor.id, advisor_name: r.advisor.name, role: r.advisor.role,
          message: resp.message || '', message_type: resp.message_type || (isLastRound ? 'final_statement' : 'rebuttal'),
          reply_to_advisor: resp.reply_to_advisor || null, changed_opinion: resp.changed_opinion || false,
          new_position: resp.new_position || null, new_risks: resp.new_risks || [],
          confidence_score: resp.confidence_score || 0,
          answerable: resp.answerable !== false,
          agrees_with: resp.agrees_with || null,
          provider_used: r.data.provider_used, model_used: r.data.model_used,
        };
      }).filter(Boolean);

      if (!roundMessages.length) break;
      transcript = [...transcript, ...roundMessages];

      await db.from('board_meetings').update({
        discussion_transcript: transcript, discussion_rounds_completed: round,
      }).eq('id', meeting.id);

      // Previously this only looked at changed_opinion/new_risks, which
      // stops the discussion exactly when two advisors quietly agree —
      // neither needs to change their mind or surface a new risk to keep
      // agreeing. That's the convergence bug: the loop would exit after a
      // single discussion round in precisely the case that most needed
      // more rounds. When convergence was flagged pre-discussion, run the
      // full maxRounds so there's a genuine chance to either differentiate
      // or explicitly confirm agreement, rather than exiting on silence.
      const changes = roundMessages.filter(m => m.changed_opinion || (m.new_risks && m.new_risks.length > 0));
      if (changes.length === 0 && !isLastRound && convergencePairs.length === 0) break;
    }

    const finalConvergence = convergencePairs.filter(p => stillConverged(p, transcript));

    await db.from('board_meetings').update({
      status: 'discussion_complete', discussion_transcript: transcript,
      convergence: finalConvergence.map(p => ({ advisors: p.names })),
    }).eq('id', meeting.id);

    return Response.json({
      meeting_id: meeting.id, status: 'discussion_complete', discussion_transcript: transcript,
      convergence: finalConvergence.map(p => ({ advisors: p.names })),
    }, { headers: corsHeaders });
  } catch (error) {
    console.error('runBoardDiscussion error:', error);
    return Response.json({ error: error.message }, { status: 500, headers: corsHeaders });
  }
});
