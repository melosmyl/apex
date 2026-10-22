import { createClient } from 'jsr:@supabase/supabase-js@2';
import { callAdvisorWithRetry, plainUnavailableReason } from '../_shared/advisorCall.ts';
import { requireOwnedRow, checkUserLimit, accessErrorResponse } from '../_shared/access.ts';
import { CALL_DEADLINE_MS, CALLER_SAVE_MARGIN_MS } from '../_shared/callPolicy.ts';
import { DISCUSSION_SCHEMA } from '../_shared/answerSchemas.ts';
import { discussionSchema, isChallenge, personNamed, recordWords, shapedEntry, turnFlags, turnRules } from '../_shared/turnShape.ts';
import { chairCallFields, chairName, findChair, withoutChair } from '../_shared/chair.ts';
import { usedPersonalDetail, ownWords } from '../_shared/personalDetails.ts';

// Each Round 1 entry is pasted into every advisor's prompt; bound what a
// browser-edited entry (human perspectives) can add.
const MAX_ROUND1_ENTRIES = 20;
const MAX_ENTRY_CHARS = 4000;

// A Round 1 position always carries its reason (owner, 15 October 2026), and
// later rounds see the advisor's top arguments too, not only the headline.
// Answers from before the reason was asked for fall back to the first argument.
// Only a meeting with the turn shape on (owner's switch) gets either:
// any other keeps Round 1 exactly as before.
function positionWithReason(r, shaped) {
  if (!shaped) return { message: String(r.position || r.recommendation || '').slice(0, MAX_ENTRY_CHARS) };
  const args = (Array.isArray(r.key_arguments) ? r.key_arguments : []).map((a) => String(a).trim()).filter(Boolean);
  const reason = String(r.because || '').trim() || (r.unavailable ? '' : args[0] || '');
  const head = String(r.position || r.recommendation || '').trim();
  return {
    message: (reason ? `${head}\nWhy: ${reason}` : head).slice(0, MAX_ENTRY_CHARS),
    key_arguments: args.filter((a) => a !== reason).slice(0, 2).map((a) => a.slice(0, 500)),
  };
}
// A step that claimed the meeting and then died is retryable after this.
const STALE_CLAIM_MS = 10 * 60_000;
// A round isn't started with less time than this left: its answers would
// only be cut off. Covers the 20s a debater keeps back for its fallback
// model, the 5s an attempt needs, and routeAdvisorRequest's own setup.
const MIN_ROUND_MS = 30_000;
// A challenger asked again needs this long left in the round's time.
const MIN_REASK_MS = 25_000;
const CHALLENGE_AGAIN = `ASKED AGAIN: nobody in this round (above) disagreed with anyone. You hold the challenger's seat. Pick the advisor whose current position you think is weakest, name them in answering_who, say plainly where you disagree, and give your reason in because. If you honestly agree with everyone, disagree with the position you agree with least, and say why.\n`;
import { embedText, cosineSimilarity } from '../_shared/embeddings.ts';
import { companyProfile } from '../_shared/companyProfile.ts';
import { STEP_STALE_MS, challengerFor, handOver, isServiceCall, later, meetingOwner, roundsFor, unusedNotes } from '../_shared/meetingDriver.ts';
import { withFactsRule } from '../_shared/factsRule.ts';
import { withToday } from '../_shared/recordDates.ts';

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
    // A shaped turn (Workstream I) says how it stands; an older one, its type.
    const isDistinguishing = m.stance
      ? ['disagree', 'question'].includes(m.stance) || (m.stance !== 'agree' && !!m.adds) || (m.changed_opinion && m.new_position)
      : ['challenge', 'rebuttal'].includes(m.message_type) || (m.changed_opinion && m.new_position);
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
      if (msg.message_type === 'founder_message') {
        text += `THE FOUNDER (said in the meeting${msg.to_name ? `, to ${msg.to_name}` : ''}): ${msg.message}\n`;
        return;
      }
      if (msg.message_type === 'chair_tabling') {
        text += `THE CHAIR (putting the founder's point to the board): ${msg.message}\n`;
        return;
      }
      if (msg.unavailable) {
        text += `(${msg.advisor_name} couldn't give a view this round.)\n`;
        return;
      }
      const isYou = msg.advisor_id === currentAdvisorId;
      const youMarker = isYou ? ' [YOU]' : '';
      const reply = msg.reply_to_advisor ? ` (replying to ${msg.reply_to_advisor})` : '';
      const changed = msg.changed_opinion ? ' [OPINION CHANGED]' : '';
      text += `${msg.advisor_name} (${msg.role})${youMarker}${reply}${changed}: ${msg.message}\n`;
      if (msg.position && msg.round > 1) text += `  -> Position: ${msg.position}${msg.because ? ` Why: ${msg.because}` : ''}\n`;
      if (msg.adds) text += `  -> Adds: ${msg.adds}\n`;
      if (msg.changed_opinion && msg.new_position) text += `  -> New position: ${msg.new_position}\n`;
      if (msg.key_arguments?.length) text += `  -> Arguments: ${msg.key_arguments.join('; ')}\n`;
      if (msg.new_risks?.length) text += `  -> New risks: ${msg.new_risks.join('; ')}\n`;
    });
    text += '\n';
  }
  return text;
}

// What the founder said since the last round (P1), and how to treat it.
function founderSection(notes, advisor, shaped = false) {
  if (!notes?.length) return '';
  if (shaped) return shapedFounderSection(notes, advisor);
  let text = `THE FOUNDER IS IN THE ROOM. Since the last round they said:\n`;
  notes.forEach(n => {
    const toYou = n.to_advisor_id && n.to_advisor_id === advisor.id;
    text += `- "${String(n.text).slice(0, 2000)}"${toYou ? ' [asked of you directly]' : n.to_name ? ` [to ${n.to_name}]` : ' [to the board]'}\n`;
  });
  text += `How to treat it:\n`;
  text += `- A fact the founder states about their own business is a fact. Use it, and drop anything you said that it rules out.\n`;
  text += `- A view, preference or pushback from the founder is their opinion, not evidence. If you still disagree, say so plainly and why. The founder is here for honest advice, not agreement; changing your position only because the founder prefers another answer is a failure.\n`;
  text += `- If you change your position, name the new fact or reasoning that changed it. "The founder has decided" or "the founder insists" is not a reason: if that is all that has changed, keep your position and say plainly that you still disagree, then help as far as you honestly can. A change after the founder speaks is shown to the Chair and listed where the room disagreed.\n`;
  text += `- Answer the founder first: open your message by responding to what they said (or asked you directly), then carry on with the discussion. ${shaped ? 'Set answering_who to "Founder"' : 'Set reply_to_advisor to "Founder"'} when you are mainly answering the founder.\n`;
  text += `- Keep arguing with the other advisors too: the founder joined the discussion, they didn't replace it.\n\n`;
  return text;
}

// With the turn shape on (owner, 16 October 2026): a note to one advisor is
// answered by that advisor only; the others hear it as a fact in the room.
// A note to the board is put to the board by the Chair, and the advisors
// argue about it with each other. Only the advisor asked may answer the
// founder (the answer form enforces it).
function shapedFounderSection(notes, advisor) {
  const toYou = notes.find((n) => n.to_advisor_id && n.to_advisor_id === advisor.id);
  let text = `THE FOUNDER IS IN THE ROOM. Since the last round:\n`;
  notes.forEach(n => {
    const said = `"${String(n.text).slice(0, 2000)}"`;
    if (n.to_advisor_id && n.to_advisor_id === advisor.id) text += `- They asked you directly [asked of you directly]: ${said}\n`;
    else if (n.to_advisor_id) text += `- They asked ${n.to_name || 'another advisor'} [to ${n.to_name || 'another advisor'}]: ${said}. ${n.to_name || 'They'} answers it, not you.\n`;
    else text += `- They said to the board [to the board]: ${said}\n  The Chair put it to the board: "${String(n.tabled || '').slice(0, 600)}"\n`;
  });
  text += `How to treat it:\n`;
  text += `- A fact the founder states about their own business is a fact. Use it (it can be your because), and drop anything you said that it rules out.\n`;
  text += `- A view, preference or pushback from the founder is their opinion, not evidence. Changing your position only because the founder prefers another answer is a failure; a change needs a new fact or reasoning, named in change_because.\n`;
  text += toYou
    ? `- Answer them first: founder_answer is your answer to what they asked you, and answering_who is "Founder". Then carry on with the discussion.\n\n`
    : `- Don't answer the founder: that is ${notes.some((n) => !n.to_advisor_id) ? "the Chair's job, and the advisor they asked" : 'for the advisor they asked'}. Argue with the other advisors about it: your answering_who is another advisor, never the founder.\n\n`;
  return text;
}

const CHALLENGER_DUTY = `YOUR DUTY THIS ROUND — THE CHALLENGER: find the weakest point in where the room, or the founder, is heading, and press on it with evidence. Name it, say why it could fail, and what would have to be true for it to work. Don't soften it to be agreeable. If after honest scrutiny it holds up, say so, and say what would change your mind.\n\n`;

function buildDiscussionContext(advisor, transcript, round, maxRounds, isLastRound, convergencePairs, { founderNotes = [], isChallenger = false, shaped = false } = {}) {
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
    context += `- If you genuinely agree and have nothing to add beyond their reasoning, say so plainly ${shaped ? `(answering_who "${other}", stance agree, adds empty)` : `and set agrees_with to "${other}"`}. Real agreement is a legitimate, valuable outcome — it is not a failure to have a distinct opinion.\n`;
    context += `- If you actually see it differently — different risk tolerance, sequencing, cost, or what you'd do first — say so concretely, addressed to ${other} by name. A manufactured distinction to look independent is worse than honest agreement.\n\n`;
  }
  context += founderSection(founderNotes, advisor, shaped);
  if (isChallenger) context += CHALLENGER_DUTY;
  // Only the advisor a note was addressed to answers the founder.
  if (shaped) context += turnRules({ isLastRound, founderSpoke: founderNotes.some((n) => n.to_advisor_id === advisor.id) });
  if (isLastRound) {
    context += `THIS IS THE FINAL ROUND. Provide your final statement: summarise your position after the full discussion, note whether your opinion has changed and why, and state your confidence level. ${shaped ? 'If you are now in agreement with another advisor and have nothing to add, say so: answering_who is their name, stance agree, adds empty.' : 'If you are now in agreement with another advisor, say so explicitly and set agrees_with to their name.'}\n`;
  } else {
    context += `YOUR TASK: Contribute to the discussion. You may:\n`;
    context += `- Question another advisor's reasoning or ask for evidence\n- Challenge an assumption or identify a weakness\n- Defend your position against criticism\n- Change your opinion if persuaded (explain why)\n- Support another advisor's argument\n- Identify a risk nobody has mentioned\n- Introduce new information or evidence\n- Say the question itself is wrong, and name the question that should be asked instead\n\n`;
    context += `Be direct, specific, and substantive. If replying to a specific advisor, name them. Do not repeat what others have already said. Every message must add value.\n`;
  }
  return context;
}

// One advisor's call: tried once more if it fails without being refused,
// and logged here if it never reached the model (_shared/advisorCall.ts).
function callAdvisor(supabaseUrl, serviceKey, payload, opts: any = {}) {
  return callAdvisorWithRetry(supabaseUrl, serviceKey, payload, opts);
}

// A note to the board, put to the board by the Chair in one sentence (owner,
// 16 October 2026). If she can't be reached, a plain sentence does it.
async function tableNote({ supabaseUrl, serviceKey, meeting, user, chair, note, transcript }: any) {
  const plain = `The founder says: "${String(note.text).slice(0, 400)}". Where does that leave each of your positions?`;
  try {
    // Each advisor's latest position.
    const latest = new Map();
    for (const m of transcript) if (m.advisor_id && !m.unavailable && !['founder_message', 'chair_tabling'].includes(m.message_type)) latest.set(m.advisor_name, m.position || m.new_position || String(m.message).split('\nWhy: ')[0]);
    const positions = [...latest].map(([name, p]) => `- ${name}: ${String(p).slice(0, 300)}`).join('\n');
    const data = await callAdvisor(supabaseUrl, serviceKey, {
      ...chairCallFields(chair), company_id: meeting.company_id, meeting_id: meeting.id, user_id: user.id, anonymous: !!user.is_anonymous,
      company_context: null, meeting_context: `The board's positions so far:\n${positions}`,
      user_question: `The founder has just said this to the whole board, in a meeting about "${meeting.question}":\n"${String(note.text).slice(0, 2000)}"\n\nPut it to the board in ONE sentence, in your own words as Chair: what the founder said and the question it raises for the advisors to argue about. Don't answer it yourself, and don't take a side.`,
      previous_responses: [], output_schema: TABLED_SCHEMA, temperature: 0.3, request_type: 'chair_tabling', personal_details: false,
      // Its own short budget, so the advisors keep the round's time.
      deadline_at: Date.now() + TABLING_MS,
    });
    const said = String(data?.response?.tabled || '').trim();
    return said ? said.slice(0, 600) : plain;
  } catch (e) {
    console.error('The Chair could not put the note to the board:', e.message);
    return plain;
  }
}
const TABLING_MS = 25_000;
const TABLED_SCHEMA = {
  type: 'object',
  properties: { tabled: { type: 'string', description: "One sentence: the founder's point and the question it puts to the board." } },
  required: ['tabled'],
};

// One discussion round: every advisor answers, in parallel, with the
// discussion so far. Returns the round's messages (failed advisors dropped).
async function runOneRound({ db = null, supabaseUrl, serviceKey, meeting, user, meetingAdvisors, transcript, round, maxRounds, isLastRound, convergencePairs, profile, facts = '', independentResponses, roundDeadline, founderNotes = [], challenger = null }: any) {
  // The turn shape (Workstream I), when the meeting has it on: "who I'm
  // answering" can only name someone in this meeting. Otherwise today's turn.
  const shaped = !!meeting.turn_shape;
  const names = meetingAdvisors.map((a) => a.name);
  // Each advisor's own answer form: only the advisor a note was addressed to
  // may answer the founder, and nobody answers themselves.
  const ask = (advisor, { extra = '', mustDisagree = false, requestType = `discussion_round_${round}` } = {}) => {
    const meetingContext = buildDiscussionContext(advisor, transcript, round, maxRounds, isLastRound, convergencePairs,
      { founderNotes, isChallenger: !!challenger && challenger.id === advisor.id, shaped }) + extra;
    const schema = shaped ? discussionSchema(names, {
      speaker: advisor.name, allowNobody: false, mustDisagree,
      mayAnswerFounder: founderNotes.some((n) => n.to_advisor_id === advisor.id),
    }) : DISCUSSION_SCHEMA;
    return callAdvisor(supabaseUrl, serviceKey, {
      advisor_id: advisor.id, company_id: meeting.company_id, meeting_id: meeting.id, user_id: user.id, anonymous: !!user.is_anonymous,
      system_instructions: null, company_context: withFactsRule(profile), meeting_context: meetingContext,
      user_question: meeting.question, previous_responses: [], output_schema: schema,
      temperature: advisor.temperature, request_type: requestType, deadline_at: roundDeadline,
      // Their book, hobby or place stay on offer until they've used one.
      personal_details: !usedPersonalDetail(advisor, ownWords(advisor, independentResponses, transcript)),
    }, { db, provider: advisor.default_provider, model: advisor.default_model }).then(data => ({ advisor, data })).catch(err => ({ advisor, error: err.message, reason: err.reason }));
  };
  const roundResults = await Promise.all(meetingAdvisors.map((advisor) => ask(advisor)));

  // What the founder has told the board about the company, the question and
  // their notes in the meeting: a specific reason names some of it. (Not the
  // earlier meetings' advice, which would make any stock phrase count.)
  const record = recordWords(facts || '', meeting.question || '', ...founderNotes.map((n) => n.text || ''));
  // A failed advisor leaves an entry saying why (owner, 16 October 2026),
  // never counted as a turn.
  const missing = (r: any) => ({
    round, advisor_id: r.advisor.id, advisor_name: r.advisor.name, role: r.advisor.role, message: '', message_type: 'unavailable',
    unavailable: true, unavailable_reason: plainUnavailableReason(r.reason || r.error),
    ...(r.reason || r.error ? { unavailable_detail: String(r.reason || r.error).slice(0, 300) } : {}),
  });
  const toEntry = (r: any) => {
    if (r.error || !r.data?.response) return null;
    const resp = r.data.response;
    return {
      round, advisor_id: r.advisor.id, advisor_name: r.advisor.name, role: r.advisor.role,
      ...(shaped ? shapedEntry({
        ...resp,
        answering_who: personNamed(resp.answering_who, names, { speaker: r.advisor.name, founderAllowed: founderNotes.some((n) => n.to_advisor_id === r.advisor.id) }),
        moved_by: personNamed(resp.moved_by, names, { speaker: r.advisor.name, founderAllowed: true }),
      }, { speaker: r.advisor.name, isLastRound, founderSpoke: founderNotes.some((n) => n.to_advisor_id === r.advisor.id), cap: MAX_ENTRY_CHARS }) : {
        message: resp.message || '', message_type: resp.message_type || (isLastRound ? 'final_statement' : 'rebuttal'),
        reply_to_advisor: resp.reply_to_advisor || null, changed_opinion: resp.changed_opinion || false,
        new_position: resp.new_position || null, agrees_with: resp.agrees_with || null,
      }),
      new_risks: resp.new_risks || [],
      confidence_score: resp.confidence_score || 0,
      answerable: resp.answerable !== false,
      provider_used: r.data.provider_used, model_used: r.data.model_used,
      // What this turn cost, shown with it (P1).
      cost_usd: Number(r.data.cost_usd) || 0,
      ...(challenger && challenger.id === r.advisor.id ? { challenger: true } : {}),
      // Changed position in answer to the founder (P1.1): a note to the board
      // or to this advisor, and a turn that answers or names the founder.
      ...(resp.changed_opinion && founderNotes.some((n) => !n.to_advisor_id || n.to_advisor_id === r.advisor.id)
        && (/founder/i.test(resp.answering_who || resp.reply_to_advisor || '') || /founder/i.test(resp.moved_by || '') || /\bfounder/i.test(resp.message || '')) ? { after_founder_pushback: true } : {}),
    };
  };
  let entries: any[] = roundResults.map(toEntry).filter(Boolean);
  const missingEntries = roundResults.filter((r: any) => r.error || !r.data?.response).map(missing);
  // The checks: flags only, for the Chair and the minutes. A turn that
  // echoes one before it in the round is flagged, not both.
  if (!shaped) return [...entries, ...missingEntries];
  // The challenger's seat must challenge (owner, 16 October 2026): a round
  // with no turn disagreeing with a named advisor, with a reason, asks the
  // challenger once more (not the advisor a note was addressed to: their
  // answer to the founder stands), with disagreeing the only stance left.
  if (entries.length && !entries.some((e) => isChallenge(e, names)) && roundDeadline - Date.now() > MIN_REASK_MS) {
    const asked = new Set(founderNotes.map((n) => n.to_advisor_id).filter(Boolean));
    const seat = [challenger, ...meetingAdvisors].find((a) => a && !asked.has(a.id) && entries.some((e) => e.advisor_id === a.id));
    if (seat) {
      const thisRound = entries.map((e) => `- ${e.advisor_name}${e.advisor_id === seat.id ? ' (your first answer)' : ''}: ${e.position}${e.because ? ` Why: ${e.because}` : ''} [${e.stance || 'no stance'}${e.reply_to_advisor ? ` ${e.reply_to_advisor}` : ''}]`).join('\n');
      const again = toEntry(await ask(seat, { mustDisagree: true, requestType: `discussion_round_${round}_challenge`, extra: `\nTHIS ROUND SO FAR:\n${thisRound}\n${CHALLENGE_AGAIN}` }));
      const first = entries.find((e) => e.advisor_id === seat.id);
      if (again && isChallenge(again, names)) entries = entries.map((e) => (e.advisor_id === seat.id
        ? { ...again, challenge_redo: true, cost_usd: (Number(again.cost_usd) || 0) + (Number(first?.cost_usd) || 0) } : e));
    }
  }
  const earlier = transcript.filter((m) => m.round > 1 && m.round < round && !m.unavailable);
  return [...entries.map((e: any) => ({
    ...e, flags: turnFlags(e, { sameRound: entries, earlier: earlier.filter((m) => m.advisor_id !== e.advisor_id), record, isLastRound }),
  })), ...missingEntries];
}

// Previously this only looked at changed_opinion/new_risks, which stops the
// discussion exactly when two advisors quietly agree — neither needs to
// change their mind or surface a new risk to keep agreeing. That's the
// convergence bug: the loop would exit after a single discussion round in
// precisely the case that most needed more rounds. When convergence was
// flagged pre-discussion, run the full maxRounds so there's a genuine chance
// to either differentiate or explicitly confirm agreement, rather than
// exiting on silence.
function discussionSettled(roundMessages, isLastRound, convergencePairs) {
  const changes = roundMessages.filter(m => m.changed_opinion || (m.new_risks && m.new_risks.length > 0));
  return changes.length === 0 && !isLastRound && convergencePairs.length === 0;
}

// What every round of this meeting works from: the server-chosen advisors,
// the founder's profile, and Round 1 as the start of the transcript.
async function loadDiscussion(db, meeting, ownerId): Promise<any> {
  const { data: advisors } = await db.from('advisors').select('*').eq('company_id', meeting.company_id).eq('created_by_id', ownerId).limit(100);
  // What the founder has told us, so later rounds don't treat it as unknown.
  const { data: company } = await db.from('companies').select('*').eq('id', meeting.company_id).maybeSingle();
  const profile = companyProfile(company) || null;
  // The Chair doesn't debate. A meeting started before she left the debate
  // may still hold her Round 1 answer: it's dropped here, so she neither
  // speaks in later rounds nor shows as absent from them.
  const chair = findChair(advisors);
  const independentResponses = (meeting.independent_responses || [])
    .filter(r => !chair || r.advisor_id !== chair.id).slice(0, MAX_ROUND1_ENTRIES);
  if (!independentResponses.length)
    throw Object.assign(new Error('No independent responses found'), { status: 400 });

  // Only the advisors the server chose when the meeting started — never
  // whatever ids the browser-editable independent_responses list.
  const chosen = meeting.participant_advisor_ids?.length ? new Set(meeting.participant_advisor_ids) : null;
  const chosenNames = new Set(meeting.participants || []);
  const meetingAdvisors = withoutChair((advisors || []).filter(a =>
    a.type !== 'human' && (chosen ? chosen.has(a.id) : chosenNames.has(a.name))
  ), chair);
  if (!meetingAdvisors.length)
    throw Object.assign(new Error('No AI advisors available for discussion'), { status: 400 });

  const { data: limitsList } = await db.from('system_limits').select('*').order('created_at', { ascending: false }).limit(1);
  const limits = limitsList?.[0] || {};
  const maxRounds = limits.max_discussion_rounds || 3;

  // Names and roles of the board's AI advisors come from their rows, not
  // from the browser-editable entry; human perspectives are bounded.
  const byId = new Map<string, any>((advisors || []).map(a => [a.id, a]));
  const clampScore = (n) => Math.max(0, Math.min(100, Number(n) || 0));
  const roundOne = independentResponses.map(r => ({
    round: 1, advisor_id: r.advisor_id,
    advisor_name: String(byId.get(r.advisor_id)?.name ?? r.advisor_name ?? '').slice(0, 100),
    role: String(byId.get(r.advisor_id)?.role ?? r.role ?? '').slice(0, 100),
    ...positionWithReason(r, !!meeting.turn_shape), message_type: 'initial',
    ...(meeting.turn_shape && r.would_change_my_mind ? { would_change_my_mind: String(r.would_change_my_mind).slice(0, 500) } : {}),
    reply_to_advisor: null, changed_opinion: false, new_position: null,
    new_risks: (r.risks || []).slice(0, 10).map(x => String(x).slice(0, 500)), confidence_score: clampScore(r.confidence_score),
    provider_used: r.provider_used, model_used: r.model_used,
    unavailable: r.unavailable || false,
    // Plain words only: records from before kept the technical detail here.
    ...(r.unavailable ? { unavailable_reason: plainUnavailableReason(r.unavailable_reason) } : {}),
    ...(Number.isFinite(Number(r.cost_usd)) && r.cost_usd != null ? { cost_usd: Number(r.cost_usd) } : {}),
    ...(r.redone_after ? { redone_after: String(r.redone_after).slice(0, 100) } : {}),
  }));

  // The server-chosen AI advisors plus the company's human advisors, all
  // named from their rows: the entries themselves are browser-editable.
  const meetingAdvisorIds = new Set(meetingAdvisors.map(a => a.id));
  const convergenceInput = independentResponses
    .filter(r => meetingAdvisorIds.has(r.advisor_id) || byId.get(r.advisor_id)?.type === 'human')
    .map(r => ({ advisor_name: byId.get(r.advisor_id).name, recommendation: String(r.recommendation || '').slice(0, 2000) }));

  return { profile, independentResponses, meetingAdvisors, maxRounds, roundOne, convergenceInput, chair };
}

// A server-run meeting (P0): one round per step. Takes the next round,
// answers at once, runs the round in the background, then hands over to
// meetingRun for the next round or the resolution.
async function serverRound(db, supabaseUrl, serviceKey, meeting, user) {
  const completed = Math.max(1, meeting.discussion_rounds_completed || 0);
  const round = completed + 1;
  const claimedAt = new Date().toISOString();
  const staleBefore = new Date(Date.now() - STEP_STALE_MS).toISOString();
  let claim = db.from('board_meetings')
    .update({ status: 'discussing', step_claimed_at: claimedAt, step_attempts: (meeting.step_attempts || 0) + 1 })
    .eq('id', meeting.id).eq('step_attempts', meeting.step_attempts || 0).eq('awaiting_human_input', false)
    .or(`status.eq.independent_complete,and(status.eq.discussing,step_claimed_at.is.null),and(status.eq.discussing,step_claimed_at.lt.${staleBefore})`);
  claim = meeting.discussion_rounds_completed == null ? claim.is('discussion_rounds_completed', null) : claim.eq('discussion_rounds_completed', meeting.discussion_rounds_completed);
  const { data: claimed } = await claim.select('id, founder_notes');
  if (!claimed?.length) return { started: false };
  // The notes as they were when this round took the step: one withdrawn
  // just before is left out.
  meeting = { ...meeting, founder_notes: claimed[0].founder_notes };

  later((async () => {
    const startedAt = Date.now();
    try {
      const d = await loadDiscussion(db, meeting, user.id);
      let convergencePairs: any = meeting.convergence_candidates;
      if (!Array.isArray(convergencePairs)) {
        convergencePairs = await detectConvergence(d.convergenceInput);
        await db.from('board_meetings').update({ convergence_candidates: convergencePairs }).eq('id', meeting.id);
      }
      const transcript = meeting.discussion_transcript?.length ? meeting.discussion_transcript : d.roundOne;
      const maxRounds = roundsFor(d.maxRounds, meeting);
      const isLastRound = round >= maxRounds;
      // What the founder said since the last round goes into this one, and
      // into the transcript just before the advisors' answers. With the turn
      // shape on, one note a round (owner, 16 October 2026): a second waits
      // for the round after, and a note to the board is put to the board by
      // the Chair first.
      const unused = unusedNotes({ ...meeting, discussion_transcript: transcript });
      const notes = meeting.turn_shape ? unused.slice(0, 1) : unused;
      if (meeting.turn_shape && round <= maxRounds) {
        for (const n of notes) if (!n.to_advisor_id) n.tabled = await tableNote({ supabaseUrl, serviceKey, meeting, user, chair: d.chair, note: n, transcript });
      }
      const founderEntries = notes.flatMap(n => [{
        round, advisor_id: null, advisor_name: 'Founder', role: 'Founder', message: n.text, message_type: 'founder_message',
        note_id: n.id, to_advisor_id: n.to_advisor_id || null, to_name: n.to_name || null, reply_to_advisor: n.to_name || null,
      }, ...(n.tabled ? [{
        round, advisor_id: d.chair?.id || null, advisor_name: chairName(d.chair), role: 'The Chair', message: n.tabled,
        message_type: 'chair_tabling', tabled_note_id: n.id,
      }] : [])]);
      const roundMessages = round > maxRounds ? [] : await runOneRound({
        db, supabaseUrl, serviceKey, meeting, user, meetingAdvisors: d.meetingAdvisors, transcript, round, maxRounds,
        isLastRound, convergencePairs, independentResponses: d.independentResponses,
        // Every round works from the same memory as Round 1, not just the profile.
        profile: withToday(meeting.context_package) || d.profile, facts: d.profile,
        founderNotes: notes, challenger: challengerFor(d.meetingAdvisors, round),
        // Each round is its own step, with the whole step's time.
        roundDeadline: startedAt + CALL_DEADLINE_MS - CALLER_SAVE_MARGIN_MS,
      });
      // A round nobody answered hasn't taken the founder's notes: they go on
      // to the next round, or to the Chair.
      // A round counts once someone answered; a missing advisor's entry
      // (saying why) isn't an answer.
      const answered = roundMessages.filter((m) => !m.unavailable);
      const next = answered.length ? [...transcript, ...founderEntries, ...roundMessages] : [...transcript, ...roundMessages];
      // What the founder did while this round ran (asked for the decision,
      // asked for another round, said something new) decides what's next.
      // The save holds only if none of that changed since it was read;
      // otherwise read again and decide again.
      let saved = null;
      for (let tries = 0; tries < 3 && !saved?.length; tries++) {
        const { data: fresh } = await db.from('board_meetings').select('founder_notes, decide_now, rounds_target').eq('id', meeting.id).maybeSingle();
        const pending = unusedNotes({ founder_notes: fresh?.founder_notes, discussion_transcript: next });
        const target = roundsFor(d.maxRounds, fresh);
        // Settled early only if the founder neither spoke nor asked to go further.
        const belowAsked = Number.isInteger(fresh?.rounds_target) && round < fresh.rounds_target;
        const done = !!fresh?.decide_now || round >= target || !answered.length
          || (discussionSettled(answered, isLastRound, convergencePairs) && !founderEntries.length && !pending.length && !belowAsked);
        let save = db.from('board_meetings').update({
          discussion_transcript: next, step_finished_at: new Date().toISOString(),
          // Sit in: the meeting stops after every round, the last one too,
          // until the founder acts. Not when they've asked for the decision.
          waiting_for_founder: meeting.pace === 'sit_in' && !fresh?.decide_now,
          ...(answered.length ? { discussion_rounds_completed: round } : {}),
          status: done ? 'discussion_complete' : 'discussing',
          step_claimed_at: null, step_attempts: 0, sweep_count: 0,
          ...(done ? { convergence: convergencePairs.filter(p => stillConverged(p, next)).map(p => ({ advisors: p.names })) } : {}),
        }).eq('id', meeting.id).eq('status', 'discussing').eq('step_claimed_at', claimedAt);
        // The last try saves whatever it decided, so the round is never left held.
        if (tries < 2) {
          save = save.eq('decide_now', !!fresh?.decide_now);
          save = fresh?.rounds_target == null ? save.is('rounds_target', null) : save.eq('rounds_target', fresh.rounds_target);
        }
        ({ data: saved } = await save.select('id'));
        // A change by the founder makes the save miss; a lost claim does too,
        // and then there's nothing left to do.
        const { data: still } = saved?.length ? { data: null } : await db.from('board_meetings').select('id').eq('id', meeting.id).eq('status', 'discussing').eq('step_claimed_at', claimedAt).maybeSingle();
        if (!saved?.length && !still) break;
      }
      if (saved?.length) handOver(meeting.id);
    } catch (e) {
      // Let go of the round; the sweep tries it again (up to the limit).
      console.error(`runBoardDiscussion: round ${round} failed:`, e.message);
      await db.from('board_meetings').update({ step_claimed_at: null, step_finished_at: new Date().toISOString() })
        .eq('id', meeting.id).eq('status', 'discussing').eq('step_claimed_at', claimedAt);
    }
  })(), `discussion round ${round}`);
  return { started: true, round };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const startedAt = Date.now();
  let claimedMeetingId = null;
  let dbForRelease = null;
  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    const db = createClient(supabaseUrl, serviceKey);
    const { meeting_id } = await req.json();
    if (!meeting_id) return Response.json({ error: 'meeting_id is required' }, { status: 400, headers: corsHeaders });

    // The server moving its own meeting on (meetingRun), as the owner.
    if (isServiceCall(req)) {
      const { data: meeting } = await db.from('board_meetings').select('*').eq('id', meeting_id).maybeSingle();
      if (!meeting || meeting.driver !== 'server') return Response.json({ error: 'Not a server-run meeting' }, { status: 409, headers: corsHeaders });
      const owner = await meetingOwner(db, meeting.created_by_id);
      return Response.json(await serverRound(db, supabaseUrl, serviceKey, meeting, owner), { headers: corsHeaders });
    }

    const authClient = createClient(
      Deno.env.get('SUPABASE_URL'),
      Deno.env.get('SUPABASE_ANON_KEY'),
      { global: { headers: { Authorization: req.headers.get('Authorization') } } }
    );
    const { data: { user }, error: authErr } = await authClient.auth.getUser();
    if (authErr || !user) return Response.json({ error: 'Unauthorized' }, { status: 401, headers: corsHeaders });

    const meeting = await requireOwnedRow(db, 'board_meetings', meeting_id, user.id);
    // The server runs this meeting itself; the page only watches.
    if (meeting.driver === 'server')
      return Response.json({ error: 'This meeting is moving on by itself.' }, { status: 409, headers: corsHeaders });
    await checkUserLimit(db, user.id, 'meeting_step');

    // Runs once, straight after Round 1. Claimed atomically, so parallel
    // requests can't each run the paid rounds; a failed run hands the
    // meeting back to independent_complete so it can be retried.
    const staleBefore = new Date(Date.now() - STALE_CLAIM_MS).toISOString();
    const { data: claimed } = await db.from('board_meetings').update({ status: 'discussing' })
      .eq('id', meeting.id)
      .or(`status.eq.independent_complete,and(status.eq.discussing,updated_at.lt.${staleBefore})`)
      .select('id');
    if (!claimed?.length)
      return Response.json({ error: 'This meeting has already moved past the discussion.' }, { status: 409, headers: corsHeaders });
    claimedMeetingId = meeting.id;
    dbForRelease = db;

    const d = await loadDiscussion(db, meeting, user.id);
    const { maxRounds } = d;
    let transcript = d.roundOne;
    const convergencePairs = await detectConvergence(d.convergenceInput);

    // A meeting run by the page: every round inside this one request, each
    // getting an equal share of the time left; a round that couldn't finish
    // isn't started. (A server-run meeting gives each round its own step.)
    const stepDeadline = startedAt + CALL_DEADLINE_MS - CALLER_SAVE_MARGIN_MS;
    for (let round = 2; round <= maxRounds; round++) {
      const timeLeft = stepDeadline - Date.now();
      if (timeLeft < MIN_ROUND_MS) {
        console.error(`runBoardDiscussion: stopping before round ${round} of ${maxRounds}, ${Math.round(timeLeft / 1000)}s left`);
        break;
      }
      const roundShare = Math.floor(timeLeft / (maxRounds - round + 1));
      const roundDeadline = Date.now() + roundShare;
      // If no round can follow this one in the time left, this one gets the
      // final-round instructions, so the discussion still closes properly.
      const isLastRound = round === maxRounds || timeLeft - roundShare < MIN_ROUND_MS;

      const roundMessages = await runOneRound({
        db, supabaseUrl, serviceKey, meeting, user, meetingAdvisors: d.meetingAdvisors, transcript, round, maxRounds,
        isLastRound, convergencePairs, profile: d.profile, facts: d.profile, independentResponses: d.independentResponses, roundDeadline,
      });

      if (!roundMessages.some((m) => !m.unavailable)) {
        // Nobody answered: the record still says why, and the discussion ends.
        if (roundMessages.length) {
          transcript = [...transcript, ...roundMessages];
          await db.from('board_meetings').update({ discussion_transcript: transcript }).eq('id', meeting.id);
        }
        break;
      }
      transcript = [...transcript, ...roundMessages];

      await db.from('board_meetings').update({
        discussion_transcript: transcript, discussion_rounds_completed: round,
      }).eq('id', meeting.id);

      if (discussionSettled(roundMessages.filter((m) => !m.unavailable), isLastRound, convergencePairs)) break;
    }

    const finalConvergence = convergencePairs.filter(p => stillConverged(p, transcript));

    await db.from('board_meetings').update({
      status: 'discussion_complete', discussion_transcript: transcript,
      convergence: finalConvergence.map(p => ({ advisors: p.names })),
    }).eq('id', meeting.id).eq('status', 'discussing');
    claimedMeetingId = null;

    return Response.json({
      meeting_id: meeting.id, status: 'discussion_complete', discussion_transcript: transcript,
      convergence: finalConvergence.map(p => ({ advisors: p.names })),
    }, { headers: corsHeaders });
  } catch (error) {
    if (claimedMeetingId && dbForRelease) {
      await dbForRelease.from('board_meetings').update({ status: 'independent_complete' })
        .eq('id', claimedMeetingId).eq('status', 'discussing');
    }
    const denied = accessErrorResponse(error, corsHeaders);
    if (denied) return denied;
    if (error.status === 400) return Response.json({ error: error.message }, { status: 400, headers: corsHeaders });
    console.error('runBoardDiscussion error:', error);
    return Response.json({ error: error.message }, { status: 500, headers: corsHeaders });
  }
});
